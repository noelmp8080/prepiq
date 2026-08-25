import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

/* iPad and desktop. Nothing about the visual language changes between
   surfaces — only layout and affordance sizes — so what is tested here
   is the layout, the persistence, and the two places state crosses a
   surface boundary. */

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
const { default: Rail } = await import('../components/Rail')
const { default: Settings } = await import('../components/Settings')
const { surfaceFor, isWide, PHONE_MAX, TABLET_MAX } = await import('../store/useSurface')
const { railIsExpanded, readRail, railKey, lsKey } = await import('../store/storeLogic')

const TOKENS = readFileSync('src/tokens.css', 'utf8')

/* ── Surfaces ─────────────────────────────────────────────────────── */
describe('which surface is this', () => {
  it('puts each reference size comfortably inside its own band', () => {
    /* The handoff's own three: 390x844, 1194x834, 1512x950. */
    expect(surfaceFor(390)).toBe('phone')
    expect(surfaceFor(1194)).toBe('tablet')
    expect(surfaceFor(1512)).toBe('desktop')
  })

  it('leaves room below each reference width', () => {
    /* An iPad with browser chrome is narrower than 1194; a desktop
       window is whatever the user dragged it to. A breakpoint set AT the
       reference width is a layout nobody sees. */
    expect(surfaceFor(1100)).toBe('tablet')
    expect(surfaceFor(1420)).toBe('desktop')
    expect(surfaceFor(PHONE_MAX)).toBe('phone')
    expect(surfaceFor(PHONE_MAX + 1)).toBe('tablet')
    expect(surfaceFor(TABLET_MAX)).toBe('tablet')
    expect(surfaceFor(TABLET_MAX + 1)).toBe('desktop')
  })

  /* An iPad in PORTRAIT is 834px wide and gets the phone layout, which
     is correct — there is no room for a rail and a two-pane split. */
  it('treats a portrait tablet as a phone', () => {
    expect(surfaceFor(834)).toBe('phone')
    expect(isWide('phone')).toBe(false)
    expect(isWide('tablet')).toBe(true)
    expect(isWide('desktop')).toBe(true)
  })

  /* THE TWO FILES MUST AGREE. useSurface decides when the rail appears;
     tokens.css decides when the gutter widens. If they drift, the rail
     shows up at a width the layout has not widened for. */
  it('matches the breakpoints tokens.css widens the gutter at', () => {
    expect(TOKENS).toMatch(/@media \(min-width:\s*900px\)/)
    expect(TOKENS).toMatch(/@media \(min-width:\s*1400px\)/)
    expect(PHONE_MAX + 1).toBe(900)
    expect(TABLET_MAX + 1).toBe(1400)
  })
})

/* ── The rail ─────────────────────────────────────────────────────── */
describe('the rail', () => {
  const render = (props = {}) => renderToStaticMarkup(
    <Rail active="today" onChange={() => {}} expanded={false} onToggle={() => {}} {...props} />)

  it('is 84px collapsed with 58px items and 9px mono captions', () => {
    const html = render()
    expect(html).toContain('width:84px')
    expect(html).toContain('padding:20px 14px')
    expect(html).toContain('min-height:58px')
    expect(html).toContain('font-size:9px')
    expect(html).toContain('letter-spacing:.08em')
    expect(html).toContain('var(--pq-mono)')
  })

  it('is 224px expanded with 44px rows and 13px sans labels', () => {
    const html = render({ expanded: true })
    expect(html).toContain('width:224px')
    expect(html).toContain('padding:22px 16px')
    expect(html).toContain('min-height:44px')
    expect(html).toContain('font-size:13px')
    expect(html).toContain('MEAL PREP')            // the full lockup caption
  })

  it('carries the handoff surface treatment', () => {
    const html = render()
    expect(html).toContain('linear-gradient(180deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)')
    expect(html).toContain('border-right:1px solid rgba(255,255,255,0.1)')
    expect(html).toContain('inset -1px 0 0 rgba(0,0,0,0.25)')
  })

  it('shows the 34px tile collapsed and the full lockup expanded', () => {
    expect(render()).toContain('width:34px')
    expect(render()).not.toContain('MEAL PREP')
    expect(render({ expanded: true })).toContain('width:34px')
  })

  /* SIX DESTINATIONS on wide: the five phone tabs plus Goals. */
  it('offers six destinations, with Goals at the foot', () => {
    const html = render({ expanded: true })
    for (const l of ['Today', 'Week', 'Recipes', 'Grocery', 'Track', 'Goals']) {
      expect(html, l).toContain(`>${l}</span>`)
    }
    expect(html.indexOf('>Goals</span>')).toBeGreaterThan(html.indexOf('>Track</span>'))
  })

  /* Different jobs: the label names the control for a screen reader, the
     title is the tooltip that makes a 9px caption usable with a mouse. */
  it('gives every button an aria-label AND a title', () => {
    const html = render()
    const buttons = html.match(/<button[^>]*>/g) || []
    expect(buttons.length).toBe(7)                 // 5 + Goals + collapse
    for (const b of buttons) {
      expect(b, b).toMatch(/aria-label="/)
      expect(b, b).toMatch(/title="/)
    }
  })

  it('marks the active destination in the markup, not only in colour', () => {
    const html = render({ active: 'grocery' })
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1)
  })

  it('badges only where a number means something, and only expanded', () => {
    expect(render({ expanded: true, badges: { grocery: 12 } })).toContain('>12</span>')
    expect(render({ expanded: false, badges: { grocery: 12 } })).not.toContain('>12</span>')
    expect(render({ expanded: true, badges: { grocery: 0 } })).not.toContain('>0</span>')
  })

  it('draws the 34px collapse control inside a 44px target', () => {
    const html = render()
    expect(html).toContain('aria-label="Expand sidebar"')
    expect(render({ expanded: true })).toContain('aria-label="Collapse sidebar"')
    expect(html).toContain('min-height:34px')
    expect(html).toContain('min-height:var(--pq-tap-min)')
  })

  it('keeps every target at 44px or more', () => {
    for (const expanded of [false, true]) {
      const html = render({ expanded })
      const heights = [...html.matchAll(/<button[^>]*style="([^"]*)"/g)]
        .map(m => (m[1].match(/min-height:([^;"]+)/) || [])[1])
      for (const h of heights) {
        expect(h, `${expanded ? 'expanded' : 'collapsed'} rail button at ${h}`)
          .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^5\dpx/)
      }
    }
  })
})

/* ── Rail width is a choice ───────────────────────────────────────── */
describe('rail width is a user choice, not a breakpoint', () => {
  beforeEach(() => localStorage.clear())

  it('lets the surface decide only until the user has', () => {
    expect(railIsExpanded(null, 'desktop')).toBe(true)
    expect(railIsExpanded(null, 'tablet')).toBe(false)
    /* once chosen, the surface has no opinion */
    expect(railIsExpanded(false, 'desktop')).toBe(false)
    expect(railIsExpanded(true, 'tablet')).toBe(true)
  })

  it('persists across a reload, per scope', () => {
    let box = {}
    function Probe() { box.store = useAppStore(); return null }
    const mount = () => {
      const h = document.createElement('div')
      document.body.appendChild(h)
      const r = createRoot(h)
      act(() => { r.render(<AppStoreProvider><Probe /></AppStoreProvider>) })
      return { h, r }
    }

    const first = mount()
    expect(box.store.railStored).toBe(null)
    act(() => { box.store.setRailExpanded(true) })
    expect(readRail(null)).toBe(true)
    act(() => { first.r.unmount() }); first.h.remove()

    /* a NEW store, as after a reload */
    const second = mount()
    expect(box.store.railStored).toBe(true)
    expect(railIsExpanded(box.store.railStored, 'tablet')).toBe(true)
    act(() => { second.r.unmount() }); second.h.remove()
  })

  it('is scoped like every other stored key', () => {
    expect(railKey(null)).toBe(lsKey(null, 'rail_expanded'))
    expect(railKey('u1')).toBe('prepiq_u1_rail_expanded')
    expect(readRail('u1')).toBe(null)
  })

  /* A sidebar width is not account data. Syncing it would let a phone
     session rearrange a desktop one. */
  it('never reaches the cloud', () => {
    const src = readFileSync('src/store/useAppStore.jsx', 'utf8')
    const fn = src.slice(src.indexOf('const setRailExpanded'), src.indexOf('const toggleFavorite'))
    expect(fn).toContain('writeRail')
    expect(fn).not.toContain('cloudWrite')
  })
})

/* ── Settings crosses the surface boundary ────────────────────────── */
describe('Settings is a sheet and a pane, and does not lose state between them', () => {
  let host, root, box
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

  function mount(inline) {
    box = { inline }
    function Probe() { box.store = useAppStore(); return null }
    function Harness() {
      return (
        <ThemeProvider><AppStoreProvider>
          <Probe />
          <Settings open inline={box.inlineNow} onClose={() => {}} />
        </AppStoreProvider></ThemeProvider>
      )
    }
    box.inlineNow = inline
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    box.Harness = Harness
    act(() => { root.render(<Harness />) })
  }
  afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })
  beforeEach(() => localStorage.clear())

  it('renders a dialog on phone and a region on wide', () => {
    mount(false)
    expect(host.querySelector('[role="dialog"]')).toBeTruthy()
    expect(host.querySelector('[data-settings-pane]')).toBe(null)
    act(() => { root.unmount() }); host.remove(); root = null

    mount(true)
    expect(host.querySelector('[data-settings-pane]')).toBeTruthy()
    expect(host.querySelector('[role="dialog"]')).toBe(null)
    expect(host.querySelector('[data-settings-pane]').getAttribute('aria-label')).toBe('Daily goals')
  })

  it('shows the same body either way — same tokens, same fields', () => {
    /* The sheet wrapper carries its slide-up keyframes in a <style>,
       which lands in textContent; the pane has no entrance animation.
       That is the wrapper differing, which is the point — so it is
       excluded rather than allowed to mask a real difference. */
    const bodyOf = () => [...host.querySelectorAll('*')]
      .filter(e => e.tagName !== 'STYLE' && e.children.length === 0)
      .map(e => e.textContent).join('|')

    mount(false)
    const sheet = bodyOf()
    expect(sheet).toContain('NUTRITION TARGETS')
    act(() => { root.unmount() }); host.remove(); root = null

    mount(true)
    expect(bodyOf()).toBe(sheet)
  })

  /* THE ONE THE BRIEF NAMES. Narrow the window mid-edit and the pane
     becomes the sheet — the draft must survive, which it only does
     because App keeps Settings mounted and flips a prop. */
  it('keeps a half-typed goal when the pane becomes a sheet', () => {
    mount(true)
    const field = host.querySelector('#goal-calories')
    act(() => {
      setter.call(field, '2468')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('#goal-calories').value).toBe('2468')
    expect(box.store.goals.calories).toBe(1800)          // not saved yet

    /* the surface narrows: same element, different wrapper */
    box.inlineNow = false
    act(() => { root.render(<box.Harness />) })

    expect(host.querySelector('[role="dialog"]')).toBeTruthy()
    expect(host.querySelector('#goal-calories').value).toBe('2468')
  })

  it('and the other way, sheet to pane', () => {
    mount(false)
    const field = host.querySelector('#goal-protein')
    act(() => {
      setter.call(field, '199')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    box.inlineNow = true
    act(() => { root.render(<box.Harness />) })
    expect(host.querySelector('[data-settings-pane]')).toBeTruthy()
    expect(host.querySelector('#goal-protein').value).toBe('199')
  })
})

/* ── Offline, on a wide surface ───────────────────────────────────── */
describe('wide works with the network down', () => {
  it('renders the rail and a full screen with no auth event at all', async () => {
    const { default: Grocery } = await import('../components/Grocery')
    const { lsKey: key, todayIndex } = await import('../store/storeLogic')
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const idx = todayIndex(DAYS.map(d => ({ day: d, ids: [] })))

    localStorage.clear()
    localStorage.setItem(key('u1', 'weekplan'), JSON.stringify(
      DAYS.map((day, i) => ({ day, ids: i === idx ? [1, 2] : [null, null] }))))
    localStorage.setItem('prepiq_last_uid', JSON.stringify('u1'))
    localStorage.setItem(railKey('u1'), JSON.stringify(true))

    const box = {}
    function Probe() { box.store = useAppStore(); return null }
    const h = document.createElement('div')
    document.body.appendChild(h)
    const r = createRoot(h)
    await act(async () => {
      r.render(
        <ThemeProvider><AppStoreProvider>
          <Probe />
          <Rail active="grocery" onChange={() => {}}
                expanded={railIsExpanded(box.railStored, 'desktop')} onToggle={() => {}} />
          <Grocery surface="desktop" />
        </AppStoreProvider></ThemeProvider>)
    })

    /* the auth callback is never fired: the radio is off */
    expect(box.store.user).toBeUndefined()
    expect(box.store.bootScope).toBe('u1')
    expect(box.store.railStored).toBe(true)
    expect(h.querySelector('[data-rail]')).toBeTruthy()
    expect(h.querySelector('[data-grocery-side]')).toBeTruthy()
    expect(h.textContent).toContain('25 left')

    act(() => { r.unmount() }); h.remove()
  })
})
