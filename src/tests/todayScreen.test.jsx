import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'

/* Today is a VIEW of the plan. The version this replaces read only
   `mealLog` and never mentioned `weekPlan`, which is why block B's chain
   walk stopped here and was carried into block C. */

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
const { lsKey, todayIndex } = await import('../store/storeLogic')
const { recipes, recipeById } = await import('../data/recipes')
/* A real recipe that is on no day of the fixture plan. */
const OFF_PLAN = recipes.find(r => ![1, 2, 3, 7, 40, 41].includes(r.id))

/* Whatever weekday the suite runs on, the plan puts the same two meals
   there — so "today" is real (no clock stubbing) and the content is
   fixed. Every other day carries a recipe that must NOT appear. */
const TODAY_IDS = [1, 2]
const OTHER_IDS = [40, 41]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const planWith = (todayIdx, ids = TODAY_IDS) =>
  DAYS.map((day, i) => ({ day, ids: i === todayIdx ? [...ids] : [...OTHER_IDS] }))

let host, root, box
async function render() {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider>
        <Probe /><Today onChange={box.onChange = vi.fn()}
                        onOpenSettings={box.onOpenSettings = vi.fn()} />
      </AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
  return host
}
/* Seeded before mount, because hydration is synchronous now. */
async function mountWith(ids = TODAY_IDS) {
  const idx = todayIndex(DAYS.map(d => ({ day: d, ids: [] })))
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(planWith(idx, ids)))
  await render()
  return idx
}

beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const text = () => host.textContent
const eatButtons = () => [...host.querySelectorAll('button')]
  .filter(b => b.textContent === 'ATE IT' || b.textContent === 'LOGGED')

/* ── The carried-forward chain link ───────────────────────────────── */
describe('Today reads the plan', () => {
  it('mentions weekPlan at all — the block B blocker', () => {
    const src = readFileSync('src/components/Today.jsx', 'utf8')
    expect(src).toContain('weekPlan')
    expect(src).toContain('planToday')
  })

  it('shows exactly the meals planned for today', async () => {
    await mountWith()
    expect(text()).toContain(recipeById[1].name)
    expect(text()).toContain(recipeById[2].name)
    /* and nothing from the other six days */
    expect(text()).not.toContain(recipeById[40].name)
    expect(text()).not.toContain(recipeById[41].name)
    expect(eatButtons()).toHaveLength(2)
  })

  /* THE WALK, at this link. Changing the plan changes Today with nothing
     pressed in between. */
  it('follows a change to the plan with no sync step', async () => {
    const idx = await mountWith()
    expect(text()).toContain(recipeById[1].name)

    await act(async () => { box.store.removeMeal(idx, 0) })
    expect(text()).not.toContain(recipeById[1].name)
    expect(text()).toContain(recipeById[2].name)

    await act(async () => { box.store.assignMeal(idx, 7) })
    expect(text()).toContain(recipeById[7].name)
  })

  it('shows the dashed block, not an empty card, on a bare day', async () => {
    const idx = todayIndex(DAYS.map(d => ({ day: d, ids: [] })))
    localStorage.setItem(lsKey(null, 'weekplan'),
      JSON.stringify(DAYS.map((day, i) => ({ day, ids: i === idx ? [null, null] : [...OTHER_IDS] }))))
    await render()
    expect(text()).toContain('Nothing planned for today')
    expect(eatButtons()).toHaveLength(0)

    const block = [...host.querySelectorAll('button')]
      .find(b => b.textContent.includes('Nothing planned'))
    expect(block.style.border).toBe('var(--pq-rule-dashed)')
    act(() => { block.click() })
    expect(box.onChange).toHaveBeenCalledWith('plan')
  })
})

/* ── Planned vs logged ────────────────────────────────────────────── */
describe('logging from Today', () => {
  it('marks one meal done without touching the other', async () => {
    await mountWith()
    act(() => { eatButtons()[0].click() })

    const labels = eatButtons().map(b => b.textContent)
    expect(labels).toEqual(['LOGGED', 'ATE IT'])
    expect(box.store.mealLog).toHaveLength(1)
    expect(box.store.consumed.calories).toBe(recipeById[1].cal)
  })

  it('strikes the name through rather than removing the row', async () => {
    await mountWith()
    const before = eatButtons().length
    act(() => { eatButtons()[0].click() })

    expect(eatButtons()).toHaveLength(before)
    const name = [...host.querySelectorAll('span')]
      .find(s => s.textContent === recipeById[1].name)
    expect(name.style.textDecoration).toBe('line-through')
  })

  it('unlogs on a second tap, and the macros come back down', async () => {
    await mountWith()
    act(() => { eatButtons()[0].click() })
    expect(box.store.consumed.calories).toBeGreaterThan(0)
    act(() => { eatButtons()[0].click() })
    expect(box.store.mealLog).toHaveLength(0)
    expect(box.store.consumed.calories).toBe(0)
  })

  /* One log entry per planned slot. A day planning the same recipe twice
     must show one done and one to go — otherwise the second is counted
     as eaten without anybody eating it. */
  it('ticks one of two identical planned meals', async () => {
    await mountWith([3, 3])
    expect(eatButtons()).toHaveLength(2)
    act(() => { eatButtons()[0].click() })
    expect(eatButtons().map(b => b.textContent)).toEqual(['LOGGED', 'ATE IT'])
  })
})

describe('ALSO LOGGED', () => {
  it('stays hidden while everything logged was planned', async () => {
    await mountWith()
    expect(text()).not.toContain('ALSO LOGGED')
    act(() => { eatButtons()[0].click() })
    expect(text()).not.toContain('ALSO LOGGED')
  })

  it('appears for something eaten off-plan, with a way to remove it', async () => {
    await mountWith()
    await act(async () => { box.store.logMeal(OFF_PLAN.id, 'snack') })

    expect(text()).toContain('ALSO LOGGED')
    expect(text()).toContain(OFF_PLAN.name)

    const remove = [...host.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === `Remove ${OFF_PLAN.name}`)
    act(() => { remove.click() })
    expect(text()).not.toContain('ALSO LOGGED')
  })
})

/* ── The macro card, as ruled ─────────────────────────────────────── */
describe('the macro card', () => {
  const grid = () => [...host.querySelectorAll('div')]
    .find(d => d.style.gridTemplateColumns === '1fr 1fr')

  it('is two cells, per the markup ruling — not the four the prose describes', async () => {
    await mountWith()
    expect(grid()).toBeTruthy()
    expect(grid().children).toHaveLength(2)
    expect(grid().textContent).toContain('KCAL')
    expect(grid().textContent).toContain('PROTEIN')
    /* carbs and fat are present, as the summary line beneath */
    expect(grid().textContent).not.toContain('CARBS')
    expect(text()).toMatch(/C \d+g · F \d+g/)
  })

  it('draws 3px bars on the inset well, dividing cells with 1px rules', async () => {
    await mountWith()
    const cells = [...grid().children]
    expect(cells[0].style.borderRight).toBe('1px solid var(--pq-rule-cell)')
    for (const cell of cells) {
      const track = [...cell.querySelectorAll('div')].find(d => d.style.height === '3px')
      expect(track, 'no 3px bar in a macro cell').toBeTruthy()
      expect(track.style.background).toBe('var(--pq-track-bg)')
      expect(track.style.boxShadow).toBe('var(--pq-track-shadow)')
    }
  })

  it('caps the bar at 100% while the number keeps climbing', async () => {
    await mountWith()
    await act(async () => { box.store.updateGoals({ calories: 100, protein: 10, carbs: 10, fat: 10 }) })
    act(() => { eatButtons()[0].click() })

    const fill = [...grid().querySelectorAll('div')]
      .find(d => d.style.width && d.style.width.endsWith('%'))
    expect(fill.style.width).toBe('100%')
    expect(text()).toContain(String(recipeById[1].cal))    // the real number, unclamped
    expect(text()).toContain('OVER')
  })

  it('says LEFT while under the goal', async () => {
    await mountWith()
    expect(text()).toContain('LEFT')
    expect(text()).not.toContain('OVER')
  })
})

describe('chrome', () => {
  it('carries the logo lockup and a mono date eyebrow', async () => {
    await mountWith()
    expect(text()).toContain('Prep')
    expect(text()).toContain('IQ')
    expect(text()).toMatch(/[A-Z]{3} · [A-Z]{3} \d{1,2}/)
  })

  /* Today ASKS for Settings; App owns it. That moved in block E so the
     same mounted component can be a sheet on phone and a pane on wide
     without losing a half-typed goal on a resize. */
  it('asks App to open Settings rather than owning it', async () => {
    await mountWith()
    expect(host.querySelector('[role="dialog"]')).toBe(null)
    act(() => {
      [...host.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === 'Settings').click()
    })
    expect(box.onOpenSettings).toHaveBeenCalled()
    /* and it did NOT render one itself */
    expect(host.querySelector('[role="dialog"]')).toBe(null)
    expect(text()).not.toContain('NUTRITION TARGETS')
  })

  it('opens the recipe sheet from a meal row', async () => {
    await mountWith()
    const row = [...host.querySelectorAll('button')]
      .find(b => b.textContent.includes(recipeById[1].name))
    act(() => { row.click() })
    const dlg = host.querySelector('[role="dialog"]')
    expect(dlg).toBeTruthy()
    expect(dlg.textContent).toContain('INGREDIENTS')
  })

  it('gives every button at least 44px', async () => {
    await mountWith()
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\d+px|^\d{3,}px/)
    }
  })

  it('sizes meal thumbnails at 48px with the 9px radius', async () => {
    await mountWith()
    const thumbs = [...host.querySelectorAll('img, div')].filter(e => e.style.width === '48px')
    expect(thumbs.length).toBeGreaterThan(0)
    for (const t of thumbs) expect(t.style.borderRadius).toBe('9px')
  })
})
