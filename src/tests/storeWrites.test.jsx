import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* THE WRITE PATHS.
 *
 * useAppStore imports ../firebase at module load, so every one of these
 * has to be mocked before the store is imported. That import is the
 * reason none of this was covered — the cost of testing it was "boot
 * Firebase", so nobody paid it, and four writers swallowed their errors
 * in the dark for as long as the file has existed.
 *
 * What is asserted: WHERE each writer writes, WHAT it sends, and what
 * happens when the send fails. Not the UI.
 */

const setDocMock = vi.fn()
const getDocMock = vi.fn()
let authCallback = null

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/firestore', () => ({
  /* The real doc() returns a DocumentReference; the store only ever
     passes it straight to setDoc/getDoc, so recording the path is
     enough and keeps the assertion about the path rather than about
     Firestore's object shape. */
  doc: (_db, ...segments) => ({ path: segments.join('/') }),
  getDoc: (...a) => getDocMock(...a),
  setDoc: (...a) => setDocMock(...a),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => { authCallback = cb; return () => {} },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { lsKey, CHECKS_VERSION, EXCLUDED_VERSION, dayKey, adoptedMarker,
        buildGroceryItems } = await import('../store/storeLogic')
const { default: catalog } = await import('../data/groceryCatalog.json')

/* Grocery keys carry the day, and the day defaults to today — so every
   assertion about a stored check would otherwise change with the
   weekday. Pinned once here. */
const DAY = 2
const K = id => dayKey(DAY, id)
const readLS = (uid, name) => JSON.parse(localStorage.getItem(lsKey(uid, name)))
const saveLSRaw = (key, v) => localStorage.setItem(key, JSON.stringify(v))

const UID = 'test-uid-123'
const snap = value => ({ exists: () => value !== undefined, data: () => value })

/* Renders the provider and hands the store back, so tests call the real
   actions rather than re-implementing them. */
function mountStore() {
  const box = {}
  function Probe() {
    box.store = useAppStore()
    return null
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(<AppStoreProvider><Probe /></AppStoreProvider>) })
  return { box, unmount: () => act(() => root.unmount()) }
}

/* Signs in and lets the initial load settle. Firestore returns nothing,
   so every field resolves from localStorage. */
async function signIn(box) {
  getDocMock.mockResolvedValue(snap(undefined))
  await act(async () => { await authCallback({ uid: UID }) })
  await act(async () => { box.store.setGroceryDay(DAY) })
  setDocMock.mockClear()
  return box
}

const pathsWritten = () => setDocMock.mock.calls.map(c => c[0].path)
const payloadFor = path => setDocMock.mock.calls.find(c => c[0].path === path)?.[1]

beforeEach(() => {
  localStorage.clear()
  setDocMock.mockReset()
  getDocMock.mockReset()
  setDocMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('every writer lands on its own document', () => {
  it('writes each field to the path the security rules expect', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    await act(async () => { box.store.updateGoals({ calories: 2000 }) })
    await act(async () => { box.store.shuffleWeekPlan() })
    await act(async () => { box.store.toggleFavorite(7) })
    await act(async () => { box.store.checkAllGrocery([1]) })
    await act(async () => { box.store.logMeal(1, 'lunch') })

    const paths = pathsWritten()
    expect(paths).toContain(`users/${UID}/profile/goals`)
    expect(paths).toContain(`users/${UID}/weekPlan/current`)
    expect(paths).toContain(`users/${UID}/profile/favorites`)
    expect(paths).toContain(`users/${UID}/grocery/checks`)
    /* The log is per-day and the date must be the LOCAL one. */
    expect(paths.some(p => /^users\/test-uid-123\/logs\/\d{4}-\d{2}-\d{2}$/.test(p))).toBe(true)

    /* Everything is under users/{uid}/ — firestore.rules denies the
       rest by default, so a writer escaping that subtree is a silent
       permission failure rather than a visible bug. */
    for (const p of paths) expect(p.startsWith(`users/${UID}/`)).toBe(true)

    unmount()
  })

  it('sends the shapes the load path reads back', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    await act(async () => { box.store.checkAllGrocery([1, 2]) })
    await act(async () => { box.store.toggleFavorite(7) })
    await act(async () => { box.store.shuffleWeekPlan() })

    /* Sets are serialised as arrays — Firestore cannot store a Set, and
       a Set would arrive as {} with no error.

       CHECKS ARE VERSIONED AND DAY-KEYED NOW — `dayIndex:itemId`. They
       were `recipe_${id}` at v1 and bare item ids at v2; neither can be
       mapped onto a day without inventing data, so v3 resets rather than
       migrates and the version marks which key space a document belongs
       to. */
    expect(payloadFor(`users/${UID}/grocery/checks`))
      .toEqual({ version: CHECKS_VERSION, keys: [K(1), K(2)] })
    expect(payloadFor(`users/${UID}/profile/favorites`)).toEqual({ ids: [7] })
    expect(payloadFor(`users/${UID}/weekPlan/current`).days).toHaveLength(7)

    unmount()
  })

  it('writes nothing to the cloud when signed out, but still saves locally', async () => {
    const { box, unmount } = mountStore()
    await act(async () => { await authCallback(null) })
    setDocMock.mockClear()

    await act(async () => { box.store.setGroceryDay(DAY) })
    await act(async () => { box.store.checkAllGrocery([1]) })

    expect(setDocMock).not.toHaveBeenCalled()
    /* Signed out writes to the ANON scope, not to a global key. */
    expect(readLS(null, 'grocery')).toEqual({ version: CHECKS_VERSION, keys: [K(1)] })
    expect(localStorage.getItem('prepiq_grocery')).toBe(null)
    unmount()
  })
})

/* THE BUG THIS ALL STARTED FROM. A failed cloud write used to reach
   console.error and stop there. */
describe('a failed write is reported, not swallowed', () => {
  it('surfaces the failure under the name of the writer that failed', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    setDocMock.mockRejectedValue(Object.assign(new Error('Missing permissions'), { code: 'permission-denied' }))
    await act(async () => { box.store.checkAllGrocery([1]) })

    expect(box.store.syncErrors['grocery checks']).toContain('permission-denied')
    unmount()
  })

  it('keeps the local write, so the user does not lose what they just did', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    setDocMock.mockRejectedValue(new Error('offline'))
    await act(async () => { box.store.checkAllGrocery([1]) })

    expect(readLS(UID, 'grocery')).toEqual({ version: CHECKS_VERSION, keys: [K(1)] })
    expect(box.store.groceryChecks.has(K(1))).toBe(true)
    unmount()
  })

  /* THE POINT OF KEYING BY WRITER. The plan is the expensive one to
     lose; a successful grocery write must not clear its failure. */
  it('a successful writer does not clear a different writer that failed', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    setDocMock.mockRejectedValue(new Error('offline'))
    await act(async () => { box.store.shuffleWeekPlan() })
    expect(box.store.syncErrors['weekly plan']).toBeTruthy()

    setDocMock.mockResolvedValue(undefined)
    await act(async () => { box.store.checkAllGrocery([1]) })

    expect(box.store.syncErrors['weekly plan'], 'the plan failure was cleared by an unrelated success').toBeTruthy()
    expect(box.store.syncErrors['grocery checks']).toBeUndefined()
    unmount()
  })

  it('clears its own error once that writer succeeds again', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    setDocMock.mockRejectedValue(new Error('offline'))
    await act(async () => { box.store.checkAllGrocery([1]) })
    expect(box.store.syncErrors['grocery checks']).toBeTruthy()

    setDocMock.mockResolvedValue(undefined)
    await act(async () => { box.store.checkAllGrocery(['recipe_2']) })
    expect(box.store.syncErrors['grocery checks']).toBeUndefined()
    unmount()
  })

  it('dismisses on request', async () => {
    const { box, unmount } = mountStore()
    await signIn(box)

    setDocMock.mockRejectedValue(new Error('offline'))
    await act(async () => { box.store.checkAllGrocery([1]) })
    expect(Object.keys(box.store.syncErrors)).toHaveLength(1)

    await act(async () => { box.store.dismissSyncErrors() })
    expect(Object.keys(box.store.syncErrors)).toHaveLength(0)
    unmount()
  })
})

/* NO WRITES INSIDE STATE UPDATERS. These run under StrictMode, which
   double-invokes updaters in development — which is exactly how the
   old shape produced two identical setDoc calls per toggle. */
describe('one action, one write', () => {
  const mountStrict = () => {
    const box = {}
    function Probe() { box.store = useAppStore(); return null }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <StrictModeWrapper>
          <AppStoreProvider><Probe /></AppStoreProvider>
        </StrictModeWrapper>,
      )
    })
    return { box, unmount: () => act(() => root.unmount()) }
  }

  it('toggling a grocery item writes exactly once under StrictMode', async () => {
    const { box, unmount } = mountStrict()
    await signIn(box)

    await act(async () => { box.store.toggleGroceryItem('recipe_1') })

    const grocWrites = pathsWritten().filter(p => p === `users/${UID}/grocery/checks`)
    expect(grocWrites).toHaveLength(1)
    unmount()
  })

  it('logging a meal writes exactly once under StrictMode', async () => {
    const { box, unmount } = mountStrict()
    await signIn(box)

    await act(async () => { box.store.logMeal(1, 'lunch') })

    const logWrites = pathsWritten().filter(p => p.includes('/logs/'))
    expect(logWrites).toHaveLength(1)
    unmount()
  })

  it('toggling a favourite writes exactly once under StrictMode', async () => {
    const { box, unmount } = mountStrict()
    await signIn(box)

    await act(async () => { box.store.toggleFavorite(7) })

    expect(pathsWritten().filter(p => p.endsWith('/profile/favorites'))).toHaveLength(1)
    unmount()
  })
})

/* Imported at the bottom so the mock hoisting above stays readable. */
import { StrictMode as StrictModeWrapper } from 'react'

/* ── CLEAR, END TO END ────────────────────────────────────────────────
 *
 * THE COVERAGE GAP THIS CLOSES, NAMED. Clear had 122 passing tests
 * around it and did nothing. The derivation was tested (it read
 * `dayIndex:itemId`), the writers were tested (they wrote whatever they
 * were handed), and NOTHING ran the two against each other through
 * storage. One-sided coverage is not partial coverage — both sides were
 * green and the feature was broken.
 *
 * So this asserts the round trip and nothing smaller: check rows, Clear,
 * read what reached localStorage, hand it back to the derivation, and
 * mount a SECOND store to prove it survives a reload.
 */
describe('Clear removes items, and they stay removed', () => {
  const PLAN = [
    { day: 'Mon', ids: [3, 4] }, { day: 'Tue', ids: [1, 2] },
    { day: 'Wed', ids: [5, 6] }, { day: 'Thu', ids: [7, 8] },
    { day: 'Fri', ids: [9, 10] }, { day: 'Sat', ids: [11, null] },
    { day: 'Sun', ids: [12, null] },
  ]
  const DAY = 1
  const derive = excluded => buildGroceryItems(PLAN, catalog, excluded, DAY)

  async function anonStore() {
    const { box, unmount } = mountStore()
    await act(async () => { await authCallback(null) })
    await act(async () => { box.store.setGroceryDay(DAY) })
    return { box, unmount }
  }

  beforeEach(() => {
    localStorage.clear()
    saveLSRaw(lsKey(null, 'weekplan'), PLAN)
  })

  it('writes day-keyed exclusions that the derivation actually drops', async () => {
    const { box, unmount } = await anonStore()
    const before = derive(new Set())
    expect(before.length).toBe(25)

    const [a, b] = before
    await act(async () => { box.store.toggleGroceryItem(a.id) })
    await act(async () => { box.store.toggleGroceryItem(b.id) })
    expect(box.store.groceryChecks).toEqual(new Set([dayKey(DAY, a.id), dayKey(DAY, b.id)]))

    await act(async () => { box.store.clearGrocery() })

    /* the write reached storage in the shape the reader wants */
    const stored = JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded')))
    expect(stored.version).toBe(EXCLUDED_VERSION)
    expect(stored.keys.sort()).toEqual([dayKey(DAY, a.id), dayKey(DAY, b.id)].sort())

    /* and the derivation drops exactly those two — the assertion that
       was missing, and the one that fails if either side moves */
    const after = derive(box.store.groceryExcluded)
    expect(after.length).toBe(before.length - 2)
    expect(after.find(r => r.id === a.id)).toBeUndefined()
    expect(after.find(r => r.id === b.id)).toBeUndefined()

    /* Clear removes; it does not merely untick. The original bug. */
    expect(box.store.groceryChecks.size).toBe(0)
    unmount()
  })

  it('survives a reload — a fresh store reads them back', async () => {
    const first = await anonStore()
    const [a] = derive(new Set())
    await act(async () => { first.box.store.toggleGroceryItem(a.id) })
    await act(async () => { first.box.store.clearGrocery() })
    first.unmount()

    const second = await anonStore()
    expect(second.box.store.groceryExcluded).toEqual(new Set([dayKey(DAY, a.id)]))
    expect(derive(second.box.store.groceryExcluded).length).toBe(24)
    second.unmount()
  })

  it('clears one day without touching another', async () => {
    const { box, unmount } = await anonStore()
    const [a] = derive(new Set())
    await act(async () => { box.store.toggleGroceryItem(a.id) })
    await act(async () => { box.store.clearGrocery() })

    const otherDay = buildGroceryItems(PLAN, catalog, box.store.groceryExcluded, 3)
    const clean = buildGroceryItems(PLAN, catalog, new Set(), 3)
    expect(otherDay.length).toBe(clean.length)
    unmount()
  })

  it('undo puts them back, in storage as well as in state', async () => {
    const { box, unmount } = await anonStore()
    const before = derive(new Set())
    const [a, b] = before
    await act(async () => { box.store.toggleGroceryItem(a.id) })
    await act(async () => { box.store.toggleGroceryItem(b.id) })

    let restored
    await act(async () => { restored = box.store.clearGrocery() })
    await act(async () => { box.store.undoClear(restored) })

    expect(derive(box.store.groceryExcluded).length).toBe(before.length)
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded'))).keys).toEqual([])
    /* and the ticks come back, so Undo is not a half-undo */
    expect(box.store.groceryChecks).toEqual(new Set([dayKey(DAY, a.id), dayKey(DAY, b.id)]))
    unmount()
  })

  it('Start a new list drops both stores at once', async () => {
    const { box, unmount } = await anonStore()
    const [a] = derive(new Set())
    await act(async () => { box.store.toggleGroceryItem(a.id) })
    await act(async () => { box.store.clearGrocery() })
    await act(async () => { box.store.startNewGroceryList() })

    expect(derive(box.store.groceryExcluded).length).toBe(25)
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded'))).keys).toEqual([])
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery'))).keys).toEqual([])
    unmount()
  })
})
