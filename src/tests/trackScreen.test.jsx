import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'

/* Track is the other end of Today's pairing: Today marks planned meals
   already eaten, Track offers the ones that are not. */

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
const { default: Track } = await import('../components/Track')
const { lsKey, todayIndex } = await import('../store/storeLogic')
const { recipeById } = await import('../data/recipes')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TODAY_IDS = [1, 2]
const OTHER_IDS = [40, 41]
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

let host, root, box
async function mount(ids = TODAY_IDS) {
  const idx = todayIdx()
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(
    DAYS.map((day, i) => ({ day, ids: i === idx ? [...ids] : [...OTHER_IDS] }))))
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider>
        <Probe /><Track onChange={box.onChange = vi.fn()} />
      </AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
  return idx
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const text = () => host.textContent
const plannedRows = () => [...host.querySelectorAll('button')]
  .filter(b => (b.getAttribute('aria-label') || '').startsWith('Log '))
const removeRows = () => [...host.querySelectorAll('button')]
  .filter(b => (b.getAttribute('aria-label') || '').startsWith('Remove '))

/* ── The carried-forward chain link ───────────────────────────────── */
describe('Track pre-fills from the plan', () => {
  it('mentions weekPlan at all — the other block B blocker', () => {
    const src = readFileSync('src/components/Track.jsx', 'utf8')
    expect(src).toContain('weekPlan')
    expect(src).toContain('planVsLog')
  })

  it('offers today’s planned meals under PLANNED · ONE TAP TO LOG', async () => {
    await mount()
    expect(text()).toContain('PLANNED · ONE TAP TO LOG')
    expect(plannedRows()).toHaveLength(2)
    expect(text()).toContain(recipeById[1].name)
    expect(text()).toContain(recipeById[2].name)
    /* and nothing from another day */
    expect(text()).not.toContain(recipeById[40].name)
  })

  it('follows a change to the plan with no sync step', async () => {
    const idx = await mount()
    expect(text()).toContain(recipeById[1].name)

    await act(async () => { box.store.removeMeal(idx, 0) })
    expect(plannedRows()).toHaveLength(1)
    expect(text()).not.toContain(recipeById[1].name)

    await act(async () => { box.store.assignMeal(idx, 7) })
    expect(plannedRows()).toHaveLength(2)
    expect(text()).toContain(recipeById[7].name)
  })
})

describe('one tap to log', () => {
  it('logs the meal with its macros and moves it out of PLANNED', async () => {
    await mount()
    act(() => { plannedRows()[0].click() })

    expect(box.store.mealLog).toHaveLength(1)
    expect(box.store.consumed.calories).toBe(recipeById[1].cal)
    expect(box.store.consumed.protein).toBe(recipeById[1].protein)
    expect(plannedRows()).toHaveLength(1)
    /* it is now under LOGGED, so the name is still on screen */
    expect(text()).toContain(recipeById[1].name)
  })

  it('drops the PLANNED block once everything is logged', async () => {
    await mount()
    act(() => { plannedRows()[0].click() })
    act(() => { plannedRows()[0].click() })
    expect(plannedRows()).toHaveLength(0)
    expect(text()).not.toContain('PLANNED · ONE TAP TO LOG')
  })

  /* Two identical planned meals must be logged one at a time — the
     shared pairing, seen from Track's side. */
  it('offers the second of two identical meals after logging the first', async () => {
    await mount([3, 3])
    expect(plannedRows()).toHaveLength(2)
    act(() => { plannedRows()[0].click() })
    expect(plannedRows()).toHaveLength(1)
    expect(box.store.mealLog).toHaveLength(1)
  })

  it('removes a logged entry and the macros come back down', async () => {
    await mount()
    act(() => { plannedRows()[0].click() })
    expect(box.store.consumed.calories).toBeGreaterThan(0)

    act(() => { removeRows()[0].click() })
    expect(box.store.mealLog).toHaveLength(0)
    expect(box.store.consumed.calories).toBe(0)
    /* and it is offered again, because it is planned and not logged */
    expect(plannedRows()).toHaveLength(2)
  })
})

describe('LOGGED', () => {
  it('shows the dashed block before anything is logged', async () => {
    await mount()
    expect(text()).toContain('Nothing logged yet today')
    const block = [...host.querySelectorAll('div')]
      .find(d => d.style.border === 'var(--pq-rule-dashed)')
    expect(block).toBeTruthy()
    expect(block.style.borderRadius).toBe('var(--pq-r-card)')
  })

  it('opens the recipe sheet from a logged row', async () => {
    await mount()
    act(() => { plannedRows()[0].click() })
    const row = [...host.querySelectorAll('button')]
      .find(b => b.textContent.includes(recipeById[1].name) && !b.getAttribute('aria-label'))
    act(() => { row.click() })
    expect(host.querySelector('[role="dialog"]').textContent).toContain('INSTRUCTIONS')
  })

  it('survives a log entry whose recipe no longer exists', async () => {
    await mount()
    await act(async () => { box.store.logMeal(999999, 'ghost') })
    expect(text()).toContain('Removed recipe')
    expect(text()).not.toContain('undefined')
    expect(text()).not.toContain('NaN')
  })
})

/* ── The macro card, as ruled ─────────────────────────────────────── */
describe('the macro card is not Today’s', () => {
  it('is a large kcal readout over three stacked macro rows', async () => {
    await mount()
    /* the README says "the same four-cell grid as Today"; the markup
       gives Track its own treatment, and that is what was ruled */
    expect([...host.querySelectorAll('div')]
      .find(d => d.style.gridTemplateColumns)).toBeUndefined()

    const big = [...host.querySelectorAll('span')].find(s => s.style.fontSize === '30px')
    expect(big).toBeTruthy()
    expect(big.style.color).toBe('var(--pq-accent)')
    expect(text()).toContain(`/ ${box.store.goals.calories} kcal`)

    for (const label of ['PROTEIN', 'CARBS', 'FAT']) expect(text()).toContain(label)
  })

  it('draws a 4px kcal bar and 3px macro bars, all on the inset well', async () => {
    await mount()
    const bars = [...host.querySelectorAll('div')]
      .filter(d => d.style.background === 'var(--pq-track-bg)')
    expect(bars).toHaveLength(4)
    expect(bars[0].style.height).toBe('4px')
    for (const b of bars.slice(1)) expect(b.style.height).toBe('3px')
    for (const b of bars) expect(b.style.boxShadow).toBe('var(--pq-track-shadow)')
  })

  it('caps the bars at 100% while the numbers keep going', async () => {
    await mount()
    await act(async () => {
      box.store.updateGoals({ calories: 100, protein: 5, carbs: 5, fat: 5 })
    })
    act(() => { plannedRows()[0].click() })

    const fills = [...host.querySelectorAll('div')]
      .filter(d => d.style.width && d.style.width.endsWith('%'))
    expect(fills.length).toBeGreaterThan(0)
    for (const f of fills) expect(f.style.width).toBe('100%')
    expect(text()).toContain(String(recipeById[1].cal))
    expect(text()).toContain('OVER')
  })
})

describe('chrome', () => {
  it('sends LOG to the recipes screen rather than opening a second picker', async () => {
    await mount()
    act(() => {
      [...host.querySelectorAll('button')].find(b => b.textContent === 'LOG').click()
    })
    expect(box.onChange).toHaveBeenCalledWith('recipes')
  })

  it('gives every button at least 44px', async () => {
    await mount()
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\d+px|^\d{3,}px/)
    }
  })

  it('draws the planned row marker as a 26px dashed square with a plus', async () => {
    await mount()
    const marker = plannedRows()[0].querySelector('span[aria-hidden="true"]')
    expect(marker.style.width).toBe('26px')
    expect(marker.style.borderRadius).toBe('7px')
    expect(marker.style.border).toContain('dashed')
    expect(marker.querySelector('svg')).toBeTruthy()
  })
})
