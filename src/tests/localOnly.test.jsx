import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
/* The pure rule, imported directly and NOT through the mock: this
   module touches no SDK and reads no environment, so the test can
   exercise the real predicate without initialising an app. */
import { isConfigComplete } from '../firebaseConfig'

/* ── LOCAL ONLY ───────────────────────────────────────────────────────
 *
 * THE DEFECT THIS COVERS, which was on main. With no Firebase config the
 * app called initializeApp with six undefineds and waited for an
 * onAuthStateChanged that could never fire. App gates on
 * `user === undefined && !bootScope`, so a first-time visitor sat on the
 * spinner for ever — while every screen's data was already on the
 * device, because block B made hydration local-first.
 *
 * THE SAFETY PROPERTY IS THE OTHER HALF, and it matters more: this mode
 * must be reachable ONLY by config absence, never by a failed call. A
 * fallback that fired on a failed request would turn a flaky connection
 * or a Firestore outage into a silent, permanent stop-syncing — the user
 * keeps working and nothing reaches their account. That is asserted
 * below, twice: once on the rule, once on a store whose every cloud call
 * rejects.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* THE WHOLE POINT OF THIS FILE: cloudEnabled false. Declared outright
   rather than spread over the real module — importing the original would
   run initializeApp against whatever is in the developer's .env, which
   Vite loads in test mode too. */
vi.mock('../firebase', () => ({ auth: null, db: null, cloudEnabled: false }))

const onAuthStateChanged = vi.fn(() => () => {})
const getDoc = vi.fn(async () => ({ exists: () => false, data: () => ({}) }))
const setDoc = vi.fn(async () => {})
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...s) => ({ path: s.join('/') }),
  getDoc: (...a) => getDoc(...a),
  setDoc: (...a) => setDoc(...a),
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...a) => onAuthStateChanged(...a),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { default: App } = await import('../App')
const { default: Settings } = await import('../components/Settings')
const { lsKey, todayIndex } = await import('../store/storeLogic')
const { recipeById } = await import('../data/recipes')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))
const seedPlan = () => localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(
  DAYS.map((day, i) => ({ day, ids: i === todayIdx() ? [1, 2] : [null, null] }))))

let host, root, box
function mount(node) {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <ThemeProvider><AppStoreProvider><Probe />{node}</AppStoreProvider></ThemeProvider>)
  })
}
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  onAuthStateChanged.mockClear(); getDoc.mockClear(); setDoc.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove(); root = null
  vi.restoreAllMocks()
})

/* ── The rule ─────────────────────────────────────────────────────── */
describe('the mode is decided by the config, and only by the config', () => {
  const full = {
    apiKey: 'k', authDomain: 'd', projectId: 'p',
    storageBucket: 's', messagingSenderId: 'm', appId: 'a',
  }

  it('needs all six keys', () => {
    expect(isConfigComplete(full)).toBe(true)
    for (const k of Object.keys(full)) {
      expect(isConfigComplete({ ...full, [k]: undefined }), k).toBe(false)
    }
  })

  /* A Vercel preview environment carries the names with empty values.
     An empty string and a missing key have to mean the same thing, or
     the preview build would try to reach a project called "". */
  it('treats an empty or whitespace value as missing', () => {
    expect(isConfigComplete({ ...full, projectId: '' })).toBe(false)
    expect(isConfigComplete({ ...full, projectId: '   ' })).toBe(false)
    expect(isConfigComplete({ ...full, apiKey: null })).toBe(false)
  })

  it('is not fooled by a non-string', () => {
    expect(isConfigComplete({ ...full, appId: 0 })).toBe(false)
    expect(isConfigComplete({ ...full, appId: true })).toBe(false)
    expect(isConfigComplete({})).toBe(false)
    expect(isConfigComplete()).toBe(false)
  })

  /* THE SAFETY PROPERTY, READ OFF THE SOURCE. `cloudEnabled` is a
     module-level const computed from import.meta.env — there is no
     assignment to it anywhere, and no catch block that could set it. */
  it('is a constant, with nothing at runtime able to flip it', () => {
    const src = readFileSync('src/firebase.js', 'utf8')
    expect(src).toMatch(/export const cloudEnabled = isConfigComplete\(firebaseConfig\)/)
    /* assigned exactly once, at module load */
    expect((src.match(/cloudEnabled\s*=/g) || [])).toHaveLength(1)
    /* and no try/catch anywhere near the decision — a fallback that
       fired on a caught error is the failure mode this rules out */
    expect(src).not.toContain('catch')
    expect(readFileSync('src/firebaseConfig.js', 'utf8')).not.toContain('catch')
  })
})

/* ── The app runs ─────────────────────────────────────────────────── */
describe('with no config, the app runs instead of hanging', () => {
  it('never subscribes to auth', () => {
    seedPlan()
    mount(null)
    expect(onAuthStateChanged).not.toHaveBeenCalled()
  })

  /* The defect, stated as its symptom: `user` used to stay undefined for
     ever and App would render the spinner. */
  it('resolves the auth gate immediately', () => {
    seedPlan()
    mount(null)
    expect(box.store.user).toBe(null)
    expect(box.store.user).not.toBeUndefined()
    expect(box.store.cloudEnabled).toBe(false)
  })

  it('renders the app, not the spinner and not the Auth screen', () => {
    seedPlan()
    mount(<App />)
    /* the spinner is a bare div with an animation and no text */
    expect(host.textContent).not.toBe('')
    expect(host.textContent).toContain('Today')
    expect(host.textContent).not.toContain('CONTINUE WITHOUT AN ACCOUNT')
    expect(host.textContent).not.toContain('CREATE ACCOUNT')
    /* and it is the real screen, from the device */
    expect(host.textContent).toContain(recipeById[1].name)
  })

  it('reads every screen from localStorage', () => {
    seedPlan()
    localStorage.setItem(lsKey(null, 'goals'),
      JSON.stringify({ calories: 2222, protein: 111, carbs: 99, fat: 44 }))
    mount(null)
    expect(box.store.goals.calories).toBe(2222)
    expect(box.store.weekPlan[todayIdx()].ids).toEqual([1, 2])
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('writes locally and never reaches for the cloud', () => {
    seedPlan()
    mount(null)
    act(() => { box.store.updateGoals({ calories: 2400, protein: 180, carbs: 200, fat: 60 }) })
    act(() => { box.store.toggleFavorite(7) })

    expect(setDoc).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'goals'))).calories).toBe(2400)
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'favorites')))).toEqual([7])
    /* and no write reported a failure, because none was attempted */
    expect(box.store.syncErrors).toEqual({})
  })
})

/* ── The mode is visible ──────────────────────────────────────────── */
describe('the mode is visible in the UI', () => {
  it('says LOCAL ONLY in Settings, and what it means', () => {
    mount(<Settings open onClose={() => {}} />)
    const note = host.querySelector('[data-local-only]')
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('LOCAL ONLY')
    expect(note.textContent).toContain('NOTHING SYNCS')
    expect(note.textContent).toContain('SAVED TO THIS DEVICE')
  })

  /* A build that has a cloud must NOT carry the label — otherwise it
     stops meaning anything. Asserted in settingsSheet.test.jsx, where
     cloudEnabled is true; here only that the element is gated. */
  it('is gated on cloudEnabled rather than always rendered', () => {
    const src = readFileSync('src/components/Settings.jsx', 'utf8')
    expect(src).toMatch(/\{!cloudEnabled && \(/)
  })
})

/* ── The property that matters most ───────────────────────────────── */
describe('a failed call can NEVER put a configured app into local-only', () => {
  it('keeps trying the cloud even when every call rejects', async () => {
    /* A store built WITH a cloud, whose every request fails. This is the
       outage case: it must report through syncErrors and keep the cloud
       path, not quietly fall back to local-only for the rest of the
       session. */
    vi.resetModules()
    vi.doMock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))
    let cb = null
    vi.doMock('firebase/auth', () => ({
      onAuthStateChanged: (_a, f) => { cb = f; return () => {} },
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(),
      signOut: vi.fn(),
    }))
    const failingSet = vi.fn(async () => { throw new Error('offline') })
    vi.doMock('firebase/firestore', () => ({
      doc: (_db, ...s) => ({ path: s.join('/') }),
      getDoc: async () => { throw new Error('offline') },
      setDoc: (...a) => failingSet(...a),
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { AppStoreProvider: P, useAppStore: use } = await import('../store/useAppStore')
    const b = {}
    function Probe() { b.store = use(); return null }
    const h = document.createElement('div')
    document.body.appendChild(h)
    const r = createRoot(h)
    await act(async () => { r.render(<P><Probe /></P>) })
    await act(async () => { await cb({ uid: 'u1' }) })

    expect(b.store.cloudEnabled).toBe(true)          // unchanged by the failures
    failingSet.mockClear()

    await act(async () => { b.store.toggleFavorite(3) })
    /* it STILL tried, and it reported */
    expect(failingSet.mock.calls.length).toBeGreaterThan(0)
    expect(Object.keys(b.store.syncErrors)).toContain('favourites')
    expect(b.store.cloudEnabled).toBe(true)

    act(() => { r.unmount() }); h.remove()
    vi.doUnmock('../firebase'); vi.doUnmock('firebase/auth'); vi.doUnmock('firebase/firestore')
  })
})
