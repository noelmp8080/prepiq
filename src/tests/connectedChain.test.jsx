import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* ── THE CHAIN, END TO END ────────────────────────────────────────────
 *
 * The gate block C is held to. Block B could walk Plan -> grocery and no
 * further, because Today and Track did not read `weekPlan` at all; that
 * half was carried into this block.
 *
 * This mounts all four surfaces under ONE store and changes the plan.
 * That is the point: if any screen kept its own copy of the week, the
 * others would not move. Counts are asserted before and after, because
 * "it updates" is the kind of claim that survives a screen quietly
 * rendering nothing.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...s) => ({ path: s.join('/') }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {},
}))
let authCb = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a, cb) => { authCb = cb; return () => {} },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

const { AppStoreProvider, useAppStore } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { default: Today } = await import('../components/Today')
const { default: Plan } = await import('../components/Plan')
const { default: Grocery } = await import('../components/Grocery')
const { default: Track } = await import('../components/Track')
const { lsKey, todayIndex, buildGroceryItems } = await import('../store/storeLogic')
const { recipeById } = await import('../data/recipes')
const { default: catalog } = await import('../data/groceryCatalog.json')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

let host, root, box
async function mountAll(todayMeals) {
  const idx = todayIdx()
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(
    DAYS.map((day, i) => ({ day, ids: i === idx ? [...todayMeals] : [null, null] }))))

  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider>
        <Probe />
        <section data-s="today"><Today onChange={() => {}} /></section>
        <section data-s="plan"><Plan /></section>
        <section data-s="grocery"><Grocery /></section>
        <section data-s="track"><Track onChange={() => {}} /></section>
      </AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
  return idx
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const screen = name => host.querySelector(`[data-s="${name}"]`)
const buttons = name => [...screen(name).querySelectorAll('button')]

/** What each surface is showing, as numbers. */
function census() {
  return {
    today: buttons('today').filter(b => b.textContent === 'ATE IT' || b.textContent === 'LOGGED').length,
    plan: buttons('plan').filter(b => (b.getAttribute('aria-label') || '').startsWith('Remove ')).length,
    /* The row's left button is the only thing in the grocery list
       carrying aria-pressed — semantic rather than a style match, which
       is what broke when the row height became a token. */
    grocery: [...screen('grocery').querySelectorAll('[data-grocery-list] button[aria-pressed]')].length,
    track: buttons('track').filter(b => (b.getAttribute('aria-label') || '').startsWith('Log ')).length,
  }
}

describe('one plan, four surfaces', () => {
  it('moves every screen when the plan changes — measured, not assumed', async () => {
    /* Monday-equivalent: recipes 1 and 2. Their grocery footprint is a
       known quantity from block B. */
    const idx = await mountAll([1, 2])

    const before = census()
    const groceryRows = buildGroceryItems(box.store.weekPlan, catalog, new Set(), idx)
    expect(before.today).toBe(2)
    expect(before.plan).toBe(2)
    expect(before.track).toBe(2)
    expect(before.grocery).toBeGreaterThan(10)
    expect(groceryRows).toHaveLength(25)

    /* ── THE CHANGE: remove one meal from the plan ── */
    await act(async () => {
      buttons('plan').find(b =>
        (b.getAttribute('aria-label') || '').startsWith(`Remove ${recipeById[1].name}`)).click()
    })

    const after = census()
    expect(after.plan).toBe(1)
    expect(after.today).toBe(1)
    expect(after.track).toBe(1)
    expect(after.grocery).toBeLessThan(before.grocery)

    /* the derivation agrees with what the screen drew */
    const afterRows = buildGroceryItems(box.store.weekPlan, catalog, new Set(), idx)
    expect(afterRows.length).toBeLessThan(groceryRows.length)

    /* and the removed recipe is gone from every surface at once */
    for (const s of ['today', 'plan', 'track']) {
      expect(screen(s).textContent, s).not.toContain(recipeById[1].name)
      expect(screen(s).textContent, s).toContain(recipeById[2].name)
    }
  })

  it('adds a meal and every surface grows again', async () => {
    const idx = await mountAll([1, null])
    const before = census()
    expect(before).toMatchObject({ today: 1, plan: 1, track: 1 })

    await act(async () => { box.store.assignMeal(idx, 7) })

    const after = census()
    expect(after).toMatchObject({ today: 2, plan: 2, track: 2 })
    expect(after.grocery).toBeGreaterThan(before.grocery)
    for (const s of ['today', 'plan', 'track']) {
      expect(screen(s).textContent, s).toContain(recipeById[7].name)
    }
  })

  /* Logging is the other direction: it moves Today and Track without
     touching the plan or the shopping list, because eating something
     does not un-plan it and does not un-buy the ingredients. */
  it('logging moves Today and Track, and leaves Plan and Grocery alone', async () => {
    await mountAll([1, 2])
    const before = census()

    await act(async () => {
      buttons('track').find(b =>
        (b.getAttribute('aria-label') || '') === `Log ${recipeById[1].name}`).click()
    })

    const after = census()
    expect(after.track).toBe(before.track - 1)          // one fewer to log
    expect(after.today).toBe(before.today)             // still two rows, one struck through
    expect(after.plan).toBe(before.plan)
    expect(after.grocery).toBe(before.grocery)

    const todayText = screen('today').textContent
    expect(todayText).toContain('LOGGED')
    expect(box.store.consumed.calories).toBe(recipeById[1].cal)
  })

  it('never shows a manual sync affordance anywhere', async () => {
    await mountAll([1, 2])
    const all = [...host.querySelectorAll('button')].map(b => b.textContent.toLowerCase())
    for (const word of ['sync', 'refresh', 'add to list', 'update list']) {
      expect(all.some(t => t.includes(word)), `found a "${word}" control`).toBe(false)
    }
  })

  it('empties every surface together on a bare day', async () => {
    await mountAll([null, null])
    const c = census()
    expect(c).toEqual({ today: 0, plan: 0, track: 0, grocery: 0 })
    expect(screen('today').textContent).toContain('Nothing planned for today')
    expect(screen('track').textContent).not.toContain('PLANNED · ONE TAP TO LOG')
    expect(screen('plan').textContent).toContain('EMPTY')
  })
})

/* ── STANDING VERIFICATION ────────────────────────────────────────────
 *
 * The items the brief lists as the gate, asserted rather than eyeballed.
 */
describe('the standing gate', () => {
  it('works with the network down — every screen, from the device', async () => {
    /* THE RADIO IS OFF, not "signed out". The auth callback is never
       fired and getDoc is never reached, which is what a cold start with
       no network actually looks like: Firebase has nothing to say and
       says it slowly. Block B made hydration synchronous and local-first
       precisely for this, and this is where it is proved — every screen
       fills from the device with no network event of any kind. */
    const idx = todayIdx()
    localStorage.setItem(lsKey('u1', 'weekplan'), JSON.stringify(
      DAYS.map((day, i) => ({ day, ids: i === idx ? [1, 2] : [null, null] }))))
    localStorage.setItem('prepiq_last_uid', JSON.stringify('u1'))

    box = {}
    function Probe() { box.store = useAppStore(); return null }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <ThemeProvider><AppStoreProvider>
          <Probe />
          <section data-s="today"><Today onChange={() => {}} /></section>
          <section data-s="plan"><Plan /></section>
          <section data-s="grocery"><Grocery /></section>
          <section data-s="track"><Track onChange={() => {}} /></section>
        </AppStoreProvider></ThemeProvider>)
    })

    /* No auth callback fired at all — the radio is off. */
    expect(box.store.user).toBeUndefined()
    expect(box.store.bootScope).toBe('u1')
    const c = census()
    expect(c.today).toBe(2)
    expect(c.plan).toBe(2)
    expect(c.track).toBe(2)
    expect(c.grocery).toBeGreaterThan(10)
    expect(screen('today').textContent).toContain(recipeById[1].name)
  })

  it('renders every screen without a console error', async () => {
    const errors = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')))
    await mountAll([1, 2])
    /* touch the interactive paths that would warn: open a sheet, log,
       remove, filter */
    await act(async () => {
      buttons('track').find(b => (b.getAttribute('aria-label') || '').startsWith('Log ')).click()
    })
    await act(async () => {
      buttons('today').find(b => b.textContent.includes(recipeById[2].name)).click()
    })
    spy.mockRestore()
    expect(errors, errors.join('\n')).toEqual([])
  })

  /* Nothing below 44px on a touch surface — swept across all four
     screens at once rather than trusted per file. */
  it('has no touch target under 44px on any screen', async () => {
    await mountAll([1, 2])
    const offenders = []
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      if (!h) { offenders.push(`${b.textContent.slice(0, 20)}: no height`); continue }
      if (/var\(--pq-tap-min\)|var\(--pq-row-grocery\)/.test(h)) continue
      const px = parseInt(h, 10)
      if (!Number.isFinite(px) || px < 44) offenders.push(`${b.textContent.slice(0, 20)}: ${h}`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('draws fallback tiles at the three sizes with the fixed radii', async () => {
    const { default: Thumb } = await import('../components/Thumb')
    const { renderToStaticMarkup } = await import('react-dom/server')
    for (const [size, radius] of [[36, 7], [48, 9], [56, 10]]) {
      const html = renderToStaticMarkup(<Thumb recipe={{ name: 'Test Recipe' }} size={size} />)
      expect(html).toContain(`width:${size}px`)
      expect(html).toContain(`border-radius:${radius}px`)
    }
  })
})
