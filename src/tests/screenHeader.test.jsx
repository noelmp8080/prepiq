import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import ScreenHeader from '../components/ScreenHeader'

/* ── THE SCREEN HEADER ────────────────────────────────────────────────
 *
 * The contract is three fields: { eyebrow, title, actions }. What is
 * tested here is that the contract HOLDS — that no screen needed a
 * fourth field, and that the values the prototype fixes live in one
 * place rather than four.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

const { AppStoreProvider } = await import('../store/useAppStore')
const { ThemeProvider } = await import('../store/useTheme')
const { lsKey, todayIndex } = await import('../store/storeLogic')

const SCREENS = ['Today', 'Plan', 'Recipes', 'Track']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const todayIdx = () => todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

let host, root
async function mount(name, surface) {
  const { default: Screen } = await import(`../components/${name}.jsx`)
  localStorage.clear()
  localStorage.setItem(lsKey(null, 'weekplan'), JSON.stringify(
    DAYS.map((day, i) => ({ day, ids: i === todayIdx() ? [1, 2] : [null, null] }))))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider>
        <Screen onChange={() => {}} onOpenSettings={() => {}} surface={surface} />
      </AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
  return host
}
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const header = () => host.querySelector('[data-screen-header]')

/* ── The contract ─────────────────────────────────────────────────── */
describe('the contract is three fields, and it held', () => {
  it('takes eyebrow, title and actions — and nothing else about content', () => {
    const src = readFileSync('src/components/ScreenHeader.jsx', 'utf8')
    const props = src.slice(src.indexOf('export default function ScreenHeader('),
                            src.indexOf('}) {'))
    /* `surface` selects values, `style` is layout — the Card convention.
       Neither is header CONTENT, which is what the contract governs. */
    expect(props).toContain('eyebrow')
    expect(props).toContain('title')
    expect(props).toContain('actions')
    expect(props).toContain('surface')
    expect(props).toContain('style')
    /* no render callbacks, no children, no per-screen escape */
    expect(props).not.toContain('children')
    expect(props).not.toMatch(/render[A-Z]/)
    expect(props).not.toContain('variant')
  })

  it('is used by all four titled screens and by no other', () => {
    for (const f of SCREENS) {
      expect(readFileSync(`src/components/${f}.jsx`, 'utf8'), f)
        .toContain('<ScreenHeader')
    }
    /* Grocery is deliberately out: no <h1>, and its sticky bar is a
       control rather than a title. */
    const g = readFileSync('src/components/Grocery.jsx', 'utf8')
    expect(g).not.toContain('ScreenHeader')
    expect(g).not.toContain('<h1')
  })

  /* THE ESCAPE-HATCH CHECK. `style` is layout-only and exactly one
     screen needed it — Today, because a logo lockup sits above it on
     phone and the gap is 14px rather than 24px. If a second screen ever
     needs it, the contract is wrong and should be re-cut. */
  it('needed the layout escape exactly once, on the screen with a lockup', async () => {
    /* Asserted at RUNTIME, on the rendered padding, rather than by
       slicing the source — the first version sliced from <ScreenHeader
       to the next '/>' and caught the `style=` on the action BUTTONS
       inside it, reporting three screens instead of one. The rendered
       outcome is what the contract is about anyway. */
    const pad = {}
    for (const f of SCREENS) {
      await mount(f, 'phone')
      pad[f] = header().style.padding
      act(() => root.unmount()); host.remove(); root = null
    }
    /* Today alone differs, and only because a lockup sits above it. */
    expect(pad.Today).toBe('14px 20px 0px')
    const overrides = SCREENS.filter(f => pad[f] !== '24px 20px 0px')
    expect(overrides).toEqual(['Today'])
  })
})

/* ── The values the prototype fixes ───────────────────────────────── */
describe('one definition of the bar', () => {
  const render = (props = {}) => renderToStaticMarkup(
    <ScreenHeader eyebrow="MON · AUG 24" title="Today" surface="phone" {...props} />)

  it('draws the rule across the full content width on wide, and none on phone', () => {
    for (const s of ['tablet', 'desktop']) {
      expect(render({ surface: s }), s).toContain('border-bottom:1px solid rgba(255,255,255,0.09)')
    }
    expect(render({ surface: 'phone' })).toContain('border-bottom:none')
  })

  it('uses the prototype headPad on wide and block C’s padding on phone', () => {
    /* 24px 32px 20px at desktop comes out as the gutter token, which is
       32px past 1400 — one breakpoint, not two numbers to keep in sync. */
    expect(render({ surface: 'tablet' })).toContain('padding:24px var(--pq-gutter) 20px')
    expect(render({ surface: 'desktop' })).toContain('padding:24px var(--pq-gutter) 20px')
    expect(render({ surface: 'phone' })).toContain('padding:24px 20px 0')
  })

  it('renders the title through the token and the eyebrow in mono', () => {
    const html = render()
    expect(html).toContain('var(--pq-size-title)')
    expect(html).toContain('var(--pq-mono)')
    expect(html).toContain('var(--pq-track-eyebrow)')
    expect(html).toContain('<h1')
  })

  it('omits the actions row entirely when a screen has none', () => {
    expect(render({ actions: null })).not.toContain('gap:9px')
    expect(render({ actions: <button>X</button> })).toContain('gap:9px')
  })
})

/* ── WHERE the title is, not just that it exists ──────────────────── */
describe('every screen puts its title in the header, above the body', () => {
  for (const [name, title] of [['Today', 'Today'], ['Plan', 'Week'],
                               ['Recipes', 'Recipes'], ['Track', 'Track']]) {
    it(`${name}: the h1 is inside the header, and the header is first`, async () => {
      await mount(name, 'tablet')
      const h = header()
      expect(h, `${name} renders no header`).toBeTruthy()

      const h1 = host.querySelector('h1')
      expect(h1.textContent).toBe(title)
      /* WHERE, not whether: the title must be INSIDE the header. */
      expect(h.contains(h1)).toBe(true)

      /* and the header is above the body, not in a column */
      const grid = [...host.querySelectorAll('div')]
        .find(d => (d.style.gridTemplateColumns || '').includes('minmax(0,1fr)'))
      if (grid) expect(grid.contains(h)).toBe(false)
      expect(h.compareDocumentPosition(host.querySelector('h1')) &
             Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy()
    })
  }

  it('the rule spans the content, not one column', async () => {
    await mount('Today', 'desktop')
    const h = header()
    /* jsdom normalises rgba spacing on read-back; the served value is
       asserted un-normalised in the markup test above. */
    expect(h.style.borderBottom.replace(/,\s+/g, ',')).toBe('1px solid rgba(255,255,255,0.09)')
    const grid = [...host.querySelectorAll('div')]
      .find(d => (d.style.gridTemplateColumns || '').includes('minmax(0,1fr)'))
    expect(grid).toBeTruthy()
    /* the header is a SIBLING of the grid, so its 1px rule runs the full
       width rather than stopping at the first column */
    expect(grid.contains(h)).toBe(false)
    expect(h.parentElement).toBe(grid.parentElement)
  })
})

/* ── The duplicated chrome ────────────────────────────────────────── */
describe('wide drops the chrome the rail already carries', () => {
  it('shows one logo on phone and none on wide', async () => {
    await mount('Today', 'phone')
    expect(host.textContent).toContain('Prep')
    const phoneTiles = [...host.querySelectorAll('*')].filter(e => e.style.width === '30px')
    expect(phoneTiles.length).toBe(1)
    act(() => root.unmount()); host.remove(); root = null

    /* On wide the rail carries the lockup — two [IQ] tiles on one screen
       is the app telling you twice where you are. */
    await mount('Today', 'tablet')
    expect(host.textContent).not.toContain('Prep')
    expect([...host.querySelectorAll('*')].filter(e => e.style.width === '30px')).toHaveLength(0)
  })

  it('shows the settings gear on phone and none on wide', async () => {
    await mount('Today', 'phone')
    expect(host.querySelector('[aria-label="Settings"]')).toBeTruthy()
    act(() => root.unmount()); host.remove(); root = null

    /* the rail has Goals as its own destination on wide */
    await mount('Today', 'desktop')
    expect(host.querySelector('[aria-label="Settings"]')).toBe(null)
  })

  /* Conditional, not deleted — the phone has no rail and would lose its
     only wordmark and its only route to Settings. */
  it('keeps both in the source, gated on surface', () => {
    const src = readFileSync('src/components/Today.jsx', 'utf8')
    expect(src).toContain('<Logo')
    expect(src).toContain('aria-label="Settings"')
    expect(src).toMatch(/\{!wide && \(/)
    expect(src).toMatch(/wide \? null : \(/)
  })
})
