import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { recipes } from '../data/recipes'

const AppStoreContext = createContext(null)

const TODAY = new Date().toISOString().slice(0, 10)

const DEFAULT_GOALS = { calories: 1800, protein: 180, carbs: 200, fat: 60 }

const DEFAULT_WEEK_PLAN = (() => {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const SEED = [[1,2],[3,4],[5,6],[7,8],[9,10],[11,null],[12,null]]
  return days.map((day, i) => ({ day, ids: SEED[i] }))
})()

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch { return fallback }
}

function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function setToArray(s) { return [...s] }
function arrayToSet(a) { return new Set(Array.isArray(a) ? a : []) }

export function AppStoreProvider({ children }) {
  const [user,          setUser]          = useState(undefined)   // undefined = loading
  const [goals,         setGoalsState]    = useState(DEFAULT_GOALS)
  const [mealLog,       setMealLog]       = useState([])
  const [weekPlan,      setWeekPlan]      = useState(DEFAULT_WEEK_PLAN)
  const [favorites,     setFavorites]     = useState(new Set())
  const [groceryChecks, setGroceryChecks] = useState(new Set())

  // Load from localStorage (offline/no-auth path)
  function loadFromLS() {
    setGoalsState(loadLS('prepiq_goals', DEFAULT_GOALS))
    setMealLog(loadLS(`prepiq_log_${TODAY}`, []))
    setWeekPlan(loadLS('prepiq_weekplan', DEFAULT_WEEK_PLAN))
    setFavorites(arrayToSet(loadLS('prepiq_favorites', [])))
    setGroceryChecks(arrayToSet(loadLS('prepiq_grocery', [])))
  }

  // Load from Firestore
  async function loadFromFirestore(uid) {
    try {
      const [goalsSnap, logSnap, planSnap, favSnap, grocSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'profile', 'goals')),
        getDoc(doc(db, 'users', uid, 'logs', TODAY)),
        getDoc(doc(db, 'users', uid, 'weekPlan', 'current')),
        getDoc(doc(db, 'users', uid, 'profile', 'favorites')),
        getDoc(doc(db, 'users', uid, 'grocery', 'checks')),
      ])
      const g = goalsSnap.exists() ? goalsSnap.data() : null
      const l = logSnap.exists()   ? logSnap.data().meals  : null
      const p = planSnap.exists()  ? planSnap.data().days  : null
      const f = favSnap.exists()   ? favSnap.data().ids    : null
      const c = grocSnap.exists()  ? grocSnap.data().ids   : null

      const resolvedGoals = g ?? loadLS('prepiq_goals', DEFAULT_GOALS)
      const resolvedLog   = l ?? loadLS(`prepiq_log_${TODAY}`, [])
      const resolvedPlan  = p ?? loadLS('prepiq_weekplan', DEFAULT_WEEK_PLAN)
      const resolvedFavs  = f ?? loadLS('prepiq_favorites', [])
      const resolvedGroc  = c ?? loadLS('prepiq_grocery', [])

      setGoalsState(resolvedGoals)
      setMealLog(resolvedLog)
      setWeekPlan(resolvedPlan)
      setFavorites(arrayToSet(resolvedFavs))
      setGroceryChecks(arrayToSet(resolvedGroc))
    } catch (e) {
      console.error('[loadFromFirestore]', e)
      loadFromLS()
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        await loadFromFirestore(u.uid)
      } else {
        loadFromLS()
      }
    })
    return unsub
  }, [])

  // Write helpers
  function writeGoals(uid, value) {
    saveLS('prepiq_goals', value)
    if (uid) setDoc(doc(db, 'users', uid, 'profile', 'goals'), value).catch(console.error)
  }
  function writeLog(uid, value) {
    saveLS(`prepiq_log_${TODAY}`, value)
    if (uid) setDoc(doc(db, 'users', uid, 'logs', TODAY), { meals: value }).catch(console.error)
  }
  function writePlan(uid, value) {
    saveLS('prepiq_weekplan', value)
    if (uid) setDoc(doc(db, 'users', uid, 'weekPlan', 'current'), { days: value }).catch(console.error)
  }
  function writeFavs(uid, value) {
    saveLS('prepiq_favorites', setToArray(value))
    if (uid) setDoc(doc(db, 'users', uid, 'profile', 'favorites'), { ids: setToArray(value) }).catch(console.error)
  }
  function writeGroc(uid, value) {
    saveLS('prepiq_grocery', setToArray(value))
    if (uid) setDoc(doc(db, 'users', uid, 'grocery', 'checks'), { ids: setToArray(value) }).catch(console.error)
  }

  const updateGoals = useCallback((newGoals) => {
    setGoalsState(newGoals)
    writeGoals(user?.uid, newGoals)
  }, [user])

  const logMeal = useCallback((recipeId, slot) => {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipeId,
      slot,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      loggedAt: new Date().toISOString(),
    }
    setMealLog(prev => {
      const next = [...prev, entry]
      writeLog(user?.uid, next)
      return next
    })
  }, [user])

  const removeLoggedMeal = useCallback((logId) => {
    setMealLog(prev => {
      const next = prev.filter(m => m.id !== logId)
      writeLog(user?.uid, next)
      return next
    })
  }, [user])

  const shuffleWeekPlan = useCallback(() => {
    const shuffled = [...recipes].sort(() => Math.random() - 0.5)
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const plan = days.map((day, i) => ({ day, ids: [shuffled[i * 2]?.id ?? null, shuffled[i * 2 + 1]?.id ?? null] }))
    setWeekPlan(plan)
    writePlan(user?.uid, plan)
  }, [user])

  const toggleFavorite = useCallback((recipeId) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(recipeId) ? next.delete(recipeId) : next.add(recipeId)
      writeFavs(user?.uid, next)
      return next
    })
  }, [user])

  const toggleGroceryItem = useCallback((itemId) => {
    setGroceryChecks(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      writeGroc(user?.uid, next)
      return next
    })
  }, [user])

  const checkAllGrocery = useCallback((allItemIds) => {
    const next = new Set(allItemIds)
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [user])

  const clearGrocery = useCallback(() => {
    const next = new Set()
    setGroceryChecks(next)
    writeGroc(user?.uid, next)
  }, [user])

  const signIn = useCallback((email, password) =>
    signInWithEmailAndPassword(auth, email, password), [])

  const signUp = useCallback((email, password) =>
    createUserWithEmailAndPassword(auth, email, password), [])

  const signOutUser = useCallback(() => signOut(auth), [])

  const value = {
    user,
    goals,
    mealLog,
    weekPlan,
    favorites,
    groceryChecks,
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
