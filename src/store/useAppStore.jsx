import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { recipes, recipeById } from '../data/recipes'
import { todayISO, resolveField, dayChanged, setToArray, arrayToSet, loadLS, saveLS } from './storeLogic'

const AppStoreContext = createContext(null)

const DEFAULT_GOALS = { calories: 1800, protein: 180, carbs: 200, fat: 60 }

const DEFAULT_WEEK_PLAN = (() => {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const SEED = [[1,2],[3,4],[5,6],[7,8],[9,10],[11,null],[12,null]]
  return days.map((day, i) => ({ day, ids: SEED[i] }))
})()

export function AppStoreProvider({ children }) {
  const [user,          setUser]          = useState(undefined)   // undefined = loading
  const [goals,         setGoalsState]    = useState(DEFAULT_GOALS)
  const [mealLog,       setMealLog]       = useState([])
  const [weekPlan,      setWeekPlan]      = useState(DEFAULT_WEEK_PLAN)
  const [favorites,     setFavorites]     = useState(new Set())
  const [groceryChecks, setGroceryChecks] = useState(new Set())
  /* { [what]: detail } — one slot per writer, so a successful write
     never clears another writer's failure. */
  const [syncErrors,    setSyncErrors]    = useState({})
  /* WHICH DAY `mealLog` BELONGS TO. Not cosmetic: without it, an app
     left open past midnight would append tonight's meals to yesterday's
     loaded log and write the result under today's date, merging two
     days. Reading todayISO() at write time alone would have introduced
     exactly that. */
  const [logDate,       setLogDate]       = useState(todayISO)

  // Load from localStorage (offline/no-auth path)
  function loadFromLS(date) {
    setGoalsState(loadLS('prepiq_goals', DEFAULT_GOALS))
    setMealLog(loadLS(`prepiq_log_${date}`, []))
    setWeekPlan(loadLS('prepiq_weekplan', DEFAULT_WEEK_PLAN))
    setFavorites(arrayToSet(loadLS('prepiq_favorites', [])))
    setGroceryChecks(arrayToSet(loadLS('prepiq_grocery', [])))
  }

  // Load from Firestore
  async function loadFromFirestore(uid, date) {
    try {
      const [goalsSnap, logSnap, planSnap, favSnap, grocSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'profile', 'goals')),
        getDoc(doc(db, 'users', uid, 'logs', date)),
        getDoc(doc(db, 'users', uid, 'weekPlan', 'current')),
        getDoc(doc(db, 'users', uid, 'profile', 'favorites')),
        getDoc(doc(db, 'users', uid, 'grocery', 'checks')),
      ])
      const g = goalsSnap.exists() ? goalsSnap.data() : null
      const l = logSnap.exists()   ? logSnap.data().meals  : null
      const p = planSnap.exists()  ? planSnap.data().days  : null
      const f = favSnap.exists()   ? favSnap.data().ids    : null
      const c = grocSnap.exists()  ? grocSnap.data().ids   : null

      const resolvedGoals = resolveField(g, () => loadLS('prepiq_goals', DEFAULT_GOALS))
      const resolvedLog   = resolveField(l, () => loadLS(`prepiq_log_${date}`, []))
      const resolvedPlan  = resolveField(p, () => loadLS('prepiq_weekplan', DEFAULT_WEEK_PLAN))
      const resolvedFavs  = resolveField(f, () => loadLS('prepiq_favorites', []))
      const resolvedGroc  = resolveField(c, () => loadLS('prepiq_grocery', []))

      setGoalsState(resolvedGoals)
      setMealLog(resolvedLog)
      setWeekPlan(resolvedPlan)
      setFavorites(arrayToSet(resolvedFavs))
      setGroceryChecks(arrayToSet(resolvedGroc))
    } catch (e) {
      console.error('[loadFromFirestore]', e)
      loadFromLS(date)
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      const date = todayISO()
      setLogDate(date)
      if (u) {
        await loadFromFirestore(u.uid, date)
      } else {
        loadFromLS(date)
      }
    })
    return unsub
  }, [])

  /* MIDNIGHT, WITH THE APP STILL OPEN.
   *
   * Reading todayISO() at write time fixes where a write lands but
   * creates a worse fault on its own: `mealLog` would still hold
   * yesterday's meals, and the next log would write that whole array
   * under today's date — merging two days into one. So the day the log
   * belongs to is tracked, and when it moves the log is re-read for the
   * new day.
   *
   * Three triggers, because a PWA is usually not in the foreground when
   * midnight passes: coming back to visibility, regaining focus, and a
   * minute tick for the case where it is simply left on screen. The
   * check is a string comparison against state, so the frequent
   * triggers cost nothing on the days nothing happens.
   *
   * Only the LOG is re-read. Goals, plan, favourites and grocery checks
   * are not per-day. */
  useEffect(() => {
    const check = () => {
      const now = todayISO()
      if (!dayChanged(logDate, now)) return
      setLogDate(now)
      const local = () => loadLS(`prepiq_log_${now}`, [])
      if (!user) { setMealLog(local()); return }
      getDoc(doc(db, 'users', user.uid, 'logs', now))
        .then(s => setMealLog(resolveField(s.exists() ? s.data().meals : null, local)))
        .catch(e => { console.error('[dayRollover]', e); setMealLog(local()) })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const tick = setInterval(check, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(tick)
    }
  }, [logDate, user])

  /* WRITES ARE LOCAL-FIRST, CLOUD-SECOND, AND NO LONGER SILENT.
   *
   * Every write saves to localStorage and then to Firestore. When the
   * Firestore half failed, `.catch(console.error)` swallowed it — and
   * the two stores then disagree in the direction that LOSES the
   * change: loadFromFirestore resolves the cloud value FIRST and falls
   * back to localStorage only when the document is missing or the field
   * is nullish. An empty array is neither. So a failed write left the
   * device saying "saved", the cloud holding the old value, and the
   * next load quietly restoring it.
   *
   * ALL FIVE WRITERS GO THROUGH ONE PATH. Grocery checks were fixed
   * first because that is where it was noticed, but the plan is the one
   * that costs something: losing a week of meals and having it reappear
   * on reload with no explanation. Five copies of the same catch is how
   * four of them stayed silent after the fifth was fixed.
   *
   * THE LOCAL WRITE IS NOT ROLLED BACK on failure. Discarding what the
   * user just did, to match a server that may only be offline, is the
   * worse of the two wrongs. What changes is that the disagreement is
   * visible while it lasts.
   *
   * KEYED BY `what`, not a single slot. A successful goals write must
   * not clear a failed plan write — that would hide the exact failure
   * this exists to show. Each writer clears only its own key. */
  const cloudWrite = useCallback((uid, segments, payload, what) => {
    /* Signed out is not a failure — the local write already happened and
       is the whole store in that mode. Returning before doc() also keeps
       a ref from being built against a uid that does not exist. */
    if (!uid) return
    setDoc(doc(db, 'users', uid, ...segments), payload)
      .then(() => setSyncErrors(prev => {
        if (!(what in prev)) return prev          // same object back: no re-render
        const next = { ...prev }
        delete next[what]
        return next
      }))
      .catch(err => {
        console.error(`[cloudWrite:${what}]`, err)
        const detail = err?.code ? `[${err.code}] ${err.message}` : String(err?.message ?? err)
        setSyncErrors(prev => ({ ...prev, [what]: detail }))
      })
  }, [])

  const writeGoals = useCallback((uid, value) => {
    saveLS('prepiq_goals', value)
    cloudWrite(uid, ['profile', 'goals'], value, 'goals')
  }, [cloudWrite])

  /* The date is PASSED IN rather than read from a module constant — see
     todayISO. A write must land on the day it was made. */
  const writeLog = useCallback((uid, value, date) => {
    saveLS(`prepiq_log_${date}`, value)
    cloudWrite(uid, ['logs', date], { meals: value }, "today's log")
  }, [cloudWrite])

  const writePlan = useCallback((uid, value) => {
    saveLS('prepiq_weekplan', value)
    cloudWrite(uid, ['weekPlan', 'current'], { days: value }, 'weekly plan')
  }, [cloudWrite])

  const writeFavs = useCallback((uid, value) => {
    saveLS('prepiq_favorites', setToArray(value))
    cloudWrite(uid, ['profile', 'favorites'], { ids: setToArray(value) }, 'favourites')
  }, [cloudWrite])

  const writeGroc = useCallback((uid, value) => {
    saveLS('prepiq_grocery', setToArray(value))
    cloudWrite(uid, ['grocery', 'checks'], { ids: setToArray(value) }, 'grocery checks')
  }, [cloudWrite])

  const dismissSyncErrors = useCallback(() => setSyncErrors({}), [])

  /* NO WRITES INSIDE STATE UPDATERS.
   *
   * Four of these used to compute the next value inside
   * `setX(prev => …)` and fire the Firestore write from in there. A
   * state updater must be pure: React may call it more than once for a
   * single update, and under StrictMode in development it always does —
   * so every toggle sent two identical setDoc calls. Idempotent, so it
   * looked harmless, and billed twice while looking harmless.
   *
   * It stops being harmless the moment a write is not idempotent. An
   * append, a counter, an arrayUnion, or the exclusion list the
   * ingredient screen will need would all double.
   *
   * The next value is derived from the state in scope instead, and the
   * dependency array names it. */
  const updateGoals = useCallback((newGoals) => {
    setGoalsState(newGoals)
    writeGoals(user?.uid, newGoals)
  }, [user, writeGoals])

  const logMeal = useCallback((recipeId, slot) => {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipeId,
      slot,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      loggedAt: new Date().toISOString(),
    }
    const next = [...mealLog, entry]
    setMealLog(next)
    writeLog(user?.uid, next, logDate)
  }, [mealLog, logDate, user, writeLog])

  const removeLoggedMeal = useCallback((logId) => {
    const next = mealLog.filter(m => m.id !== logId)
    setMealLog(next)
    writeLog(user?.uid, next, logDate)
  }, [mealLog, logDate, user, writeLog])

  const shuffleWeekPlan = useCallback(() => {
    const shuffled = [...recipes].sort(() => Math.random() - 0.5)
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const plan = days.map((day, i) => ({ day, ids: [shuffled[i * 2]?.id ?? null, shuffled[i * 2 + 1]?.id ?? null] }))
    setWeekPlan(plan)
    writePlan(user?.uid, plan)
  }, [user, writePlan])

  const toggleFavorite = useCallback((recipeId) => {
    const next = new Set(favorites)
    next.has(recipeId) ? next.delete(recipeId) : next.add(recipeId)
    setFavorites(next)
    writeFavs(user?.uid, next)
  }, [favorites, user, writeFavs])

  const toggleGroceryItem = useCallback((itemId) => {
    const next = new Set(groceryChecks)
    next.has(itemId) ? next.delete(itemId) : next.add(itemId)
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [groceryChecks, user, writeGroc])

  const checkAllGrocery = useCallback((allItemIds) => {
    const next = new Set(allItemIds)
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [user, writeGroc])

  const clearGrocery = useCallback(() => {
    const next = new Set()
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [user, writeGroc])

  const signIn = useCallback((email, password) =>
    signInWithEmailAndPassword(auth, email, password), [])

  const signUp = useCallback((email, password) =>
    createUserWithEmailAndPassword(auth, email, password), [])

  const signOutUser = useCallback(() => signOut(auth), [])

  const consumed = {
    calories: mealLog.reduce((sum, m) => sum + (recipeById[m.recipeId]?.cal || 0), 0),
    protein:  mealLog.reduce((sum, m) => sum + (recipeById[m.recipeId]?.protein || 0), 0),
    carbs:    mealLog.reduce((sum, m) => sum + (recipeById[m.recipeId]?.carbs || 0), 0),
    fat:      mealLog.reduce((sum, m) => sum + (recipeById[m.recipeId]?.fat || 0), 0),
  }

  const value = {
    user,
    goals,
    mealLog,
    consumed,
    weekPlan,
    favorites,
    groceryChecks,
    syncErrors,
    dismissSyncErrors,
    logDate,
    updateGoals,
    logMeal,
    removeLoggedMeal,
    shuffleWeekPlan,
    toggleFavorite,
    toggleGroceryItem,
    checkAllGrocery,
    clearGrocery,
    signIn,
    signUp,
    signOutUser,
  }

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  )
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider')
  return ctx
}
