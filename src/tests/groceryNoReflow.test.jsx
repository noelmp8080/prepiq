import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

/* NOTHING MOVES ON TAP — asserted, not commented.
 *
 * This is the single most important property of the grocery screen. It
 * is used one-handed, walking, in a shop: if checking a row reflows the
 * list, the next row you tap is a different item and you would not
 * notice. Every other decision on that screen was made to protect it.
 *
 * It was defended by a comment and by reading. This makes it a gate.
 *
 * WHAT JSDOM CAN AND CANNOT SEE — measured, not assumed:
 *
 *   getBoundingClientRect()    all zeros
 *   offsetHeight               0
 *   getComputedStyle().height  "56px"  (echoes the declared value)
 *   inline style attribute     readable
 *
 * So a GEOMETRY test is impossible here and a PROPERTY test is exactly
 * _guard.py's shape: snapshot every element's declared style, class list
 * and text, tap a row, snapshot again, and assert that every property
 * which changed is one that cannot cause layout.
 *
 * THE GAP, STATED: this asserts DECLARED style, not COMPUTED layout. A
 * reflow introduced through a stylesheet rule rather than an inline
 * style would slip through. That is why the class list is asserted too —
 * a class is how such a rule would be applied. index.css holds only
 * colour tokens and this component sets everything inline, so what
 * remains is small and named rather than unknown.
 */

/* Properties that cannot move anything. Anything outside this set —
   height, margin, padding, display, order, flex, font-size, position —
   is a layout change and fails. */
const PAINT_ONLY = new Set([
  'opacity', 'color', 'background', 'background-color', 'background-image',
  'text-decoration', 'text-decoration-line', 'text-decoration-color',
  'border-color', 'border-top-color', 'border-bottom-color',
  'border-left-color', 'border-right-color',
  'box-shadow', 'fill', 'stroke', 'stroke-width', 'outline-color',
  'cursor', 'visibility', 'transition', 'filter',
])

/* React needs this to flush act() synchronously; without it updates are
   applied late and the snapshot compares two different moments. */
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
const { default: Grocery } = await import('../components/Grocery')
const { lsKey } = await import('../store/storeLogic')

/* ── DETERMINISM: A FIXED DAY AND A FIXED RECIPE SET ──────────────────
 *
 * This harness used to render whatever the default plan produced for
 * whatever day it happened to be, and assert `> 10` rows. Under a
 * day-scoped derivation that is a test whose subject changes seven times
 * a week: Saturday's list is 14 items and Thursday's is 30, so `> 10`
 * would have kept passing through a bug that dropped half of them, and a
 * genuine off-by-one in the day index would have shown up as a failure
 * only on the days the counts differ enough to notice.
 *
 * So: a plan written here rather than inherited, a day pinned rather
 * than read off the clock, and EXACT counts.
 *
 * THE PLAN IS DELIBERATELY NOT THE DEFAULT ONE. The default seeds Monday
 * with recipes 1,2 and Tuesday with 3,4; this swaps them. That makes the
 * seeding observable — if localStorage were ignored and the store fell
 * back to its default, day 1 would derive 31 rows instead of 25 and the
 * counts below fail. One assertion covers two mechanisms.
 */
const FIXED_PLAN = [
  { day: 'Mon', ids: [3, 4] },
  { day: 'Tue', ids: [1, 2] },
  { day: 'Wed', ids: [5, 6] },
  { day: 'Thu', ids: [7, 8] },
  { day: 'Fri', ids: [9, 10] },
  { day: 'Sat', ids: [11, null] },
  { day: 'Sun', ids: [12, null] },
]
const PIN_DAY = 1                       // Tuesday -> recipes 1 and 2

/* Measured against the catalog, not copied from a run. Recipes 1 and 2
   contribute 25 distinct items; `Spices & seasoning` holds 6 of them and
   is collapsed by default, so 19 rows are in the DOM. The gap between
   the two numbers is the point — a regression that renders the collapsed
   section anyway shows up as 25. */
const DERIVED_ROWS = 25
const VISIBLE_ROWS = 19
const SPICE_ROWS = 6

/* On Monday's recipes and NOT on Tuesday's. If the screen ever derives
   the wrong day — or the whole week again — these appear. */
const MONDAY_ONLY = ['basmati rice', 'gochujang paste', 'red cabbage', 'sesame seeds']

/* PIN THE DAY RATHER THAN THE CLOCK. `groceryDay` resolves null -> today
   in the store; fake timers would work but would also freeze the
   midnight-rollover interval this component's provider installs. Setting
   the day outright is narrower.
   Children are withheld until the pin has landed, so no assertion can
   ever see the clock-dependent first render. If the pin fails the screen
   renders nothing and the exact counts below fail loudly. */
function PinDay({ index, children }) {
  const { setGroceryDay, groceryDay } = useAppStore()
  useEffect(() => { setGroceryDay(index) }, [index, setGroceryDay])
  return groceryDay === index ? children : null
}

/** Every element's identity as far as layout is concerned. */
function snapshot(host) {
  const out = []
  for (const el of host.querySelectorAll('*')) {
    /* SVG INTERNALS ARE PAINT, NOT LAYOUT — and this exclusion was
       forced by the harness rather than assumed.
       Its first run failed with "element count 612 -> 613": lucide's
       Square draws one <rect>, CheckSquare draws a rect plus a path, so
       swapping them changes the node count. Nothing moves — both sit
       inside a 20x20 <svg> with a fixed viewBox, and content inside a
       sized svg cannot affect the document.
       The <svg> ELEMENT ITSELF IS STILL CHECKED, below, because its
       width and height are exactly what could move a row. */
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
    const style = {}
    for (let i = 0; i < el.style.length; i++) {
      const k = el.style[i]
      style[k] = el.style.getPropertyValue(k)
    }
    out.push({
      tag: el.tagName,
      /* The <svg>'s own class is the icon's identity (lucide-square vs
         lucide-square-check-big) and no stylesheet in this app targets
         it. Its BOX is asserted separately. */
      cls: el.tagName.toLowerCase() === 'svg' ? '' : (el.getAttribute('class') || ''),
      text: el.children.length === 0 ? el.textContent : null,
      style,
    })
  }
  return out
}

/** -> list of human-readable differences that COULD move something. */
function layoutDiff(before, after) {
  const bad = []
  if (before.length !== after.length) {
    bad.push(`element count ${before.length} -> ${after.length} (a node was added or removed)`)
    return bad
  }
  before.forEach((b, i) => {
    const a = after[i]
    if (b.tag !== a.tag) bad.push(`#${i} tag ${b.tag} -> ${a.tag}`)
    if (b.cls !== a.cls) bad.push(`#${i} class "${b.cls}" -> "${a.cls}"`)
    if (b.text !== a.text) bad.push(`#${i} text "${b.text}" -> "${a.text}"`)
    const keys = new Set([...Object.keys(b.style), ...Object.keys(a.style)])
    for (const k of keys) {
      if (b.style[k] === a.style[k]) continue
      if (PAINT_ONLY.has(k)) continue
      bad.push(`#${i} <${b.tag}> ${k}: "${b.style[k] ?? '—'}" -> "${a.style[k] ?? '—'}"`)
    }
  })
  return bad
}

let host, root
beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <AppStoreProvider><PinDay index={PIN_DAY}><Grocery /></PinDay></AppStoreProvider>)
  })
  await act(async () => { await authCb(null) })          // signed out, localStorage path
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const listEl = () => host.querySelector('[data-grocery-list]')

const rowButtons = () =>
  [...host.querySelectorAll('button')].filter(b => b.style.height === '56px' && b.querySelector('span'))

describe('the screen renders real food, for exactly one day', () => {
  it('renders exactly the rows that day needs, and they are 56px', () => {
    const rows = rowButtons()
    expect(rows).toHaveLength(VISIBLE_ROWS)
    for (const r of rows) expect(r.style.height).toBe('56px')
  })

  /* The counter counts DERIVED rows, including the collapsed ones — you
     still have to buy the paprika. Asserting both numbers from one render
     is what distinguishes "the section is shut" from "the rows are gone". */
  it('counts all 25, shows 19, and holds 6 behind the collapsed spice rack', () => {
    expect(host.textContent).toContain(`${DERIVED_ROWS} left`)
    const spices = [...host.querySelectorAll('section')]
      .find(s => s.textContent.includes('Spices & seasoning'))
    expect(spices).toBeTruthy()
    expect(spices.textContent).toContain(String(SPICE_ROWS))
    expect(rowButtons()).toHaveLength(DERIVED_ROWS - SPICE_ROWS)
  })

  /* THE DAY SCOPE, ASSERTED FROM THE DOM. groceryList.test.js proves the
     derivation drops other days; this proves the screen is wired to it.
     Both are needed — the derivation was correct and the call site was
     still passing no day index at all until this session. */
  it('shows only that day — nothing from the neighbouring day leaks in', () => {
    const text = host.textContent.toLowerCase()
    for (const name of MONDAY_ONLY) expect(text).not.toContain(name)
    expect(text).toContain('low calorie tortilla wrap')      // Tuesday, recipe 1
    expect(text).toContain('uncooked macaroni pasta')        // Tuesday, recipe 2
  })

  it('names ingredients rather than recipes', () => {
    const text = host.textContent
    expect(text).not.toContain('Spicy Chicken Wraps')
    expect(text.toLowerCase()).toContain('chicken breast')
  })

  it('sets the name at 18px, the size the row was measured for', () => {
    const name = rowButtons()[0].querySelector('span')
    expect(name.style.fontSize).toBe('18px')
    expect(name.style.whiteSpace).toBe('nowrap')
    expect(name.style.textOverflow).toBe('ellipsis')
  })
})

describe('NOTHING MOVES ON TAP', () => {
  it('checking a row changes only paint properties, nowhere in the tree', () => {
    const rows = rowButtons()
    const before = snapshot(listEl())
    act(() => { rows[0].click() })
    const diff = layoutDiff(before, snapshot(listEl()))
    expect(diff, 'tapping a row moved something:\n' + diff.join('\n')).toEqual([])
  })

  it('unchecking it moves nothing either', () => {
    const rows = rowButtons()
    act(() => { rows[0].click() })
    const before = snapshot(listEl())
    act(() => { rows[0].click() })
    const diff = layoutDiff(before, snapshot(listEl()))
    expect(diff, diff.join('\n')).toEqual([])
  })

  it('holds for a row in the middle and the last row', () => {
    const rows = rowButtons()
    for (const idx of [Math.floor(rows.length / 2), rows.length - 1]) {
      const before = snapshot(listEl())
      act(() => { rowButtons()[idx].click() })
      const diff = layoutDiff(before, snapshot(listEl()))
      expect(diff, `row ${idx}:\n` + diff.join('\n')).toEqual([])
    }
  })

  it('holds when several rows are checked in sequence', () => {
    for (let i = 0; i < 5; i++) {
      const before = snapshot(listEl())
      act(() => { rowButtons()[i].click() })
      const diff = layoutDiff(before, snapshot(listEl()))
      expect(diff, `tap ${i}:\n` + diff.join('\n')).toEqual([])
    }
  })

  /* THE CHECK ITSELF MUST STILL HAPPEN. Without this, a component that
     ignored the tap entirely would pass every assertion above — the
     strongest way to move nothing is to do nothing. */
  it('the sticky header keeps its box even as its counter changes', () => {
    const hdr = host.querySelector('div[style*="sticky"]')
    const before = hdr.style.height
    act(() => { rowButtons()[0].click() })
    expect(hdr.style.height).toBe(before)
    expect(before).toBe('72px')
    /* the text SHOULD change — that is the header doing its job */
    expect(hdr.textContent).toContain('Clear 1')
  })

  /* The icons are excluded from the node count, so their BOX is asserted
     here instead — that is the part that could move a row. */
  it('the icon box is identical checked and unchecked', () => {
    const row = rowButtons()[0]
    const box = () => {
      const svg = row.querySelector('svg')
      return { w: svg.getAttribute('width'), h: svg.getAttribute('height') }
    }
    const before = box()
    act(() => { row.click() })
    expect(box()).toEqual(before)
    expect(before).toEqual({ w: '20', h: '20' })
  })

  it('and the tap still registers, so the test is not passing vacuously', () => {
    const row = rowButtons()[0]
    const before = row.style.opacity
    act(() => { row.click() })
    expect(row.style.opacity).not.toBe(before)
    expect(row.querySelector('span').style.textDecoration).toBe('line-through')
  })
})

/* THE HARNESS MUST BE ABLE TO FAIL. A layout diff that returns [] for
   everything is worthless, and it looks identical to a passing test. */
describe('the harness detects a real reflow', () => {
  it('catches a height change', () => {
    const a = [{ tag: 'DIV', cls: '', text: 'x', style: { height: '56px', opacity: '1' } }]
    const b = [{ tag: 'DIV', cls: '', text: 'x', style: { height: '76px', opacity: '1' } }]
    expect(layoutDiff(a, b)).toHaveLength(1)
    expect(layoutDiff(a, b)[0]).toContain('height')
  })

  it('catches an inserted node', () => {
    const a = [{ tag: 'DIV', cls: '', text: 'x', style: {} }]
    const b = [...a, { tag: 'SPAN', cls: '', text: 'y', style: {} }]
    expect(layoutDiff(a, b)[0]).toContain('element count')
  })

  it('catches a class change — the stylesheet route to a reflow', () => {
    const a = [{ tag: 'DIV', cls: 'row', text: 'x', style: {} }]
    const b = [{ tag: 'DIV', cls: 'row done', text: 'x', style: {} }]
    expect(layoutDiff(a, b)[0]).toContain('class')
  })

  it('catches reordered text, which is a reorder', () => {
    const a = [{ tag: 'DIV', cls: '', text: 'salt', style: {} }]
    const b = [{ tag: 'DIV', cls: '', text: 'paprika', style: {} }]
    expect(layoutDiff(a, b)[0]).toContain('text')
  })

  it('permits the paint properties the screen actually uses', () => {
    const a = [{ tag: 'DIV', cls: '', text: 'x', style: { opacity: '1', 'text-decoration': 'none' } }]
    const b = [{ tag: 'DIV', cls: '', text: 'x', style: { opacity: '0.5', 'text-decoration': 'line-through' } }]
    expect(layoutDiff(a, b)).toEqual([])
  })
})
