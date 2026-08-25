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
})
afterEach(() => { act(() => root.unmount()); host.remove() })

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
    const name = rowButtons()[0].querySelector('span:last-child')
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
    expect(row.querySelector('span:last-child').style.textDecoration).toBe('line-through')

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
    expect(wList().style.gridTemplateColumns).toBe('1fr 320px')
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
    expect(row.querySelector('span:last-child').style.textDecoration).toBe('line-through')
  })

  it('keeps the 56px row and the 44px expander at wide widths', () => {
    const row = wRows()[0]
    expect(row.style.height).toBe('var(--pq-row-grocery)')
    const exp = row.parentElement.querySelector('button[aria-expanded]')
    expect(exp.style.width).toBe('var(--pq-expander-w)')
    expect(exp.style.height).toBe('var(--pq-row-grocery)')
    /* and the name is still 18px — the one value the brief says never
       to reduce, on any surface */
    expect(row.querySelector('span:last-child').style.fontSize).toBe('var(--pq-size-grocery)')
  })

  it('gives every control on the wide screen at least 44px', () => {
    for (const b of wHost.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|var\(--pq-row-grocery\)|^4[4-9]px|^[5-9]\d+px/)
    }
  })
})
