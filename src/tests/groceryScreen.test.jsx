import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* The grocery screen's behaviour, as distinct from its no-reflow
   contract (groceryNoReflow.test.jsx). Clear is here because it broke
   once already — the derivation read `dayIndex:itemId` while the store
   still wrote bare ids, both halves green, and nothing ran them against
   each other through storage. */

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
const { default: Grocery } = await import('../components/Grocery')
const { lsKey, todayIndex, dayKey, EXCLUDED_VERSION } = await import('../store/storeLogic')
const { recipeById } = await import('../data/recipes')

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/* Mon and Tue carry meals, the rest are bare — so the chip dots, the
   empty state and the day switch are all reachable from one fixture. */
const PLAN = DAYS.map((day, i) => ({ day, ids: i === 0 ? [1, 2] : i === 1 ? [3, 4] : [null, null] }))
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

let host, root, box
async function mount(plan = PLAN, seed) {
  localStorage.clear()
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(plan))
  if (seed) seed()
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <AppStoreProvider><Probe /><Grocery onChange={box.onChange = vi.fn()} /></AppStoreProvider>)
  })
  await act(async () => { await authCb(null) })
}
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const text = () => host.textContent
const header = () => host.querySelector('[data-grocery-header]')
const rows = () => [...host.querySelectorAll('[data-grocery-list] button[aria-pressed]')]
const chips = () => [...header().querySelectorAll('button[aria-pressed]')]
const sectionHeaders = () => [...host.querySelectorAll('[data-grocery-list] button[aria-expanded]')]
  .filter(b => !(b.getAttribute('aria-label') || '').includes('need'))
const expanders = () => [...host.querySelectorAll('[data-grocery-list] button[aria-expanded]')]
  .filter(b => (b.getAttribute('aria-label') || '').includes('need'))
const clearBtn = () => [...header().querySelectorAll('button')]
  .find(b => b.textContent.startsWith('CLEAR'))
const nameOf = row => row.querySelector('span:last-child').textContent

/* Whichever day the suite runs on, select Monday so the content is
   fixed. Monday is recipes 1 and 2 in the fixture. */
async function selectMonday() { await act(async () => { chips()[0].click() }) }

describe('the header', () => {
  it('counts what is left, and says which day and how many meals', async () => {
    await mount()
    await selectMonday()
    expect(text()).toContain('25 left')
    expect(header().textContent).toContain('MON')
    expect(header().textContent).toContain('2 MEALS')
  })

  it('says TODAY only while the day shown is today', async () => {
    await mount()
    expect(header().textContent).toContain('TODAY')
    const other = todayIdx() === 0 ? 1 : 0
    await act(async () => { chips()[other].click() })
    expect(header().textContent).not.toContain('TODAY')
  })

  it('reads All done when every row is checked', async () => {
    await mount()
    await selectMonday()
    await act(async () => { for (const r of rows()) r.click() })
    /* the spice rack is collapsed, so its six rows are not on screen and
       cannot be tapped — check them through the store */
    await act(async () => {
      box.store.checkAllGrocery(box.store.groceryRows.map(r => r.id))
    })
    expect(text()).toContain('All done')
    expect(text()).not.toContain('left')
  })

  it('keeps Clear dead until something is checked', async () => {
    await mount()
    await selectMonday()
    expect(clearBtn().disabled).toBe(true)
    expect(clearBtn().textContent).toBe('CLEAR')
    expect(clearBtn().style.background).toBe('transparent')

    await act(async () => { rows()[0].click() })
    expect(clearBtn().disabled).toBe(false)
    expect(clearBtn().textContent).toBe('CLEAR 1')
    expect(clearBtn().style.background).toBe('var(--pq-accent-grad)')
  })

  it('draws the progress bar from the checked proportion', async () => {
    await mount()
    await selectMonday()
    const fill = () => header().querySelector('[data-progress-fill]')
    expect(fill().style.width).toBe('0%')
    await act(async () => { rows()[0].click() })
    expect(fill().style.width).toBe('4%')             // 1 of 25
  })
})

describe('day chips', () => {
  it('shows seven, marks the days with meals, and starts on today', async () => {
    await mount()
    expect(chips()).toHaveLength(7)
    expect(chips()[todayIdx()].getAttribute('aria-pressed')).toBe('true')
    expect(chips().filter(c => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1)

    /* dots on Mon and Tue only, per the fixture */
    const dotted = chips().filter(c => c.textContent.includes('•'))
    expect(dotted).toHaveLength(2)
    expect(chips().indexOf(dotted[0])).toBe(0)
    expect(chips().indexOf(dotted[1])).toBe(1)
  })

  it('re-derives the whole list on a tap', async () => {
    await mount()
    await selectMonday()
    expect(text()).toContain('25 left')
    expect(text().toLowerCase()).toContain('low calorie tortilla wrap')   // recipe 1

    await act(async () => { chips()[1].click() })
    expect(text()).toContain('31 left')                                    // Tue = 3, 4
    expect(text().toLowerCase()).not.toContain('low calorie tortilla wrap')
    expect(text().toLowerCase()).toContain('basmati rice')                 // recipe 3
  })

  it('takes the accent when selected and the well when not', async () => {
    await mount()
    await selectMonday()
    const pill = c => c.querySelector('span')
    expect(pill(chips()[0]).style.background).toBe('var(--pq-accent-grad)')
    expect(pill(chips()[0]).style.boxShadow).toBe('var(--pq-accent-raise)')
    expect(pill(chips()[3]).style.background).toBe('transparent')
    expect(pill(chips()[3]).style.boxShadow).toBe('inset 0 1px 2px rgba(0,0,0,0.35)')
  })
})

describe('sections', () => {
  it('collapses the spice rack by default, from the catalog', async () => {
    await mount()
    await selectMonday()
    const spice = sectionHeaders().find(h => h.textContent.includes('Spices & seasoning'))
    expect(spice.getAttribute('aria-expanded')).toBe('false')
    expect(spice.querySelector('svg').style.transform).toBe('rotate(-90deg)')

    const produce = sectionHeaders().find(h => h.textContent.includes('Produce'))
    expect(produce.getAttribute('aria-expanded')).toBe('true')
    expect(produce.querySelector('svg').style.transform).toBe('none')
  })

  /* COLLAPSE STATE PERSISTS ACROSS DAY CHANGES. It is about how you
     shop, not about which day it is — and re-seeding it per day would
     reopen the spice rack every time you looked at tomorrow. */
  it('remembers what is shut when the day changes', async () => {
    await mount()
    await selectMonday()
    const produce = () => sectionHeaders().find(h => h.textContent.includes('Produce'))
    await act(async () => { produce().click() })
    expect(produce().getAttribute('aria-expanded')).toBe('false')

    await act(async () => { chips()[1].click() })     // Tuesday
    expect(text()).toContain('31 left')               // the day really changed
    expect(produce().getAttribute('aria-expanded')).toBe('false')

    await act(async () => { chips()[0].click() })     // and back
    expect(produce().getAttribute('aria-expanded')).toBe('false')
  })

  it('reopens on a second tap', async () => {
    await mount()
    await selectMonday()
    const spice = () => sectionHeaders().find(h => h.textContent.includes('Spices & seasoning'))
    const before = rows().length
    await act(async () => { spice().click() })
    expect(rows().length).toBe(before + 6)
    expect(spice().getAttribute('aria-expanded')).toBe('true')
  })
})

/* ── CLEAR, THROUGH STORAGE ───────────────────────────────────────────
 *
 * It broke once already, and it broke because each half was tested
 * against a literal and neither against the other. */
describe('Clear and undo', () => {
  it('removes only the checked rows, and they stay gone', async () => {
    await mount()
    await selectMonday()
    const before = rows().length
    const dropped = [nameOf(rows()[0]), nameOf(rows()[1])]
    await act(async () => { rows()[0].click() })
    await act(async () => { rows()[1].click() })
    await act(async () => { clearBtn().click() })

    expect(rows()).toHaveLength(before - 2)
    /* By ROW NAME, not by substring: "garlic" is inside "minced garlic",
       and a substring check would pass on the wrong evidence. */
    const names = rows().map(nameOf)
    for (const n of dropped) expect(names).not.toContain(n)
    expect(text()).toContain('23 left')

    /* the write reached storage in the shape the reader wants */
    const stored = JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded')))
    expect(stored.version).toBe(EXCLUDED_VERSION)
    expect(stored.keys).toHaveLength(2)
    for (const k of stored.keys) expect(k).toMatch(/^0:\d+$/)

    /* Clear REMOVES; it does not merely untick. The original bug. */
    expect(box.store.groceryChecks.size).toBe(0)
  })

  it('leaves another day untouched', async () => {
    await mount()
    await selectMonday()
    await act(async () => { rows()[0].click() })
    await act(async () => { clearBtn().click() })
    expect(text()).toContain('24 left')

    await act(async () => { chips()[1].click() })
    expect(text()).toContain('31 left')               // Tuesday, whole
  })

  it('offers Undo, and Undo puts them back', async () => {
    await mount()
    await selectMonday()
    const name = nameOf(rows()[0])
    await act(async () => { rows()[0].click() })
    await act(async () => { clearBtn().click() })
    expect(text()).toContain('1 REMOVED')

    await act(async () => {
      [...host.querySelectorAll('button')].find(b => b.textContent === 'UNDO').click()
    })
    /* THE ROW COMES BACK STILL TICKED, and that is right: undo restores
       what Clear consumed, which was a checked row. So the list is 25
       again and the counter reads 24 — one of them is ticked. Asserting
       "25 left" here would have been asserting a half-undo. */
    expect(rows().map(nameOf)).toContain(name)
    expect(rows()).toHaveLength(19)
    expect(text()).toContain('24 left')
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded'))).keys).toEqual([])
    expect(box.store.groceryChecks.size).toBe(1)
  })

  it('clears the Undo affordance after 3500ms', async () => {
    vi.useFakeTimers()
    try {
      await mount()
      await selectMonday()
      await act(async () => { rows()[0].click() })
      await act(async () => { clearBtn().click() })
      expect(text()).toContain('REMOVED')

      await act(async () => { vi.advanceTimersByTime(3499) })
      expect(text()).toContain('REMOVED')
      await act(async () => { vi.advanceTimersByTime(2) })
      expect(text()).not.toContain('REMOVED')
    } finally { vi.useRealTimers() }
  })

  it('starts a new list, dropping both stores at once', async () => {
    await mount()
    await selectMonday()
    await act(async () => { rows()[0].click() })
    await act(async () => { clearBtn().click() })
    await act(async () => {
      [...host.querySelectorAll('button')].find(b => b.textContent === 'START A NEW LIST').click()
    })
    expect(text()).toContain('25 left')
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery'))).keys).toEqual([])
    expect(JSON.parse(localStorage.getItem(lsKey(null, 'grocery_excluded'))).keys).toEqual([])
  })
})

describe('the empty day', () => {
  it('shows the dashed block, not a header with empty sections', async () => {
    await mount()
    await act(async () => { chips()[3].click() })       // Thu, no meals
    expect(text()).toContain('Nothing to buy for Thu')
    expect(text()).toContain('NO MEALS ASSIGNED TO THIS DAY')
    expect(host.querySelector('[data-grocery-list]')).toBe(null)
    expect(host.querySelectorAll('section')).toHaveLength(0)
    expect(text()).toContain('Nothing to buy')
  })

  it('offers a way to the plan', async () => {
    await mount()
    await act(async () => { chips()[3].click() })
    await act(async () => {
      [...host.querySelectorAll('button')]
        .find(b => b.textContent === 'OPEN THE WEEK PLAN').click()
    })
    expect(box.onChange).toHaveBeenCalledWith('plan')
  })

  it('says something different when the day had meals and was cleared', async () => {
    await mount()
    await selectMonday()
    await act(async () => {
      box.store.checkAllGrocery(box.store.groceryRows.map(r => r.id))
    })
    await act(async () => { clearBtn().click() })
    expect(text()).toContain('EVERYTHING HERE IS CLEARED')
    expect(text()).not.toContain('NO MEALS ASSIGNED')
  })
})

describe('the expander', () => {
  it('names the item, each amount with its recipe, and what needs it', async () => {
    await mount()
    await selectMonday()
    const i = rows().findIndex(r => nameOf(r) === 'chicken breast')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(expanders()[i].textContent).toContain('2')      // two meals need it

    await act(async () => { expanders()[i].click() })
    const block = expanders()[i].closest('div').parentElement.lastElementChild
    expect(block.textContent).toContain('chicken breast')
    expect(block.textContent).toContain('600g (21oz) Raw Chicken Breast, cut into strips')
    expect(block.textContent).toContain('700g (25oz) Raw Chicken Breast, cubed')
    /* each amount beside the meal that asked for it */
    expect(block.textContent).toContain(recipeById[1].name)
    expect(block.textContent).toContain(recipeById[2].name)
    expect(block.textContent).toContain('For:')
  })

  it('rotates its chevron and closes on a second tap', async () => {
    await mount()
    await selectMonday()
    const chev = () => expanders()[0].querySelector('svg')
    expect(chev().style.transform).toBe('none')
    await act(async () => { expanders()[0].click() })
    expect(chev().style.transform).toBe('rotate(90deg)')
    await act(async () => { expanders()[0].click() })
    expect(chev().style.transform).toBe('none')
  })

  it('closes when the day changes, so it cannot describe another item', async () => {
    await mount()
    await selectMonday()
    await act(async () => { expanders()[0].click() })
    expect(expanders()[0].getAttribute('aria-expanded')).toBe('true')

    await act(async () => { chips()[1].click() })
    expect(expanders().every(e => e.getAttribute('aria-expanded') === 'false')).toBe(true)
  })
})

describe('offline', () => {
  it('fills the whole screen from the device, with no network event', async () => {
    localStorage.clear()
    localStorage.setItem(lsKey('u1', 'weekplan'), JSON.stringify(PLAN))
    localStorage.setItem('prepiq_last_uid', JSON.stringify('u1'))

    box = {}
    function Probe() { box.store = useAppStore(); return null }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(<AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })

    /* the auth callback is never fired: the radio is off */
    expect(box.store.user).toBeUndefined()
    expect(box.store.bootScope).toBe('u1')
    await act(async () => { chips()[0].click() })
    expect(text()).toContain('25 left')
    expect(rows().length).toBeGreaterThan(10)
  })
})
