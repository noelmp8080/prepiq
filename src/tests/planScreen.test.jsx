import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* Plan is the only screen that WRITES weekPlan. Everything else in the
   app is a view of what it stores. */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* cloudEnabled true: these cover the CLOUD path. Local-only mode
   has its own file — localOnly.test.jsx. */
vi.mock('../firebase', () => ({ auth: {}, db: {}, cloudEnabled: true }))
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
const { default: Plan } = await import('../components/Plan')
const { lsKey, todayIndex, sumMacros } = await import('../store/storeLogic')
const { recipes, recipeById } = await import('../data/recipes')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FIXTURE = DAYS.map((day, i) => ({ day, ids: i === 0 ? [1, 2] : [3, null] }))

let host, root, box
async function mount(plan = FIXTURE) {
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(plan))
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider><Probe /><Plan /></AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const text = () => host.textContent
const addSlots = () => [...host.querySelectorAll('button')]
  .filter(b => b.textContent === 'Add a meal')
const removeFor = name => [...host.querySelectorAll('button')]
  .find(b => (b.getAttribute('aria-label') || '').startsWith(`Remove ${name}`))
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

describe('the week', () => {
  it('shows seven day cards on flat panels, not translucent cards', async () => {
    await mount()
    const panels = [...host.querySelectorAll('div')]
      .filter(d => d.style.background === 'var(--pq-panel)')
    expect(panels).toHaveLength(7)
    /* A flat panel does not participate in the shell ramp. Seven
       translucent cards down one screen would each read a different
       lightness — right for one card, noise for a list. */
    for (const p of panels) {
      expect(p.style.borderRadius).toBe('var(--pq-r-card)')
      expect(p.style.background).not.toContain('card-bg')
    }
    for (const d of DAYS) expect(text()).toContain(d.toUpperCase())
  })

  it('marks today with an accent border, a pill, and an accent label', async () => {
    await mount()
    const panels = [...host.querySelectorAll('div')]
      .filter(d => d.style.background === 'var(--pq-panel)')
    const accented = panels.filter(p => p.style.border.includes('var(--pq-accent)'))
    expect(accented).toHaveLength(1)
    expect(accented[0]).toBe(panels[todayIdx()])
    expect(accented[0].textContent).toContain('TODAY')

    const others = panels.filter(p => p !== accented[0])
    for (const p of others) {
      expect(p.style.border).toContain('var(--pq-rule-soft)')
      expect(p.textContent).not.toContain('TODAY')
    }
  })

  it('averages over the days that have meals, not over seven', async () => {
    /* Two days planned, five bare. Averaging over 7 would report a week
       where every day is half-sized, which is not what a half-planned
       week is. */
    const plan = DAYS.map((day, i) => ({ day, ids: i < 2 ? [1, 2] : [null, null] }))
    await mount(plan)
    const twoDays = sumMacros([1, 2, 1, 2], recipeById)
    expect(text()).toContain(twoDays.calories.toLocaleString())
    expect(text()).toContain(Math.round(twoDays.calories / 2).toLocaleString())
    expect(text()).toContain('AVG / DAY')
  })

  it('reports zeroes rather than dividing by nothing on an empty week', async () => {
    await mount(DAYS.map(day => ({ day, ids: [null, null] })))
    expect(text()).toContain('WEEK KCAL')
    expect(text()).not.toContain('NaN')
    expect(text()).not.toContain('Infinity')
    expect(addSlots()).toHaveLength(14)
  })

  it('labels a bare day EMPTY rather than showing 0 KCAL', async () => {
    await mount(DAYS.map((day, i) => ({ day, ids: i === 0 ? [1, null] : [null, null] })))
    expect(text()).toContain('EMPTY')
  })
})

describe('editing a day', () => {
  it('removes a meal and leaves the slot open', async () => {
    await mount()
    expect(text()).toContain(recipeById[1].name)
    const before = addSlots().length

    act(() => { removeFor(recipeById[1].name).click() })

    expect(text()).not.toContain(recipeById[1].name)
    expect(addSlots()).toHaveLength(before + 1)
    expect(box.store.weekPlan[0].ids).toEqual([null, 2])
  })

  it('assigns from the picker into the slot that was tapped', async () => {
    await mount()
    /* Monday is full, so the first free slot is Tuesday's second. */
    act(() => { addSlots()[0].click() })
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('TUE')

    const pick = [...dialog.querySelectorAll('button')]
      .find(b => b.textContent.includes(recipes[10].name))
    act(() => { pick.click() })

    expect(host.querySelector('[role="dialog"]')).toBe(null)
    expect(box.store.weekPlan[1].ids).toEqual([3, recipes[10].id])
  })

  it('searches the picker by name', async () => {
    await mount()
    act(() => { addSlots()[0].click() })
    const input = host.querySelector('input')
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set
    act(() => {
      setter.call(input, recipeById[1].name)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain(recipeById[1].name)

    act(() => {
      setter.call(input, 'zzzznotarecipe')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[role="dialog"]').textContent).toContain('NOTHING MATCHES')
  })

  it('persists an edit through a reload', async () => {
    await mount()
    act(() => { removeFor(recipeById[1].name).click() })
    const stored = JSON.parse(localStorage.getItem(lsKey(null, 'weekplan')))
    expect(stored[0].ids).toEqual([null, 2])
  })

  it('shuffles the whole week', async () => {
    await mount()
    const before = JSON.stringify(box.store.weekPlan)
    act(() => {
      [...host.querySelectorAll('button')].find(b => b.textContent === 'SHUFFLE').click()
    })
    expect(JSON.stringify(box.store.weekPlan)).not.toBe(before)
    expect(box.store.weekPlan).toHaveLength(7)
  })

  it('opens the recipe sheet from a filled row', async () => {
    await mount()
    const row = [...host.querySelectorAll('button')]
      .find(b => b.textContent.includes(recipeById[1].name) && !b.getAttribute('aria-label'))
    act(() => { row.click() })
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('INSTRUCTIONS')
  })
})

describe('the handoff values', () => {
  it('sizes Plan thumbnails at 36px with the 7px radius', async () => {
    await mount()
    const thumbs = [...host.querySelectorAll('img, div, span')]
      .filter(e => e.style.width === '36px')
    expect(thumbs.length).toBeGreaterThan(0)
    for (const t of thumbs) expect(t.style.borderRadius).toBe('7px')
  })

  it('draws the empty slot as a dashed 36px square with a plus', async () => {
    await mount()
    const square = addSlots()[0].querySelector('span')
    expect(square.style.width).toBe('36px')
    expect(square.style.borderRadius).toBe('7px')
    expect(square.style.border).toBe('var(--pq-rule-dashed)')
    expect(square.querySelector('svg')).toBeTruthy()
  })

  it('is a three-cell stat strip divided by 1px rules', async () => {
    await mount()
    const strip = [...host.querySelectorAll('div')]
      .find(d => d.style.gridTemplateColumns === 'repeat(3,1fr)')
    expect(strip).toBeTruthy()
    expect([...strip.children]).toHaveLength(3)
    expect(strip.children[0].style.borderRight).toBe('1px solid var(--pq-rule-cell)')
    expect(strip.children[1].style.borderRight).toBe('1px solid var(--pq-rule-cell)')
    expect(strip.children[2].style.borderRight).toBe('')
  })

  it('says that changes here reach the grocery list', async () => {
    await mount()
    expect(text()).toContain('CHANGES HERE UPDATE THE GROCERY LIST AUTOMATICALLY')
  })

  it('gives every button at least 44px', async () => {
    await mount()
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\d+px|^\d{3,}px/)
    }
  })
})
