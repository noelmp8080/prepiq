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

       CHECKS ARE VERSIONED AND ID-KEYED NOW. They used to be
       `recipe_${id}` strings, which could not be mapped onto a recipe's
       nineteen ingredients without inventing data, so v2 resets rather
       than migrates and the version marks which key space a stored
       document belongs to. */
    expect(payloadFor(`users/${UID}/grocery/checks`)).toEqual({ version: 2, ids: [1, 2] })
    expect(payloadFor(`users/${UID}/profile/favorites`)).toEqual({ ids: [7] })
    expect(payloadFor(`users/${UID}/weekPlan/current`).days).toHaveLength(7)

    unmount()
  })

  it('writes nothing to the cloud when signed out, but still saves locally', async () => {
    const { box, unmount } = mountStore()
    await act(async () => { await authCallback(null) })
    setDocMock.mockClear()

    await act(async () => { box.store.checkAllGrocery([1]) })

    expect(setDocMock).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('prepiq_grocery'))).toEqual({ version: 2, ids: [1] })
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

    expect(JSON.parse(localStorage.getItem('prepiq_grocery'))).toEqual({ version: 2, ids: [1] })
    expect(box.store.groceryChecks.has(1)).toBe(true)
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
