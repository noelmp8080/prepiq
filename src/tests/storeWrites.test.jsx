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

/* cloudEnabled true: these cover the CLOUD path. Local-only mode
   has its own file — localOnly.test.jsx. */
vi.mock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))

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
        buildGroceryItems, LAST_UID, lastScope } = await import('../store/storeLogic')
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

/* ── LOCAL FIRST ──────────────────────────────────────────────────────
 *
 * The property: the store holds real data BEFORE onAuthStateChanged has
 * fired, and before any getDoc resolves. Asserted by never calling the
 * auth callback in the first case — if hydration still waited on auth,
 * the store would be sitting on defaults.
 */
describe('the store boots from the device, not from the network', () => {
  const UID = 'returning-user'
  const PLAN = [{ day: 'Mon', ids: [9, 9] }, { day: 'Tue', ids: [1, null] },
                { day: 'Wed', ids: [2, null] }, { day: 'Thu', ids: [3, null] },
                { day: 'Fri', ids: [4, null] }, { day: 'Sat', ids: [5, null] },
                { day: 'Sun', ids: [6, null] }]

  beforeEach(() => localStorage.clear())

  it('has the previous signed-in scope ready before auth resolves', () => {
    saveLSRaw(LAST_UID, UID)
    saveLSRaw(lsKey(UID, 'weekplan'), PLAN)
    saveLSRaw(lsKey(UID, 'goals'), { calories: 2400, protein: 200, carbs: 150, fat: 55 })
    saveLSRaw(lsKey(UID, 'favorites'), [11, 12])
    saveLSRaw(lsKey(UID, 'grocery_excluded'), { version: EXCLUDED_VERSION, keys: ['1:1'] })

    const { box, unmount } = mountStore()            // NOTE: no authCallback, no getDoc

    expect(box.store.user).toBeUndefined()           // auth genuinely has not resolved
    expect(getDocMock).not.toHaveBeenCalled()
    expect(box.store.weekPlan).toEqual(PLAN)
    expect(box.store.goals.calories).toBe(2400)
    expect(box.store.favorites).toEqual(new Set([11, 12]))
    expect(box.store.groceryExcluded).toEqual(new Set(['1:1']))
    /* and the app is told it may render rather than spin */
    expect(box.store.bootScope).toBe(UID)
    unmount()
  })

  it('boots into the anon scope when nobody was signed in', () => {
    saveLSRaw(lsKey(null, 'weekplan'), PLAN)
    const { box, unmount } = mountStore()
    expect(box.store.bootScope).toBe(null)
    expect(box.store.weekPlan).toEqual(PLAN)
    unmount()
  })

  /* THE SHARED-DEVICE CASE, FROM THE OTHER END. Booting the anon scope
     for a signed-in user would have been the same bleed the namespacing
     just fixed, so the boot follows the remembered uid — and one user's
     data must never appear in the other's boot. */
  it('never boots one account into the other account data', () => {
    saveLSRaw(LAST_UID, 'userA')
    saveLSRaw(lsKey('userA', 'weekplan'), PLAN)
    saveLSRaw(lsKey('userB', 'weekplan'), [{ day: 'Mon', ids: [99, null] }])

    const { box, unmount } = mountStore()
    expect(box.store.weekPlan).toEqual(PLAN)
    expect(box.store.weekPlan).not.toContainEqual({ day: 'Mon', ids: [99, null] })
    unmount()
  })

  it('remembers the scope on sign-in and forgets it on sign-out', async () => {
    getDocMock.mockResolvedValue(snap(undefined))
    const { box, unmount } = mountStore()

    await act(async () => { await authCallback({ uid: UID }) })
    expect(lastScope()).toBe(UID)

    await act(async () => { await authCallback(null) })
    expect(lastScope()).toBe(null)
    unmount()
  })

  /* Booted optimistically into a scope, then auth says nobody — the
     store must re-read rather than keep showing the signed-out user
     somebody else's plan. */
  it('re-reads when auth contradicts the boot', async () => {
    saveLSRaw(LAST_UID, UID)
    saveLSRaw(lsKey(UID, 'weekplan'), PLAN)
    saveLSRaw(lsKey(null, 'weekplan'), [{ day: 'Mon', ids: [99, null] }])

    const { box, unmount } = mountStore()
    expect(box.store.weekPlan).toEqual(PLAN)

    await act(async () => { await authCallback(null) })
    expect(box.store.weekPlan).toEqual([{ day: 'Mon', ids: [99, null] }])
    unmount()
  })
})

/* ── THE BADGE COUNTS THE DAY, NOT THE WEEK ───────────────────────────
 *
 * The reason this waited for block B. Fed by week-wide checks it would
 * light on Monday because Thursday has something unbought — wrong six
 * days out of seven, and wrong in the direction that teaches you to
 * ignore it.
 */
describe('the grocery badge', () => {
  const PLAN = [
    { day: 'Mon', ids: [3, 4] }, { day: 'Tue', ids: [1, 2] },
    { day: 'Wed', ids: [5, 6] }, { day: 'Thu', ids: [7, 8] },
    { day: 'Fri', ids: [9, 10] }, { day: 'Sat', ids: [11, null] },
    { day: 'Sun', ids: [12, null] },
  ]
  beforeEach(() => {
    localStorage.clear()
    saveLSRaw(lsKey(null, 'weekplan'), PLAN)
  })

  async function anonAt(day) {
    const { box, unmount } = mountStore()
    await act(async () => { await authCallback(null) })
    await act(async () => { box.store.setGroceryDay(day) })
    return { box, unmount }
  }

  it('counts what is still unbought on the day being shown', async () => {
    const { box, unmount } = await anonAt(1)
    expect(box.store.groceryRows.length).toBe(25)
    expect(box.store.groceryUnchecked).toBe(25)

    await act(async () => { box.store.toggleGroceryItem(box.store.groceryRows[0].id) })
    expect(box.store.groceryUnchecked).toBe(24)
    unmount()
  })

  it('goes dark only when that day is finished', async () => {
    const { box, unmount } = await anonAt(1)
    await act(async () => { box.store.checkAllGrocery(box.store.groceryRows.map(r => r.id)) })
    expect(box.store.groceryUnchecked).toBe(0)
    unmount()
  })

  /* THE FAILURE THE STUB EXISTED TO AVOID. Finishing Tuesday must not
     dim Thursday, and Thursday's leftovers must not light Tuesday. */
  it('does not let one day speak for another', async () => {
    const { box, unmount } = await anonAt(1)
    await act(async () => { box.store.checkAllGrocery(box.store.groceryRows.map(r => r.id)) })
    expect(box.store.groceryUnchecked).toBe(0)

    await act(async () => { box.store.setGroceryDay(3) })
    expect(box.store.groceryRows.length).toBe(30)
    expect(box.store.groceryUnchecked).toBe(30)
    unmount()
  })

  /* One derivation. If the screen and the badge ever read different rows
     they will eventually disagree, and the dot is the half nobody
     double-checks. */
  it('counts the same rows the screen renders', async () => {
    const { box, unmount } = await anonAt(1)
    const derived = buildGroceryItems(PLAN, catalog, box.store.groceryExcluded, 1)
    expect(box.store.groceryRows.map(r => r.id)).toEqual(derived.map(r => r.id))
    unmount()
  })

  it('drops cleared items out of the count too', async () => {
    const { box, unmount } = await anonAt(1)
    await act(async () => { box.store.toggleGroceryItem(box.store.groceryRows[0].id) })
    await act(async () => { box.store.clearGrocery() })
    expect(box.store.groceryRows.length).toBe(24)
    expect(box.store.groceryUnchecked).toBe(24)
    unmount()
  })
})

/* ── EVERY WRITER, THROUGH STORAGE AND BACK ───────────────────────────
 *
 * THE AUDIT THAT PRODUCED THIS. After the migration, the read/write
 * pairs were listed and checked one at a time for a test that goes all
 * the way round. Checks and exclusions had one. Goals, the week plan,
 * favourites and the meal log did NOT — every assertion about them
 * either stopped at the cloud payload or started from a hand-seeded key.
 *
 * That is the same one-sided coverage that let Clear ship broken: each
 * half tested against a literal, neither tested against the other. Clear
 * was simply the one that happened to break first.
 *
 * So these use no literals and no seeding. Write through the store's own
 * action, throw the store away, mount a NEW one, and read the value back
 * out of the hydrated state. Nothing in between is stubbed, so a key
 * that disagrees between writer and reader — by scope, by name, by
 * serialisation — fails here and nowhere else.
 */
describe('every writer round-trips through storage', () => {
  beforeEach(() => localStorage.clear())

  /* Signed out, so localStorage is the only store in play and a passing
     assertion cannot be the cloud mock covering for it. */
  async function fresh() {
    const { box, unmount } = mountStore()
    await act(async () => { await authCallback(null) })
    return { box, unmount }
  }
  async function roundTrip(mutate) {
    const first = await fresh()
    let captured
    await act(async () => { captured = mutate(first.box.store) })
    first.unmount()
    const second = await fresh()
    return { store: second.box.store, captured, unmount: second.unmount }
  }

  it('goals', async () => {
    const { store, unmount } = await roundTrip(s => s.updateGoals({ calories: 2345 }))
    expect(store.goals.calories).toBe(2345)
    unmount()
  })

  it('the week plan', async () => {
    const first = await fresh()
    const before = JSON.stringify(first.box.store.weekPlan)
    await act(async () => { first.box.store.shuffleWeekPlan() })
    const after = JSON.stringify(first.box.store.weekPlan)
    first.unmount()

    const second = await fresh()
    expect(JSON.stringify(second.box.store.weekPlan)).toBe(after)
    /* and the shuffle actually changed something, or this proves nothing */
    expect(after).not.toBe(before)
    second.unmount()
  })

  /* Sets do not survive JSON. This is the pair where the write
     serialises (setToArray) and the read deserialises (arrayToSet), so
     an asymmetry here would come back as an empty Set or as {}.

     TWO SEPARATE act()s, DELIBERATELY, and what that cost to learn:
     written as one act with two toggles, this failed with [9] instead of
     [7, 9]. The toggles close over `favorites` from the render that
     created them, so two calls in one tick both start from the same
     snapshot and the second overwrites the first.

     That is not reachable from the UI — two taps are two events and two
     renders — and it is the deliberate price of keeping writes OUT of
     the state updaters, which is what stopped every toggle firing two
     identical setDoc calls under StrictMode. Recorded in DEVIATIONS as a
     latent constraint rather than papered over here. */
  it('favourites, across the Set/array boundary', async () => {
    const first = await fresh()
    await act(async () => { first.box.store.toggleFavorite(7) })
    await act(async () => { first.box.store.toggleFavorite(9) })
    first.unmount()

    const second = await fresh()
    expect(second.box.store.favorites).toBeInstanceOf(Set)
    expect([...second.box.store.favorites].sort()).toEqual([7, 9])
    second.unmount()
  })

  /* The log key interpolates a date INSIDE the scope, which is the one
     key whose name is built from two moving parts. */
  it('the meal log, under a key built from scope and date', async () => {
    const { store, unmount } = await roundTrip(s => s.logMeal(1, 'lunch'))
    expect(store.mealLog).toHaveLength(1)
    expect(store.mealLog[0].slot).toBe('lunch')
    expect(localStorage.getItem(lsKey(null, `log_${store.logDate}`))).not.toBe(null)
    unmount()
  })

  it('grocery checks', async () => {
    const first = await fresh()
    await act(async () => { first.box.store.setGroceryDay(2) })
    const id = first.box.store.groceryRows[0].id
    await act(async () => { first.box.store.toggleGroceryItem(id) })
    first.unmount()

    const second = await fresh()
    expect(second.box.store.groceryChecks).toEqual(new Set([dayKey(2, id)]))
    second.unmount()
  })

  it('grocery exclusions', async () => {
    const first = await fresh()
    await act(async () => { first.box.store.setGroceryDay(2) })
    const id = first.box.store.groceryRows[0].id
    await act(async () => { first.box.store.toggleGroceryItem(id) })
    await act(async () => { first.box.store.clearGrocery() })
    first.unmount()

    const second = await fresh()
    expect(second.box.store.groceryExcluded).toEqual(new Set([dayKey(2, id)]))
    second.unmount()
  })

  /* SIGNED IN, THE SAME WAY. The scope is the part that changed in this
     migration, so the round trip has to be proved on both sides of it —
     a writer that scoped correctly and a reader that did not would pass
     every anon test above. */
  it('carries the whole round trip inside a uid scope', async () => {
    getDocMock.mockResolvedValue(snap(undefined))
    const first = mountStore()
    await act(async () => { await authCallback({ uid: UID }) })
    await act(async () => { first.box.store.updateGoals({ calories: 2600 }) })
    await act(async () => { first.box.store.toggleFavorite(3) })
    first.unmount()

    /* a NEW store, booting from the remembered scope with no auth yet */
    const second = mountStore()
    expect(second.box.store.bootScope).toBe(UID)
    expect(second.box.store.goals.calories).toBe(2600)
    expect([...second.box.store.favorites]).toEqual([3])
    /* and none of it leaked into anon */
    expect(localStorage.getItem(lsKey(null, 'goals'))).toBe(null)
    second.unmount()
  })
})
