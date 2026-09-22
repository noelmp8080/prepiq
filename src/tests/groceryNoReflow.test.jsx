import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'

/* NOTHING MOVES ON TAP — asserted, not commented.
 *
 * This is the single most important property of the grocery screen. It
 * is used one-handed, walking, in a shop: if checking a row reflows the
 * list, the next row you tap is a different item and you would not
 * notice. Every other decision on that screen was made to protect it.
 *
 * WHAT JSDOM CAN AND CANNOT SEE — measured, not assumed:
 *
 *   getBoundingClientRect()    all zeros
 *   offsetHeight               0
 *   getComputedStyle().height  echoes the declared value
 *   inline style attribute     readable
 *
 * So a GEOMETRY test is impossible here and a PROPERTY test is the shape
 * that works: snapshot every element's declared style, class list and
 * text, tap a row, snapshot again, and assert that every property which
 * changed is one that cannot cause layout.
 *
 * THE GAP, STATED: this asserts DECLARED style, not COMPUTED layout. A
 * reflow introduced through a stylesheet rule rather than an inline
 * style would slip through. That is why the class list is asserted too —
 * a class is how such a rule would be applied. index.css holds only
 * colour tokens and this component sets everything inline, so what
 * remains is small and named rather than unknown.
 *
 * THE REDESIGN MADE THIS HARNESS STRICTER, NOT LOOSER.
 * The previous version had to exempt SVG internals: the checkbox was a
 * lucide icon swap, and Square (one <rect>) becoming CheckSquare (a rect
 * plus a path) changed the node count on every tap. The redesigned
 * checkbox is a 22px box that always contains the same check mark, at
 * `opacity: 0` when unchecked — so nothing is added or removed and the
 * exemption is GONE. Every node in the list is snapshotted now,
 * including the ones inside the icons.
 */

/* Properties that cannot move anything. Anything outside this set —
   height, margin, padding, display, order, flex, font-size, position,
   width, border-width — is a layout change and fails. */
const PAINT_ONLY = new Set([
  'opacity', 'color', 'background', 'background-color', 'background-image',
  'text-decoration', 'text-decoration-line', 'text-decoration-color',
  'border-color', 'border-top-color', 'border-bottom-color',
  'border-left-color', 'border-right-color',
  'box-shadow', 'fill', 'stroke', 'stroke-width', 'outline-color',
  'cursor', 'visibility', 'transition', 'filter',
  /* The `background` shorthand expands to longhands, and a flat rgba()
     expands to a different SET of them than a gradient does — so these
     appear and disappear on a tap. Every one is paint: none can change a
     box. Found by running this harness, not reasoned about in advance. */
  'background-attachment', 'background-clip', 'background-origin',
  'background-position', 'background-position-x', 'background-position-y',
  'background-repeat', 'background-size',
])

/* THE `border` SHORTHAND CARRIES ITS COLOUR, and the checkbox changes
   that colour on every tap while keeping the width. Comparing the whole
   string would flag a paint change as a layout change; dropping `border`
   into PAINT_ONLY would stop the harness noticing a WIDTH change, which
   is exactly the shift this screen cannot have. So the shorthand is
   compared on its first two tokens — width and style — and the colour is
   left to `border-color`, which is already paint. */
const BORDER_SHORTHAND = /^border(-(top|right|bottom|left))?$/
const normalise = (key, value) =>
  BORDER_SHORTHAND.test(key) ? String(value).split(/\s+/).slice(0, 2).join(' ') : value

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
const { lsKey } = await import('../store/storeLogic')
const { groupsForDay } = await import('../lib/groceryByDay')
const { default: catalog } = await import('../data/groceryCatalog.json')

const TOKENS = readFileSync('src/tokens.css', 'utf8')

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

/* PIN THE DAY RATHER THAN THE CLOCK. Fake timers would work but would
   also freeze the midnight-rollover interval the provider installs.
   Children are withheld until the pin lands, so no assertion can see the
   clock-dependent first render; if the pin fails the screen renders
   nothing and the exact counts below fail loudly. */
function PinDay({ index, children }) {
  const { setGroceryDay, groceryDay } = useAppStore()
  useEffect(() => { setGroceryDay(index) }, [index, setGroceryDay])
  return groceryDay === index ? children : null
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
  await act(async () => { await authCb(null) })
  /* Block F made the DAY view the default. Everything below was written
     against the consolidated store-walk list, which now sits behind the
     WEEK pill — so select it the way a user would, rather than reaching
     past the UI with a prop. The day view has its own block at the foot
     of this file, and the click keeps the pill itself covered. */
  await act(async () => { aislesPill().click() })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const aislesPill = () => host.querySelector('[data-aisles-pill]')
const dayPills = () => [...host.querySelectorAll('[data-day-pill]')]
  .filter(b => !b.hasAttribute('data-aisles-pill'))

const listEl = () => host.querySelector('[data-grocery-list]')
const headerEl = () => host.querySelector('[data-grocery-header]')

/* Semantic, not stylistic: the row's left button is the only thing in
   the list carrying aria-pressed. The old selector matched on
   `height === '56px'`, which broke the moment the height became a token
   — and a selector that silently matches nothing is a suite that passes. */
const rowButtons = () => [...listEl().querySelectorAll('button[aria-pressed]')]
const expanders = () => [...listEl().querySelectorAll('button[aria-expanded]')]
  .filter(b => (b.getAttribute('aria-label') || '').includes('need'))

/** Every element's identity as far as layout is concerned. */
function snapshot(el) {
  const out = []
  for (const node of el.querySelectorAll('*')) {
    const style = {}
    for (let i = 0; i < node.style.length; i++) {
      const k = node.style[i]
      style[k] = node.style.getPropertyValue(k)
    }
    out.push({
      tag: node.tagName,
      cls: node.getAttribute('class') || '',
      text: node.children.length === 0 ? node.textContent : null,
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
      if (normalise(k, b.style[k]) === normalise(k, a.style[k])) continue
      if (PAINT_ONLY.has(k)) continue
      bad.push(`#${i} <${b.tag}> ${k}: "${b.style[k] ?? '—'}" -> "${a.style[k] ?? '—'}"`)
    }
  })
  return bad
}

describe('the screen renders real food, for exactly one day', () => {
  it('renders exactly the rows that day needs', () => {
    expect(rowButtons()).toHaveLength(VISIBLE_ROWS)
  })

  it('counts all 25, shows 19, and holds 6 behind the collapsed spice rack', () => {
    expect(host.textContent).toContain(`${DERIVED_ROWS} left`)
    const spices = [...host.querySelectorAll('section')]
      .find(s => s.textContent.includes('Spices & seasoning'))
    expect(spices).toBeTruthy()
    expect(spices.textContent).toContain(String(SPICE_ROWS))
    expect(rowButtons()).toHaveLength(DERIVED_ROWS - SPICE_ROWS)
  })

  it('shows only that day — nothing from the neighbouring day leaks in', () => {
    const text = host.textContent.toLowerCase()
    for (const name of MONDAY_ONLY) expect(text).not.toContain(name)
    expect(text).toContain('low calorie tortilla wrap')      // Tuesday, recipe 1
    expect(text).toContain('uncooked macaroni pasta')        // Tuesday, recipe 2
  })

  it('names ingredients rather than recipes', () => {
    expect(host.textContent).not.toContain('Spicy Chicken Wraps')
    expect(host.textContent.toLowerCase()).toContain('chicken breast')
  })

  /* 18px MINIMUM, read at arm's length. Asserted through the token AND
     against the token's own definition, so neither half can drift: a row
     that stopped using the token, and a token quietly retuned to 16px,
     both fail here. */
  it('sets the name at 18px, the size the row was measured for', () => {
    const name = rowButtons()[0].querySelector('[data-row-name]')
    expect(name.style.fontSize).toBe('var(--pq-size-grocery)')
    expect(name.style.fontWeight).toBe('500')
    expect(name.style.whiteSpace).toBe('nowrap')
    expect(name.style.textOverflow).toBe('ellipsis')
    expect(TOKENS).toMatch(/--pq-size-grocery:\s*18px/)
  })

  it('is a 56px row of TWO buttons, with a 44px expander', () => {
    const row = rowButtons()[0]
    expect(row.style.height).toBe('var(--pq-row-grocery)')
    expect(row.style.flex).toMatch(/^1( 1 0%)?$/)
    expect(TOKENS).toMatch(/--pq-row-grocery:\s*56px/)

    const exp = row.parentElement.querySelector('button[aria-expanded]')
    expect(exp).toBeTruthy()
    expect(exp).not.toBe(row)                       // TWO buttons, not one
    expect(exp.style.width).toBe('var(--pq-expander-w)')
    expect(exp.style.height).toBe('var(--pq-row-grocery)')
    expect(TOKENS).toMatch(/--pq-expander-w:\s*44px/)
  })

  it('draws the unchecked checkbox as a 22px well, 14px from the name', () => {
    const box = rowButtons()[0].querySelector('span')
    expect(box.style.width).toBe('var(--pq-check)')
    expect(box.style.borderRadius).toBe('var(--pq-r-check)')
    expect(box.style.border).toContain('1.5px')
    expect(box.style.background).toBe('rgba(0, 0, 0, 0.28)')
    expect(box.style.boxShadow).toBe('inset 0 2px 4px rgba(0,0,0,0.45)')
    expect(rowButtons()[0].style.gap).toBe('14px')
    expect(TOKENS).toMatch(/--pq-check:\s*22px/)
    expect(TOKENS).toMatch(/--pq-r-check:\s*6px/)
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

  /* THE HEADER SITS ABOVE THE LIST, so anything that changes ITS box
     moves every row under it. Its counter and its Clear label are meant
     to change; its geometry is not. The progress fill's width is the one
     exception and it is NAMED rather than waved through — it sits inside
     a 4px track with overflow:hidden, which cannot alter the header's
     height. */
  it('the sticky header keeps its box even as its counter changes', () => {
    const before = snapshot(headerEl())
    act(() => { rowButtons()[0].click() })
    const all = layoutDiff(before, snapshot(headerEl()))

    /* Exactly three things may differ, each named: the progress fill's
       width, the counter, and the Clear label. Anything else in this
       header moves every row underneath it. Asserting the three are
       PRESENT as well as that nothing else is — otherwise a header that
       stopped updating would pass. */
    const allowed = [
      /^#\d+ <DIV> width: "\d+%" -> "\d+%"$/,
      /^#\d+ text "25 left" -> "24 left"$/,
      /^#\d+ text "CLEAR" -> "CLEAR 1"$/,
    ]
    const unexpected = all.filter(d => !allowed.some(re => re.test(d)))
    expect(unexpected, unexpected.join('\n')).toEqual([])
    for (const re of allowed) {
      expect(all.some(d => re.test(d)), `nothing matched ${re}`).toBe(true)
    }

    const fill = headerEl().querySelector('[data-progress-fill]')
    expect(fill.parentElement.style.height).toBe('4px')
    expect(fill.parentElement.style.overflow).toBe('hidden')

    /* the text SHOULD change — that is the header doing its job */
    expect(headerEl().textContent).toContain('CLEAR 1')
    expect(headerEl().textContent).toContain('24 left')
  })

  it('the checkbox box is identical checked and unchecked', () => {
    const row = rowButtons()[0]
    const box = () => {
      const b = row.querySelector('span')
      return { w: b.style.width, h: b.style.height, r: b.style.borderRadius,
               bw: b.style.border.split(' ')[0] }
    }
    const before = box()
    act(() => { row.click() })
    expect(box()).toEqual(before)
    expect(before).toEqual({
      w: 'var(--pq-check)', h: 'var(--pq-check)',
      r: 'var(--pq-r-check)', bw: '1.5px',
    })
  })

  /* THE CHECK ITSELF MUST STILL HAPPEN. Without this, a component that
     ignored the tap entirely would pass every assertion above — the
     strongest way to move nothing is to do nothing. */
  it('and the tap still registers, so the test is not passing vacuously', () => {
    const row = rowButtons()[0]
    const before = row.style.opacity
    act(() => { row.click() })

    expect(before).toBe('1')
    expect(row.style.opacity).toBe('0.45')
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(row.querySelector('[data-row-name]').style.textDecoration).toBe('line-through')

    /* the accent fill and the 14px check, per the contract */
    const box = row.querySelector('span')
    expect(box.style.background).toBe('var(--pq-accent-grad)')
    const check = box.querySelector('svg')
    expect(check.style.opacity).toBe('1')
    expect(check.getAttribute('width')).toBe('14')
    expect(check.getAttribute('stroke')).toBe('#0E1012')
    expect(check.getAttribute('stroke-width')).toBe('3')
  })

  /* Opening an expander DOES insert a block — that is its job, and it is
     a tap you chose. What must not happen is the ROW ITSELF moving. */
  it('opening an expander leaves the row it belongs to untouched', () => {
    const target = 4
    const rowBox = () => rowButtons()[target].parentElement
    const before = snapshot(rowBox())
    act(() => { expanders()[target].click() })

    const diff = layoutDiff(before, snapshot(rowBox())).filter(d => !/transform/.test(d))
    expect(diff, diff.join('\n')).toEqual([])
    expect(rowButtons()).toHaveLength(VISIBLE_ROWS)
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

  /* The border-WIDTH is what a "just drop the border when checked"
     change would alter, and it is exactly the shift this screen cannot
     have. Not in PAINT_ONLY, so it fails. */
  it('catches a border-width change, which is how the checkbox would shift', () => {
    const a = [{ tag: 'SPAN', cls: '', text: '', style: { 'border-width': '1.5px' } }]
    const b = [{ tag: 'SPAN', cls: '', text: '', style: { 'border-width': '0px' } }]
    expect(layoutDiff(a, b)[0]).toContain('border-width')
  })

  it('permits the paint properties the screen actually uses', () => {
    const a = [{ tag: 'DIV', cls: '', text: 'x', style: { opacity: '1', 'text-decoration': 'none', 'border-color': 'red' } }]
    const b = [{ tag: 'DIV', cls: '', text: 'x', style: { opacity: '0.45', 'text-decoration': 'line-through', 'border-color': 'transparent' } }]
    expect(layoutDiff(a, b)).toEqual([])
  })
})

/* ── THE SAME CONTRACT, AT WIDE WIDTHS ────────────────────────────────
 *
 * The block E brief makes this the gate: the two-pane grocery layout
 * must not break the row contract. It is a real risk rather than a
 * formality — the prototype lays wide sections out with CSS `columns`,
 * which flows content BETWEEN columns, so a height change in one can
 * move rows in the other. Two independent column divs are used instead
 * precisely so this test can be written at all; with `columns` there is
 * nothing jsdom can measure.
 *
 * Desktop is the harder case and the one tested: it splits the sections
 * across two columns AND adds the side pane, so there are three regions
 * that could move each other.
 */
describe('NOTHING MOVES ON TAP — at desktop width', () => {
  let wHost, wRoot

  beforeEach(async () => {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    wHost = document.createElement('div')
    document.body.appendChild(wHost)
    wRoot = createRoot(wHost)
    await act(async () => {
      wRoot.render(
        <AppStoreProvider>
          <PinDay index={PIN_DAY}><Grocery surface="desktop" /></PinDay>
        </AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    /* This block mounts its own root, so it needs its own AISLES
       selection — the outer beforeEach clicked a pill in a different
       tree. Same reason as up top: these assertions describe the
       consolidated list. */
    await act(async () => { wHost.querySelector('[data-aisles-pill]').click() })
  })
  afterEach(() => { act(() => wRoot.unmount()); wHost.remove() })

  const wList = () => wHost.querySelector('[data-grocery-list]')
  /* The side pane's day buttons also carry aria-pressed and live inside
     the same region, so they are excluded by ancestry rather than by
     counting — a selector that silently caught them would have made the
     row count 26 and every later assertion meaningless. */
  const wRows = () => [...wList().querySelectorAll('button[aria-pressed]')]
    .filter(b => !b.closest('[data-grocery-side]'))

  it('lays the same rows out in three regions', () => {
    expect(wRows()).toHaveLength(VISIBLE_ROWS)
    expect(wList().style.display).toBe('grid')
    expect(wList().style.gridTemplateColumns).toBe('minmax(0,1fr) 320px')
    expect(wHost.querySelector('[data-grocery-side]')).toBeTruthy()

    /* two INDEPENDENT columns, not one flowed pair */
    const inner = wList().firstElementChild
    expect(inner.style.gridTemplateColumns).toBe('repeat(2,minmax(0,1fr))')
    expect(inner.style.columns).toBe('')
    expect(inner.children).toHaveLength(2)
    /* and every row belongs to exactly one of them */
    const [a, b] = [...inner.children]
    for (const r of wRows()) expect(a.contains(r) !== b.contains(r)).toBe(true)
  })

  it('checking a row moves nothing, in either column or the side pane', () => {
    const before = snapshot(wList())
    act(() => { wRows()[0].click() })
    const all = layoutDiff(before, snapshot(wList()))
    /* The side pane's progress readout is meant to move — it is this
       surface's version of the phone header's counter. Named, like the
       phone one, rather than waved past with a loose pattern. */
    const allowed = [
      /^#\d+ <DIV> width: "\d+%" -> "\d+%"$/,
      /^#\d+ text "0 OF 25 · 0%" -> "1 OF 25 · 4%"$/,
    ]
    const diff = all.filter(d => !allowed.some(re => re.test(d)))
    expect(diff, 'tapping a row moved something at desktop width:\n' + diff.join('\n')).toEqual([])
    for (const re of allowed) {
      expect(all.some(d => re.test(d)), `nothing matched ${re}`).toBe(true)
    }
  })

  /* THE CROSS-COLUMN CASE, which is the whole reason for the deviation.
     A row in the first column is tapped; nothing in the SECOND column
     may move. Under CSS `columns` this is the assertion that could not
     be written. */
  it('a tap in the first column cannot move the second', () => {
    const inner = wList().firstElementChild
    const [colA, colB] = [...inner.children]
    const inA = wRows().filter(r => colA.contains(r))
    expect(inA.length).toBeGreaterThan(0)
    expect(wRows().filter(r => colB.contains(r)).length).toBeGreaterThan(0)

    const before = snapshot(colB)
    act(() => { inA[0].click() })
    const diff = layoutDiff(before, snapshot(colB))
    expect(diff, 'the other column moved:\n' + diff.join('\n')).toEqual([])
  })

  it('and the tap still registers at this width', () => {
    const row = wRows()[0]
    act(() => { row.click() })
    expect(row.style.opacity).toBe('0.45')
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(row.querySelector('[data-row-name]').style.textDecoration).toBe('line-through')
  })

  it('keeps the 56px row and the 44px expander at wide widths', () => {
    const row = wRows()[0]
    expect(row.style.height).toBe('var(--pq-row-grocery)')
    const exp = row.parentElement.querySelector('button[aria-expanded]')
    expect(exp.style.width).toBe('var(--pq-expander-w)')
    expect(exp.style.height).toBe('var(--pq-row-grocery)')
    /* and the name is still 18px — the one value the brief says never
       to reduce, on any surface */
    expect(row.querySelector('[data-row-name]').style.fontSize).toBe('var(--pq-size-grocery)')
  })

  it('gives every control on the wide screen at least 44px', () => {
    for (const b of wHost.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|var\(--pq-row-grocery\)|^4[4-9]px|^[5-9]\d+px/)
    }
  })
})

/* ── THE DAY VIEW HOLDS THE SAME LINE ─────────────────────────────────
 *
 * Block F put a second reading of the same day on this screen: recipe
 * groups instead of a store-walk. Its rows ARE the consolidated list's
 * rows — one `GroceryRow`, used twice — so this block is not a second
 * implementation being kept in step by hand. It is here because "the
 * component is shared" is a claim about the source, and the property
 * that matters is about the DOM: after a tap, nothing moved.
 *
 * It also covers what the day view adds and the list does not: three
 * columns of rows on desktop, a group header carrying a photo, and the
 * pill row itself, which now changes what the body renders.
 *
 * Its own root, because the outer beforeEach selects AISLES. The day view
 * is the default, so this mounts and asserts without touching a pill.
 */
describe('NOTHING MOVES ON TAP — the day view', () => {
  let dHost, dRoot

  async function mountDay(surface) {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    dHost = document.createElement('div')
    document.body.appendChild(dHost)
    dRoot = createRoot(dHost)
    await act(async () => {
      dRoot.render(
        <AppStoreProvider>
          <PinDay index={PIN_DAY}><Grocery surface={surface} /></PinDay>
        </AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
  }
  afterEach(() => { if (dRoot) act(() => dRoot.unmount()); dHost?.remove(); dRoot = null })

  const dList = () => dHost.querySelector('[data-grocery-list]')
  const dRows = () => [...dList().querySelectorAll('button[aria-pressed]')]

  it('renders the day as groups, not as sections', async () => {
    await mountDay('phone')
    /* Two recipes planned on the pinned day -> two group headings. */
    expect([...dList().querySelectorAll('h3')]).toHaveLength(2)
    expect(dList().textContent).toContain('MEAL 1')
    expect(dList().textContent).toContain('MEAL 2')
  })

  /* The consolidated list shows 25 distinct items for this day; the day
     view shows more, because two recipes that share an ingredient each
     keep their own row. Both numbers are correct and they are not the
     same number — which is why the parity test in groceryByDay.test.js
     compares SETS rather than counts. */
  it('keeps a shared ingredient in both groups rather than merging', async () => {
    await mountDay('phone')
    expect(dRows().length).toBeGreaterThan(DERIVED_ROWS)
  })

  it('checking a row changes only paint', async () => {
    await mountDay('phone')
    const before = snapshot(dList())
    await act(async () => { dRows()[0].click() })
    expect(dRows()[0].getAttribute('aria-pressed')).toBe('true')
    expect(layoutDiff(before, snapshot(dList()))).toEqual([])
  })

  it('unchecking it puts every property back', async () => {
    await mountDay('phone')
    const before = snapshot(dList())
    await act(async () => { dRows()[0].click() })
    await act(async () => { dRows()[0].click() })
    expect(dRows()[0].getAttribute('aria-pressed')).toBe('false')
    expect(snapshot(dList())).toEqual(before)
  })

  /* One ingredient can sit in two groups on one day, and there is ONE
     check behind both of them: the day's `dayIndex:itemId`. Ticking it
     under one recipe ticks it under the other, because it is one shop
     and buying a thing once buys it (DEVIATIONS §21).

     This is the assertion that proves the screen SHARES the store's key
     rather than carrying a second set of its own that happens to agree. */
  it('checks BOTH copies of a shared ingredient at once', async () => {
    await mountDay('phone')
    const nameOf = r => r.querySelector('[data-row-name]').textContent
    const names = dRows().map(nameOf)
    const dupe = names.find((n, i) => names.indexOf(n) !== i)
    expect(dupe).toBeTruthy()

    const pair = dRows().filter(r => nameOf(r) === dupe)
    expect(pair).toHaveLength(2)
    expect(pair.every(r => r.getAttribute('aria-pressed') === 'false')).toBe(true)

    await act(async () => { pair[0].click() })
    const after = dRows().filter(r => nameOf(r) === dupe)
    expect(after.every(r => r.getAttribute('aria-pressed') === 'true')).toBe(true)

    /* And off again, together. */
    await act(async () => { after[1].click() })
    expect(dRows().filter(r => nameOf(r) === dupe)
      .every(r => r.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('opening an expander leaves the row it belongs to untouched', async () => {
    await mountDay('phone')
    const before = snapshot(dRows()[0])
    const exp = [...dList().querySelectorAll('button[aria-expanded]')][0]
    await act(async () => { exp.click() })
    expect(layoutDiff(before, snapshot(dRows()[0]))).toEqual([])
  })

  it('lays rows in three columns at desktop width', async () => {
    await mountDay('desktop')
    const grids = [...dList().querySelectorAll('div')]
      .filter(d => String(d.style.gridTemplateColumns).startsWith('repeat(3'))
    expect(grids.length).toBeGreaterThan(0)
  })

  /* A grid with a fixed column count places each row in a cell of fixed
     height, so a tap in one column is structurally incapable of moving
     another. CSS `columns` would not be — see DEVIATIONS §10. */
  it('a tap in one column cannot move another, at desktop width', async () => {
    await mountDay('desktop')
    const before = snapshot(dList())
    await act(async () => { dRows()[0].click() })
    expect(layoutDiff(before, snapshot(dList()))).toEqual([])
  })

  it('shows a photo or its fallback tile for every group', async () => {
    await mountDay('phone')
    const media = [...dList().querySelectorAll('img, div')]
      .filter(n => n.style.width === '88px' || n.tagName === 'IMG')
    expect(media.length).toBeGreaterThanOrEqual(2)
  })
})

/* ── THE PILLS ────────────────────────────────────────────────────────
 * Eight controls that swap the body between two readings, inside the
 * sticky header — which must not resize as the count beside it changes. */
describe('the day pills', () => {
  it('shows seven days plus AISLES', () => {
    expect([...host.querySelectorAll('[data-day-pill]')]).toHaveLength(8)
    expect(aislesPill()).toBeTruthy()
  })

  it('marks the selected day whatever the mode is showing', () => {
    /* The outer beforeEach is in AISLES, and the day still has to be
       visible: the consolidated list under WEEK is day-scoped. */
    expect(aislesPill().getAttribute('aria-pressed')).toBe('true')
    const days = dayPills()
    expect(days.filter(p => p.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(days[PIN_DAY].getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles back to the day view on a second tap', async () => {
    expect(host.textContent).not.toContain('MEAL 1')
    await act(async () => { aislesPill().click() })
    expect(host.textContent).toContain('MEAL 1')
  })

  it('switching mode does not resize the sticky header', async () => {
    const before = snapshot(headerEl())
    await act(async () => { aislesPill().click() })
    const diff = layoutDiff(before, snapshot(headerEl()))
      /* The progress fill's width and the count text DO change — that is
         the readout doing its job, in a track that clips. */
      .filter(d => !d.includes('width') && !d.includes('text'))
    expect(diff).toEqual([])
  })
})

/* ── ONE DAY, ONE SET OF CHECKS ───────────────────────────────────────
 *
 * Block F phase 3. The two readings share the store: the same
 * `dayIndex:itemId` Set, the same exclusions, the same CHECKS_VERSION.
 * Nothing new is persisted, so nothing was version-bumped.
 *
 * These are the assertions that hold that claim up. Each one crosses the
 * pill — checks on one side, reads on the other — because a screen that
 * kept its own copy would pass every single-view test in this file.
 */
describe('the two readings share one set of checks', () => {
  let cHost, cRoot, cBox

  async function mountBoth() {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    cHost = document.createElement('div')
    document.body.appendChild(cHost)
    cRoot = createRoot(cHost)
    cBox = {}
    function Probe() { cBox.store = useAppStore(); return null }
    await act(async () => {
      cRoot.render(
        <AppStoreProvider>
          <Probe />
          <Grocery />
        </AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    /* NOT PinDay here: this block switches days on purpose, and PinDay
       renders null the moment the day leaves its pin, which would take
       the whole screen with it. The day is set through the store and
       then asserted, so it is pinned just as firmly. */
    await act(async () => { cBox.store.setGroceryDay(PIN_DAY) })
    expect(cBox.store.groceryDay).toBe(PIN_DAY)
  }
  afterEach(() => { if (cRoot) act(() => cRoot.unmount()); cHost?.remove(); cRoot = null })

  const pill = () => cHost.querySelector('[data-aisles-pill]')
  const days = () => [...cHost.querySelectorAll('[data-day-pill]')]
    .filter(b => !b.hasAttribute('data-aisles-pill'))
  const rowsIn = () => [...cHost.querySelector('[data-grocery-list]')
    .querySelectorAll('button[aria-pressed]')]
  const nameOf = r => r.querySelector('[data-row-name]').textContent
  const toAisles = async () => { await act(async () => { pill().click() }) }
  const rowNamed = n => rowsIn().find(r => nameOf(r) === n)

  it('carries a check from the day view into the aisle view', async () => {
    await mountBoth()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })

    await toAisles()
    const twin = rowNamed(name)
    expect(twin, `"${name}" should be on both readings`).toBeTruthy()
    expect(twin.getAttribute('aria-pressed')).toBe('true')
  })

  it('carries a check from the aisle view into the day view', async () => {
    await mountBoth()
    await toAisles()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })

    await toAisles()                                   // back to the day view
    const twin = rowNamed(name)
    expect(twin).toBeTruthy()
    expect(twin.getAttribute('aria-pressed')).toBe('true')
  })

  it('unchecks across the pill too, not only checks', async () => {
    await mountBoth()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })
    await toAisles()
    await act(async () => { rowNamed(name).click() })   // off, in the aisle view
    await toAisles()
    expect(rowNamed(name).getAttribute('aria-pressed')).toBe('false')
  })

  /* N LEFT is the day's item set either way, so the two readings cannot
     disagree about how much is left to buy — even though the day view
     renders MORE rows than the aisle view has items. */
  it('counts the same N LEFT on both readings', async () => {
    await mountBoth()
    const dayText = cHost.querySelector('[data-grocery-header]').textContent
    await toAisles()
    expect(cHost.querySelector('[data-grocery-header]').textContent).toBe(dayText)
    expect(dayText).toContain(`${DERIVED_ROWS} left`)
  })

  it('moves N LEFT by one per item, not per row', async () => {
    await mountBoth()
    /* Tick a shared ingredient — two rows light up, one item leaves the
       count. A per-row count would drop by two and read 23. */
    const names = rowsIn().map(nameOf)
    const dupe = names.find((n, i) => names.indexOf(n) !== i)
    await act(async () => { rowNamed(dupe).click() })
    expect(cHost.querySelector('[data-grocery-header]').textContent)
      .toContain(`${DERIVED_ROWS - 1} left`)
  })

  it('clears from the day view and the aisle view is cleared too', async () => {
    await mountBoth()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })

    const clear = [...cHost.querySelector('[data-grocery-header]').querySelectorAll('button')]
      .find(b => b.textContent.startsWith('CLEAR'))
    expect(clear.disabled).toBe(false)
    await act(async () => { clear.click() })

    /* CLEAR is the existing day-keyed exclusion: the item leaves BOTH
       readings, it is not merely unchecked. */
    expect(rowsIn().map(nameOf)).not.toContain(name)
    await toAisles()
    expect(rowsIn().map(nameOf)).not.toContain(name)
  })

  it('clears from the aisle view and the day view is cleared too', async () => {
    await mountBoth()
    await toAisles()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })
    const clear = [...cHost.querySelector('[data-grocery-header]').querySelectorAll('button')]
      .find(b => b.textContent.startsWith('CLEAR'))
    await act(async () => { clear.click() })

    await toAisles()                                   // back to the day view
    expect(rowsIn().map(nameOf)).not.toContain(name)
  })

  it('leaves another day untouched', async () => {
    await mountBoth()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })
    expect(rowNamed(name).getAttribute('aria-pressed')).toBe('true')

    /* PIN_DAY is Tuesday; Monday is a different recipe set and a
       different key prefix. */
    await act(async () => { days()[0].click() })
    const onMonday = rowNamed(name)
    if (onMonday) expect(onMonday.getAttribute('aria-pressed')).toBe('false')

    await act(async () => { days()[PIN_DAY].click() })
    expect(rowNamed(name).getAttribute('aria-pressed')).toBe('true')
  })

  /* Reordering a day's meals moves `position`, and `instanceId` with
     it. Nothing may follow it. Asserted on the KEY rather than by
     rebuilding the plan: the key is the reason reordering is safe, and
     a remount would also have to preserve storage to prove anything. */
  it('keys a check on the item, with no instance in it', async () => {
    await mountBoth()
    const name = nameOf(rowsIn()[0])
    await act(async () => { rowsIn()[0].click() })

    const keys = [...cBox.store.groceryChecks]
    expect(keys).toHaveLength(1)
    /* `dayIndex:itemId` — two fields, both numeric. An instance id
       would put a '#' in it. */
    expect(keys[0]).toMatch(/^\d+:\d+$/)
    expect(keys[0]).not.toContain('#')
    expect(keys[0].startsWith(`${PIN_DAY}:`)).toBe(true)
    expect(name).toBeTruthy()
  })
})

/* ── THE AMOUNT ON THE ROW HOLDS THE SAME LINE ────────────────────────
 *
 * The row carries a parsed quantity now — "1.1 lb" beside the name —
 * which is a node the no-reflow rule has never had to survive. It is
 * present in both states and changes only its text-decoration on a tap,
 * so a check still adds nothing and moves nothing; these say so rather
 * than assuming it.
 */
describe('NOTHING MOVES ON TAP — with an amount on the row', () => {
  const amounts = () => [...listEl().querySelectorAll('[data-row-amount]')]
  const rowWithAmount = () => rowButtons().find(r => r.querySelector('[data-row-amount]'))

  it('puts an amount on some rows and not others', () => {
    /* Both cases have to exist or the assertions below are vacuous:
       92.5% of quantity lines parse, and only three of the catalog's
       ten sections carry quantities at all. */
    expect(amounts().length).toBeGreaterThan(0)
    expect(amounts().length).toBeLessThan(rowButtons().length)
  })

  it('shows no placeholder where there is no amount', () => {
    const bare = rowButtons().filter(r => !r.querySelector('[data-row-amount]'))
    expect(bare.length).toBeGreaterThan(0)
    for (const r of bare) {
      /* No dash, no zero, no empty mono span holding the space open. */
      expect(r.textContent.trim()).not.toMatch(/[—-]$/)
    }
  })

  it('checking a row that HAS an amount changes only paint', () => {
    const row = rowWithAmount()
    expect(row, 'no row carried an amount').toBeTruthy()
    const before = snapshot(listEl())
    act(() => { row.click() })
    expect(rowWithAmount().getAttribute('aria-pressed')).toBe('true')
    expect(layoutDiff(before, snapshot(listEl()))).toEqual([])
  })

  it('strikes the amount through with the name, and puts both back', () => {
    const row = rowWithAmount()
    const amountOf = r => r.querySelector('[data-row-amount]')
    const before = snapshot(row)

    act(() => { row.click() })
    const after = rowWithAmount()
    expect(amountOf(after).style.textDecoration).toBe('line-through')
    expect(after.querySelector('[data-row-name]').style.textDecoration).toBe('line-through')

    act(() => { rowWithAmount().click() })
    expect(snapshot(rowWithAmount())).toEqual(before)
  })

  /* The amount must not push the row taller or wider. It is
     flexShrink: 0 and the NAME gives way — a truncated ingredient is
     still recognisable, a truncated number is a wrong number. */
  it('keeps the row at its token height and the name shrinking', () => {
    const row = rowWithAmount()
    expect(row.style.height).toBe('var(--pq-row-grocery)')
    /* jsdom expands the shorthand: flex:1 -> '1 1 0%'. */
    expect(row.querySelector('[data-row-name]').style.flex).toBe('1 1 0%')
    expect(row.querySelector('[data-row-name]').style.minWidth).toBe('0px')
    expect(row.querySelector('[data-row-name]').style.textOverflow).toBe('ellipsis')
    expect(row.querySelector('[data-row-amount]').style.flexShrink).toBe('0')
  })

  it('is mono and muted, not another name', () => {
    const a = amounts()[0]
    expect(a.style.fontFamily).toBe('var(--pq-mono)')
    expect(a.style.color).toBe('var(--pq-text-3)')
    expect(a.style.fontSize).toBe('13px')
  })

  /* The name is still the token size — adding a second thing to the row
     must not have bought the space by shrinking it (DEVIATIONS §19). */
  it('leaves the name at 18px', () => {
    expect(rowWithAmount().querySelector('[data-row-name]').style.fontSize)
      .toBe('var(--pq-size-grocery)')
  })
})

/* ── HIDING A ROW, AND GETTING IT BACK ────────────────────────────────
 *
 * "I don't need this" removes an item with nothing left on the list to
 * say so, in either view and on every day. That is what the user asked
 * for and it is also the failure mode the feature creates, so the way
 * back is tested as hard as the way in.
 *
 * Its own root because it switches views, and PinDay renders null the
 * moment the day leaves its pin.
 */
describe('hiding an item', () => {
  let hHost, hRoot, hBox

  async function mountBoth() {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    hHost = document.createElement('div')
    document.body.appendChild(hHost)
    hRoot = createRoot(hHost)
    hBox = {}
    function Probe() { hBox.store = useAppStore(); return null }
    await act(async () => {
      hRoot.render(
        <AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { hBox.store.setGroceryDay(PIN_DAY) })
  }
  afterEach(() => { if (hRoot) act(() => hRoot.unmount()); hHost?.remove(); hRoot = null })

  const listOf = () => hHost.querySelector('[data-grocery-list]')
  const rowsIn = () => [...listOf().querySelectorAll('button[aria-pressed]')]
  const nameOf = r => r.querySelector('[data-row-name]').textContent
  const names = () => rowsIn().map(nameOf)
  const toAisles = async () => {
    await act(async () => { hHost.querySelector('[data-aisles-pill]').click() })
  }
  /* Open the expander on the row with this name and press its hide. */
  async function hideRowNamed(name) {
    const i = rowsIn().findIndex(r => nameOf(r) === name)
    expect(i, `no row named ${name}`).toBeGreaterThanOrEqual(0)
    const exp = [...listOf().querySelectorAll('button[aria-expanded]')]
      .filter(b => (b.getAttribute('aria-label') || '').includes(name))
    await act(async () => { exp[0].click() })
    const btn = listOf().querySelector('[data-hide-item]')
    expect(btn, 'no hide control in the expander').toBeTruthy()
    await act(async () => { btn.click() })
  }

  it('offers the control in the expander of the day view', async () => {
    await mountBoth()
    expect(listOf().querySelector('[data-hide-item]')).toBeFalsy()   // shut
    await act(async () => {
      listOf().querySelectorAll('button[aria-expanded]')[0].click()
    })
    const btn = listOf().querySelector('[data-hide-item]')
    expect(btn).toBeTruthy()
    expect(btn.textContent).toMatch(/need this/i)
    /* NEVER the word "excluded": the other set on this screen is a
       different thing and the two must not read as one. */
    expect(btn.textContent.toLowerCase()).not.toContain('exclude')
  })

  it('offers the same control in the aisle view', async () => {
    await mountBoth()
    await toAisles()
    await act(async () => {
      listOf().querySelectorAll('button[aria-expanded]')[1].click()
    })
    expect(listOf().querySelector('[data-hide-item]')).toBeTruthy()
  })

  it('removes the item from the day view, not dims it', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideRowNamed(victim)
    expect(names()).not.toContain(victim)
  })

  it('removes it from the aisle view too', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideRowNamed(victim)
    await toAisles()
    expect(names()).not.toContain(victim)
  })

  it('drops N LEFT by one', async () => {
    await mountBoth()
    const before = Number(/(\d+) left/.exec(hHost.textContent)[1])
    await hideRowNamed(names()[0])
    const after = Number(/(\d+) left/.exec(hHost.textContent)[1])
    expect(after).toBe(before - 1)
  })

  it('is gone from every day, not only the one it was hidden from', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideRowNamed(victim)
    for (let d = 0; d < FIXED_PLAN.length; d++) {
      await act(async () => { hBox.store.setGroceryDay(d) })
      expect(names(), `day ${d}`).not.toContain(victim)
    }
  })

  it('survives a reload', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideRowNamed(victim)

    act(() => hRoot.unmount()); hHost.remove(); hRoot = null
    hHost = document.createElement('div')
    document.body.appendChild(hHost)
    hRoot = createRoot(hHost)
    hBox = {}
    function Probe() { hBox.store = useAppStore(); return null }
    await act(async () => {
      hRoot.render(<AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { hBox.store.setGroceryDay(PIN_DAY) })
    expect(names()).not.toContain(victim)
  })
})

describe('getting a hidden item back', () => {
  let hHost, hRoot, hBox

  async function mountBoth() {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    hHost = document.createElement('div')
    document.body.appendChild(hHost)
    hRoot = createRoot(hHost)
    hBox = {}
    function Probe() { hBox.store = useAppStore(); return null }
    await act(async () => {
      hRoot.render(<AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { hBox.store.setGroceryDay(PIN_DAY) })
  }
  afterEach(() => { if (hRoot) act(() => hRoot.unmount()); hHost?.remove(); hRoot = null })

  const listOf = () => hHost.querySelector('[data-grocery-list]')
  const rowsIn = () => [...listOf().querySelectorAll('button[aria-pressed]')]
  const nameOf = r => r.querySelector('[data-row-name]').textContent
  const names = () => rowsIn().map(nameOf)
  const headerCount = () => hHost.querySelector('[data-hidden-count]')
  const sheetRows = () => [...document.querySelectorAll('[data-hidden-row]')]

  async function hideByStore(name) {
    const row = rowsIn().find(r => nameOf(r) === name)
    const id = hBox.store.groceryRows.find(r => r.name === name).id
    expect(row).toBeTruthy()
    await act(async () => { hBox.store.hideGroceryItem(id) })
  }

  it('shows no count until something is hidden', async () => {
    await mountBoth()
    expect(headerCount()).toBeFalsy()
  })

  it('shows the count once something is', async () => {
    await mountBoth()
    await hideByStore(names()[0])
    expect(headerCount()).toBeTruthy()
    expect(headerCount().textContent).toBe('1 hidden')
  })

  it('counts up, and says hidden rather than excluded', async () => {
    await mountBoth()
    const [a, b] = names()
    await hideByStore(a)
    await hideByStore(b)
    expect(headerCount().textContent).toBe('2 hidden')
    expect(hHost.textContent.toLowerCase()).not.toContain('excluded')
  })

  it('opens a sheet listing them by name', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideByStore(victim)
    await act(async () => { headerCount().click() })
    expect(sheetRows()).toHaveLength(1)
    expect(sheetRows()[0].textContent).toContain(victim)
  })

  it('restores one, and it returns to BOTH views', async () => {
    await mountBoth()
    const victim = names()[0]
    await hideByStore(victim)
    expect(names()).not.toContain(victim)

    await act(async () => { headerCount().click() })
    const restore = sheetRows()[0].querySelector('button')
    await act(async () => { restore.click() })

    expect(names()).toContain(victim)
    await act(async () => { hHost.querySelector('[data-aisles-pill]').click() })
    expect(names()).toContain(victim)
    expect(headerCount()).toBeFalsy()
  })

  it('shows all again in one press', async () => {
    await mountBoth()
    const [a, b] = names()
    await hideByStore(a)
    await hideByStore(b)
    await act(async () => { headerCount().click() })

    const all = [...document.querySelectorAll('button')]
      .find(x => x.textContent === 'SHOW ALL AGAIN')
    expect(all).toBeTruthy()
    await act(async () => { all.click() })

    expect(hBox.store.groceryHidden).toEqual(new Set())
    expect(names()).toContain(a)
    expect(names()).toContain(b)
  })

  /* One item is not a list to bulk-restore; the per-row action is right
     there. */
  it('offers no show-all for a single hidden item', async () => {
    await mountBoth()
    await hideByStore(names()[0])
    await act(async () => { headerCount().click() })
    expect([...document.querySelectorAll('button')]
      .find(x => x.textContent === 'SHOW ALL AGAIN')).toBeFalsy()
  })
})

/* ── A GROUP WITH NOTHING LEFT ────────────────────────────────────────
 * A recipe photo and a title over no rows reads as a bug. */
describe('a group whose every item is hidden', () => {
  let gHost, gRoot, gBox

  async function mountDayOnly() {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    gHost = document.createElement('div')
    document.body.appendChild(gHost)
    gRoot = createRoot(gHost)
    gBox = {}
    function Probe() { gBox.store = useAppStore(); return null }
    await act(async () => {
      gRoot.render(<AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { gBox.store.setGroceryDay(PIN_DAY) })
  }
  afterEach(() => { if (gRoot) act(() => gRoot.unmount()); gHost?.remove(); gRoot = null })

  it('does not render, and the other group still does', async () => {
    await mountDayOnly()
    const headings = () => [...gHost.querySelectorAll('[data-grocery-list] h3')]
      .map(h => h.textContent)
    expect(headings()).toHaveLength(2)
    const doomed = headings()[0]

    /* Hide every ingredient of the FIRST recipe. */
    const first = groupsForDay(FIXED_PLAN, catalog, new Set(), PIN_DAY)[0]
    /* ONE ACT PER HIDE. The mutators derive the next value from
       state captured at render, so two calls in one tick both start
       from the same snapshot — documented in DEVIATIONS as a latent
       that the UI cannot reach, because two taps are two renders. This
       loop is the UI, so it renders between them. */
    for (const i of first.items) {
      await act(async () => { gBox.store.hideGroceryItem(i.itemId) })
    }

    expect(headings()).not.toContain(doomed)
    expect(headings()).toHaveLength(1)
  })

  /* The way back must not vanish with it. */
  it('still counts its items in the header', async () => {
    await mountDayOnly()
    const first = groupsForDay(FIXED_PLAN, catalog, new Set(), PIN_DAY)[0]
    /* ONE ACT PER HIDE. The mutators derive the next value from
       state captured at render, so two calls in one tick both start
       from the same snapshot — documented in DEVIATIONS as a latent
       that the UI cannot reach, because two taps are two renders. This
       loop is the UI, so it renders between them. */
    for (const i of first.items) {
      await act(async () => { gBox.store.hideGroceryItem(i.itemId) })
    }
    const count = gHost.querySelector('[data-hidden-count]')
    expect(count).toBeTruthy()
    expect(Number(/(\d+)/.exec(count.textContent)[1])).toBeGreaterThanOrEqual(1)
  })
})

/* ── THE PER-GROUP NOTE ───────────────────────────────────────────────
 *
 * The header count answers "what have I hidden". This answers the
 * question actually asked in a shop, standing over one recipe: "is this
 * everything?" So it is per group and per day, and it is absent — not
 * zero — when there is nothing to say.
 *
 * Recipes 1 and 2 share six ingredients (chicken breast, paprika, salt,
 * black pepper, olive oil, parsley) and each has items the other does
 * not. That overlap is what makes the "hidden from a different recipe"
 * case testable at all, so it is asserted here rather than assumed.
 */
describe('the per-group hidden note', () => {
  let nHost, nRoot, nBox

  async function mountDay() {
    localStorage.clear()
    localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(FIXED_PLAN))
    nHost = document.createElement('div')
    document.body.appendChild(nHost)
    nRoot = createRoot(nHost)
    nBox = {}
    function Probe() { nBox.store = useAppStore(); return null }
    await act(async () => {
      nRoot.render(<AppStoreProvider><Probe /><Grocery /></AppStoreProvider>)
    })
    await act(async () => { await authCb(null) })
    await act(async () => { nBox.store.setGroceryDay(PIN_DAY) })
  }
  afterEach(() => { if (nRoot) act(() => nRoot.unmount()); nHost?.remove(); nRoot = null })

  const sections = () => [...nHost.querySelectorAll('[data-grocery-list] section')]
  const notes = () => sections().map(s => s.querySelector('[data-group-hidden]'))
  const noteTexts = () => notes().map(n => n?.textContent ?? null)
  const idOf = name => {
    const row = nBox.store.groceryRows.find(r => r.name === name)
    expect(row, `no row named ${name}`).toBeTruthy()
    return row.id
  }
  const hide = async name => {
    await act(async () => { nBox.store.hideGroceryItem(idOf(name)) })
  }

  it('is absent from every group while nothing is hidden', async () => {
    await mountDay()
    expect(sections()).toHaveLength(2)
    expect(noteTexts()).toEqual([null, null])
  })

  /* `lemon` is on recipe 1 and NOT on recipe 2. */
  it('counts only that group, and leaves the other group with none', async () => {
    await mountDay()
    await hide('lemon')
    expect(noteTexts()).toEqual(['1 hidden', null])

    await hide('sriracha')                       // recipe 1 only, again
    expect(noteTexts()).toEqual(['2 hidden', null])
  })

  /* THE POINT OF HIDING BEING GLOBAL. Hidden from meal 1, gone from
     meal 2 as well — so meal 2 has to say so too, or it silently shows
     a short ingredient list. */
  it('appears on a group whose ingredient was hidden from a different recipe', async () => {
    await mountDay()
    await hide('olive oil')                      // on BOTH recipes
    expect(noteTexts()).toEqual(['1 hidden', '1 hidden'])
  })

  it('opens the sheet scoped to that group, not the whole set', async () => {
    await mountDay()
    await hide('lemon')                          // recipe 1 only
    await hide('honey')                          // recipe 2 only
    expect(noteTexts()).toEqual(['1 hidden', '1 hidden'])

    await act(async () => { notes()[1].click() })
    const rows = [...document.querySelectorAll('[data-hidden-row]')]
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('honey')

    /* The header's own count still knows about both. */
    expect(nHost.querySelector('[data-hidden-count]').textContent).toBe('2 hidden')
  })

  /* One recipe's sheet must not offer to restore the other's. */
  it('offers no show-all when scoped to one group', async () => {
    await mountDay()
    await hide('lemon')
    await hide('sriracha')
    await hide('honey')
    await act(async () => { notes()[0].click() })
    expect([...document.querySelectorAll('[data-hidden-row]')]).toHaveLength(2)
    expect([...document.querySelectorAll('button')]
      .find(x => x.textContent === 'SHOW ALL AGAIN')).toBeFalsy()
  })

  it('restores from the group sheet, and the note counts down', async () => {
    await mountDay()
    await hide('lemon')
    await hide('sriracha')
    await act(async () => { notes()[0].click() })

    const first = [...document.querySelectorAll('[data-hidden-row]')][0]
    const name = first.querySelector('span').textContent
    await act(async () => { first.querySelector('button').click() })

    expect(noteTexts()).toEqual(['1 hidden', null])
    const rowNames = [...nHost.querySelectorAll('[data-row-name]')].map(s => s.textContent)
    expect(rowNames).toContain(name)
  })

  /* An all-hidden group does not render, so it has no rows for a note
     to sit under, and no note of its own. The header keeps the way
     back.

     THE SURVIVING GROUP'S NOTE IS NOT ZERO, and the first version of
     this test wrongly said it would be: recipes 1 and 2 share six
     ingredients, so emptying recipe 2 takes those six off recipe 1 as
     well. That is the feature working — hiding is global — and the
     number is asserted rather than waved at, because "6" is exactly
     the overlap and a change to either card would move it. */
  it('is gone with the group when every one of its items is hidden', async () => {
    await mountDay()
    const [, doomed] = groupsForDay(FIXED_PLAN, catalog, new Set(), PIN_DAY)
    for (const i of doomed.items) {
      await act(async () => { nBox.store.hideGroceryItem(i.itemId) })
    }
    expect(sections()).toHaveLength(1)
    expect(noteTexts()).toEqual(['6 hidden'])
    /* And the note that is left belongs to the OTHER recipe. */
    await act(async () => { notes()[0].click() })
    expect([...document.querySelectorAll('[data-hidden-row]')]).toHaveLength(6)
    expect(nHost.querySelector('[data-hidden-count]').textContent).toBe('14 hidden')
  })

  /* Hiding is global; the note is per DAY, because the group is. */
  it('follows the item to another day that uses it', async () => {
    await mountDay()
    await hide('olive oil')
    /* Monday is recipes 3 and 4. Recipe 3 uses olive oil and recipe 4
       does not — so the note follows the ITEM, not the day it was
       hidden on, and still only marks the group that wanted it. */
    await act(async () => { nBox.store.setGroceryDay(0) })
    expect(noteTexts()).toEqual(['1 hidden', null])
  })
})
