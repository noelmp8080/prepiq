import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, cloudEnabled } from '../firebase'
import { recipes, recipeById } from '../data/recipes'
import { todayISO, resolveField, dayChanged, setToArray, arrayToSet, loadLS, saveLS,
         readChecks, writeChecks, readHidden, writeHidden, todayIndex, dayKey, lsKey, adoptAnonKeys,
         CHECKS_VERSION, EXCLUDED_VERSION, HIDDEN_VERSION, hydrateLocal, lastScope,
         rememberScope, buildGroceryItems, readRail, writeRail, normalizeWeekPlan } from './storeLogic'
import groceryCatalog from '../data/groceryCatalog.json'

const AppStoreContext = createContext(null)

const DEFAULT_GOALS = { calories: 1800, protein: 180, carbs: 200, fat: 60 }

const DEFAULT_WEEK_PLAN = (() => {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const SEED = [[1,2],[3,4],[5,6],[7,8],[9,10],[11,null],[12,null]]
  return days.map((day, i) => ({ day, ids: SEED[i] }))
})()

export function AppStoreProvider({ children }) {
  /* LOCAL FIRST. Read the device before the network, at construction,
     from the scope of whoever was signed in last — see hydrateLocal. A
     cold start in a shop with one bar showed a spinner while the list
     sat on disk the whole time. */
  const [boot] = useState(() => ({
    scope: lastScope(),
    ...hydrateLocal(lastScope(), todayISO(),
                    { goals: DEFAULT_GOALS, weekPlan: DEFAULT_WEEK_PLAN }),
  }))

  const [user,          setUser]          = useState(undefined)   // undefined = auth not resolved
  const [goals,         setGoalsState]    = useState(boot.goals)
  const [mealLog,       setMealLog]       = useState(boot.mealLog)
  /* NORMALISED AT EVERY DOOR. A plan can reach state from three
     places — this boot read, the local re-hydrate on a scope change,
     and the cloud resolve — and a dangling id entering by any of them
     breaks Plan, Grocery, Today and Track at once. See
     normalizeWeekPlan in storeLogic. */
  const [weekPlan,      setWeekPlan]      = useState(() => normalizeWeekPlan(boot.weekPlan, recipeById))
  const [favorites,     setFavorites]     = useState(boot.favorites)
  const [groceryChecks, setGroceryChecks] = useState(boot.groceryChecks)
  /* { [what]: detail } — one slot per writer, so a successful write
     never clears another writer's failure. */
  const [syncErrors,    setSyncErrors]    = useState({})
  /* WHICH DAY `mealLog` BELONGS TO. Not cosmetic: without it, an app
     left open past midnight would append tonight's meals to yesterday's
     loaded log and write the result under today's date, merging two
     days. Reading todayISO() at write time alone would have introduced
     exactly that. */
  const [logDate,       setLogDate]       = useState(todayISO)
  /* CLEARED ITEMS. "Clear" removes what you already have from the list;
     the week plan still generates them, so the removal has to persist as
     an exclusion. Keyed on catalog ids — never on a name, because the
     normaliser has changed on nearly every pass of this work. */
  const [groceryExcluded, setGroceryExcluded] = useState(boot.groceryExcluded)
  /* DURABLE, GLOBAL, AND NOT THE SAME THING AS EXCLUDED — see
     HIDDEN_VERSION in storeLogic. "I never need this", one bare item id
     per entry, surviving START A NEW LIST. */
  const [groceryHidden, setGroceryHidden] = useState(boot.groceryHidden)
  /* WHICH DAY THE GROCERY LIST IS SHOWING. null means "today", and this
     is the ONLY place that means resolves to an index — buildGroceryItems
     takes a real integer so date handling stays out of the derivation. */
  const [groceryDayRaw, setGroceryDay] = useState(null)
  /* null = never chosen; the surface decides until it is. See
     railIsExpanded in storeLogic. */
  const [railStored, setRailStored] = useState(() => readRail(lastScope()))
  /* RESOLVED ONCE, HERE. Everything downstream — the derivation, the
     check key, the exclusion key — takes a real integer, so this is the
     only line in the app where "today" means anything. */
  /* WHICH DAY IS TODAY, in the plan's own terms. Today, Track and the
     grocery default all resolve through this one call so they cannot
     disagree about what day it is. */
  const planToday = todayIndex(weekPlan)
  const groceryDay = groceryDayRaw ?? planToday

  /* THE LIST IS DERIVED HERE, ONCE.
     The screen and the nav badge both need it, and two derivations of
     the same thing is how a badge ends up disagreeing with the list it
     points at. Grocery is never stored — there is no "add to list"
     anywhere — so changing a day's meal changes this on the next render
     with nothing to sync. */
  const groceryRows = useMemo(
    () => buildGroceryItems(weekPlan, groceryCatalog, groceryExcluded, groceryDay, groceryHidden),
    [weekPlan, groceryExcluded, groceryDay, groceryHidden])

  const groceryUnchecked = useMemo(
    () => groceryRows.reduce(
      (n, r) => n + (groceryChecks.has(dayKey(groceryDay, r.id)) ? 0 : 1), 0),
    [groceryRows, groceryChecks, groceryDay])

  // Load from localStorage (offline/no-auth path)
  /* ONE READER, used at construction and again whenever the scope
     changes. Two copies of this list is how a field ends up hydrated on
     one path and not the other. */
  function loadFromLS(uid, date) {
    const local = hydrateLocal(uid, date,
                               { goals: DEFAULT_GOALS, weekPlan: DEFAULT_WEEK_PLAN })
    setGoalsState(local.goals)
    setMealLog(local.mealLog)
    setWeekPlan(normalizeWeekPlan(local.weekPlan, recipeById))
    setFavorites(local.favorites)
    setGroceryChecks(local.groceryChecks)
    setGroceryExcluded(local.groceryExcluded)
    setGroceryHidden(local.groceryHidden)
  }

  // Load from Firestore
  async function loadFromFirestore(uid, date) {
    try {
      const [goalsSnap, logSnap, planSnap, favSnap, grocSnap, exclSnap, hidSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'profile', 'goals')),
        getDoc(doc(db, 'users', uid, 'logs', date)),
        getDoc(doc(db, 'users', uid, 'weekPlan', 'current')),
        getDoc(doc(db, 'users', uid, 'profile', 'favorites')),
        getDoc(doc(db, 'users', uid, 'grocery', 'checks')),
        getDoc(doc(db, 'users', uid, 'grocery', 'excluded')),
      ])
      const g = goalsSnap.exists() ? goalsSnap.data() : null
      const l = logSnap.exists()   ? logSnap.data().meals  : null
      const p = planSnap.exists()  ? planSnap.data().days  : null
      const f = favSnap.exists()   ? favSnap.data().ids    : null
      const c = grocSnap.exists()  ? grocSnap.data()       : null
      const x = exclSnap.exists()  ? exclSnap.data()       : null
      const h = hidSnap.exists()   ? hidSnap.data()        : null

      const resolvedGoals = resolveField(g, () => loadLS(lsKey(uid, 'goals'), DEFAULT_GOALS))
      const resolvedLog   = resolveField(l, () => loadLS(lsKey(uid, `log_${date}`), []))
      const resolvedPlan  = resolveField(p, () => loadLS(lsKey(uid, 'weekplan'), DEFAULT_WEEK_PLAN))
      const resolvedFavs  = resolveField(f, () => loadLS(lsKey(uid, 'favorites'), []))
      const resolvedGroc  = resolveField(c, () => loadLS(lsKey(uid, 'grocery'), null))
      const resolvedExcl  = resolveField(x, () => loadLS(lsKey(uid, 'grocery_excluded'), null))
      const resolvedHid   = resolveField(h, () => loadLS(lsKey(uid, 'grocery_hidden'), null))

      setGoalsState(resolvedGoals)
      setMealLog(resolvedLog)
      setWeekPlan(normalizeWeekPlan(resolvedPlan, recipeById))
      setFavorites(arrayToSet(resolvedFavs))
      setGroceryChecks(readChecks(resolvedGroc, CHECKS_VERSION))
      setGroceryExcluded(readChecks(resolvedExcl, EXCLUDED_VERSION))
      setGroceryHidden(readHidden(resolvedHid, HIDDEN_VERSION))
    } catch (e) {
      console.error('[loadFromFirestore]', e)
      loadFromLS(uid, date)
    }
  }

  useEffect(() => {
    /* LOCAL ONLY: there is no auth to subscribe to, so resolve the gate
       immediately rather than waiting for a callback that cannot fire.
       The state is already hydrated — boot read it synchronously — so
       this only tells App that the question is settled. */
    if (!cloudEnabled) { setUser(null); return }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      const date = todayISO()
      setLogDate(date)
      /* Remembered for the NEXT cold start, so it boots into the right
         scope instead of guessing anon. */
      rememberScope(u?.uid)
      setRailStored(readRail(u?.uid))
      if (u) {
        /* ADOPT BEFORE READING, not after. The signed-out plan has to be
           in this account's scope by the time loadFromFirestore looks for
           a local fallback, or the fallback finds an empty new scope and
           the work is lost at exactly the moment the user signed up to
           keep it. */
        adoptAnonKeys(u.uid)
        await loadFromFirestore(u.uid, date)
      } else if (boot.scope !== null) {
        /* Booted into somebody's scope and auth says nobody. Re-read. */
        loadFromLS(null, date)
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
      const local = () => loadLS(lsKey(user?.uid, `log_${now}`), [])
      if (!user || !cloudEnabled) { setMealLog(local()); return }
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
       a ref from being built against a uid that does not exist.
       No config means no `db` to build a ref against either, and it is
       not a failure for the same reason. */
    if (!uid || !cloudEnabled) return
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
    saveLS(lsKey(uid, 'goals'), value)
    cloudWrite(uid, ['profile', 'goals'], value, 'goals')
  }, [cloudWrite])

  /* The date is PASSED IN rather than read from a module constant — see
     todayISO. A write must land on the day it was made. */
  const writeLog = useCallback((uid, value, date) => {
    saveLS(lsKey(uid, `log_${date}`), value)
    cloudWrite(uid, ['logs', date], { meals: value }, "today's log")
  }, [cloudWrite])

  const writePlan = useCallback((uid, value) => {
    saveLS(lsKey(uid, 'weekplan'), value)
    cloudWrite(uid, ['weekPlan', 'current'], { days: value }, 'weekly plan')
  }, [cloudWrite])

  const writeFavs = useCallback((uid, value) => {
    saveLS(lsKey(uid, 'favorites'), setToArray(value))
    cloudWrite(uid, ['profile', 'favorites'], { ids: setToArray(value) }, 'favourites')
  }, [cloudWrite])

  /* The write REPLACES rather than merges, so v1's `recipe_${id}` keys
     cannot linger and quietly inflate the count. */
  const writeGroc = useCallback((uid, value) => {
    const doc_ = writeChecks(value, CHECKS_VERSION)
    saveLS(lsKey(uid, 'grocery'), doc_)
    cloudWrite(uid, ['grocery', 'checks'], doc_, 'grocery checks')
  }, [cloudWrite])

  const writeExcluded = useCallback((uid, value) => {
    const doc_ = writeChecks(value, EXCLUDED_VERSION)
    saveLS(lsKey(uid, 'grocery_excluded'), doc_)
    cloudWrite(uid, ['grocery', 'excluded'], doc_, 'cleared items')
  }, [cloudWrite])

  /* Its own document, beside the other two rather than inside either —
     the whole point of the second set is that nothing which clears a
     shop can reach it. */
  const writeHiddenDoc = useCallback((uid, value) => {
    const doc_ = writeHidden(value, HIDDEN_VERSION)
    saveLS(lsKey(uid, 'grocery_hidden'), doc_)
    cloudWrite(uid, ['grocery', 'hidden'], doc_, 'hidden items')
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

  /* ── EDITING THE PLAN ────────────────────────────────────────────
     weekPlan is the single source of truth, so these are the only
     writes that move Today, the grocery list and Track's planned rows.
     Nothing else needs to be told. */

  /** Put a recipe in the first free slot of `dayIndex`. */
  const assignMeal = useCallback((dayIndex, recipeId) => {
    const day = weekPlan[dayIndex]
    if (!day) return false
    const slot = (day.ids || []).findIndex(x => !x)
    if (slot < 0) return false                       // full; the caller says so
    const next = weekPlan.map((d, i) =>
      i !== dayIndex ? d : { ...d, ids: d.ids.map((x, j) => (j === slot ? recipeId : x)) })
    setWeekPlan(next)
    writePlan(user?.uid, next)
    return true
  }, [weekPlan, user, writePlan])

  /** Clear one slot. The slot stays — a day has a fixed shape. */
  const removeMeal = useCallback((dayIndex, slot) => {
    const next = weekPlan.map((d, i) =>
      i !== dayIndex ? d : { ...d, ids: d.ids.map((x, j) => (j === slot ? null : x)) })
    setWeekPlan(next)
    writePlan(user?.uid, next)
  }, [weekPlan, user, writePlan])

  /* Local only — a sidebar width is not account data, and syncing it
     would let a phone session rearrange a desktop one. */
  const setRailExpanded = useCallback((value) => {
    setRailStored(!!value)
    writeRail(user?.uid, !!value)
  }, [user])

  const toggleFavorite = useCallback((recipeId) => {
    const next = new Set(favorites)
    next.has(recipeId) ? next.delete(recipeId) : next.add(recipeId)
    setFavorites(next)
    writeFavs(user?.uid, next)
  }, [favorites, user, writeFavs])

  /* CHECKS ARE PER DAY, keyed exactly like exclusions. A week-wide check
     claims "bought" against Friday's row when what you bought was
     Tuesday's amount of the same thing. The screen passes item ids; the
     day comes from here, so no caller can build half a key. */
  const toggleGroceryItem = useCallback((itemId) => {
    const k = dayKey(groceryDay, itemId)
    const next = new Set(groceryChecks)
    next.has(k) ? next.delete(k) : next.add(k)
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [groceryChecks, groceryDay, user, writeGroc])

  const checkAllGrocery = useCallback((allItemIds) => {
    const next = new Set([...allItemIds].map(id => dayKey(groceryDay, id)))
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [groceryDay, user, writeGroc])

  /* CLEAR MOVES CHECKED ITEMS OFF THE LIST, it does not merely untick
     them. That was the original bug: the button said Clear, emptied the
     checkmarks, and left every row in place. */
  const clearGrocery = useCallback(() => {
    const nextExcl = new Set([...groceryExcluded, ...groceryChecks])
    setGroceryExcluded(nextExcl)
    writeExcluded(user?.uid, nextExcl)
    const empty = new Set()
    setGroceryChecks(empty)
    writeGroc(user?.uid, empty)
    return groceryChecks                       // for the undo toast
  }, [groceryChecks, groceryExcluded, user, writeGroc, writeExcluded])

  const undoClear = useCallback((restored) => {
    const nextExcl = new Set(groceryExcluded)
    for (const id of restored) nextExcl.delete(id)
    setGroceryExcluded(nextExcl)
    writeExcluded(user?.uid, nextExcl)
    setGroceryChecks(new Set(restored))
    writeGroc(user?.uid, new Set(restored))
  }, [groceryExcluded, user, writeGroc, writeExcluded])

  /* ── HIDING AN ITEM ─────────────────────────────────────────────────
     "I never need this." Global — one bare item id — so it leaves every
     day at once, and durable, so it outlives the shop it was said in. */
  const hideGroceryItem = useCallback((itemId) => {
    const next = new Set(groceryHidden)
    next.add(String(itemId))
    setGroceryHidden(next)
    writeHiddenDoc(user?.uid, next)
  }, [groceryHidden, user, writeHiddenDoc])

  const unhideGroceryItem = useCallback((itemId) => {
    const next = new Set(groceryHidden)
    next.delete(String(itemId))
    setGroceryHidden(next)
    writeHiddenDoc(user?.uid, next)
  }, [groceryHidden, user, writeHiddenDoc])

  const unhideAllGroceryItems = useCallback(() => {
    const empty = new Set()
    setGroceryHidden(empty)
    writeHiddenDoc(user?.uid, empty)
  }, [user, writeHiddenDoc])

  /* START A NEW LIST. weekPlan carries no week identity — no date, no
     number, no revision — so nothing can reset exclusions automatically.
     This control is required by the model rather than optional.

     IT DOES NOT TOUCH `groceryHidden`, and that is the entire reason
     hidden is a second store rather than a widening of `excluded`. This
     button clears a SHOP; "I never need anchovies" is not part of one.
     A test asserts it by name. */
  const startNewGroceryList = useCallback(() => {
    const empty = new Set()
    setGroceryExcluded(empty); writeExcluded(user?.uid, empty)
    setGroceryChecks(empty);   writeGroc(user?.uid, empty)
  }, [user, writeGroc, writeExcluded])

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
    groceryExcluded,
    groceryHidden,
    hideGroceryItem,
    unhideGroceryItem,
    unhideAllGroceryItems,
    planToday,
    railStored,
    setRailExpanded,
    groceryDay,
    groceryRows,
    groceryUnchecked,
    /* Non-null when the device booted straight into a known scope, so
       the app can render before auth resolves. */
    bootScope: boot.scope,
    cloudEnabled,
    groceryDayIsToday: groceryDayRaw === null,
    setGroceryDay,
    undoClear,
    startNewGroceryList,
    syncErrors,
    dismissSyncErrors,
    logDate,
    updateGoals,
    logMeal,
    removeLoggedMeal,
    shuffleWeekPlan,
    assignMeal,
    removeMeal,
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
