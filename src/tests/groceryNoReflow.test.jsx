import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
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

const { AppStoreProvider } = await import('../store/useAppStore')
const { default: Grocery } = await import('../components/Grocery')

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
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<AppStoreProvider><Grocery /></AppStoreProvider>) })
  await act(async () => { await authCb(null) })          // signed out, localStorage path
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const listEl = () => host.querySelector('[data-grocery-list]')

const rowButtons = () =>
  [...host.querySelectorAll('button')].filter(b => b.style.height === '56px' && b.querySelector('span'))

describe('the screen renders real food', () => {
  it('has rows at all, and they are 56px', () => {
    const rows = rowButtons()
    expect(rows.length).toBeGreaterThan(10)
    for (const r of rows) expect(r.style.height).toBe('56px')
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
