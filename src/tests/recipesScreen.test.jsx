import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/* Finding one of 260. */

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
const { default: Recipes } = await import('../components/Recipes')
const { recipes } = await import('../data/recipes')

let host, root, box
async function mount() {
  box = {}
  function Probe() { box.store = useAppStore(); return null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ThemeProvider><AppStoreProvider><Probe /><Recipes /></AppStoreProvider></ThemeProvider>)
  })
  await act(async () => { await authCb(null) })
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const text = () => host.textContent
const rows = () => [...host.querySelectorAll('button')]
  .filter(b => b.querySelector('span') && b.style.padding === '11px 0px 11px 12px')
const chip = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)
const loadMore = () => [...host.querySelectorAll('button')]
  .find(b => b.textContent.startsWith('LOAD MORE'))
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
function search(q) {
  const input = host.querySelector('input')
  act(() => {
    setter.call(input, q)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('the list', () => {
  it('opens on a page, and says how many are left', async () => {
    await mount()
    expect(rows()).toHaveLength(40)
    expect(loadMore().textContent).toBe(`LOAD MORE · ${recipes.length - 40} LEFT`)
    expect(text()).toContain(`${recipes.length} OF ${recipes.length} RECIPES`)
  })

  it('loads another page and eventually runs out', async () => {
    await mount()
    act(() => { loadMore().click() })
    expect(rows()).toHaveLength(80)

    while (loadMore()) act(() => { loadMore().click() })
    expect(rows()).toHaveLength(recipes.length)
    expect(loadMore()).toBeUndefined()
  })

  it('renders rows at 48px with the 9px radius', async () => {
    await mount()
    const thumbs = [...host.querySelectorAll('img, div')].filter(e => e.style.width === '48px')
    expect(thumbs).toHaveLength(40)
    for (const t of thumbs) expect(t.style.borderRadius).toBe('9px')
  })
})

describe('search', () => {
  it('narrows to matching names and updates the count', async () => {
    await mount()
    search('chicken')
    const want = recipes.filter(r => r.name.toLowerCase().includes('chicken'))
    expect(want.length).toBeGreaterThan(5)
    expect(text()).toContain(`${want.length} OF ${recipes.length} RECIPES`)
    expect(rows().length).toBe(Math.min(40, want.length))
  })

  /* A search must not inherit the previous list's depth: without the
     reset, searching after LOAD MORE shows every match at once, and
     clearing a search leaves LOAD MORE claiming a page that is already
     on screen. */
  it('starts the page count over on every change', async () => {
    await mount()
    act(() => { loadMore().click() })
    act(() => { loadMore().click() })
    expect(rows()).toHaveLength(120)

    search('chicken')
    expect(rows().length).toBeLessThanOrEqual(40)

    search('')
    expect(rows()).toHaveLength(40)
  })

  it('says so when nothing matches, rather than showing an empty card', async () => {
    await mount()
    search('zzzznotarecipe')
    expect(text()).toContain('No recipes match')
    expect(rows()).toHaveLength(0)
    expect(loadMore()).toBeUndefined()
  })
})

describe('filter chips', () => {
  it('filters by source and by tag, against the real catalog', async () => {
    await mount()
    for (const [label, count] of [
      ["JALAL'S", recipes.filter(r => r.source === 'jalal').length],
      ['MEAL PREP', recipes.filter(r => r.source === 'mealprep').length],
      ['HIGH PROTEIN', recipes.filter(r => r.tags.includes('high-protein')).length],
      ['SEAFOOD', recipes.filter(r => r.tags.includes('seafood')).length],
    ]) {
      act(() => { chip(label).click() })
      expect(count, `${label} matches nothing in the catalog`).toBeGreaterThan(0)
      expect(text(), label).toContain(`${count} OF ${recipes.length} RECIPES`)
    }
  })

  /* Every chip must match something. A chip that silently filters to
     nothing is a tag that was renamed in the data and never here. */
  it('has no dead chip', async () => {
    await mount()
    const labels = [...host.querySelectorAll('[aria-pressed]')].map(b => b.textContent)
    expect(labels).toContain('ALL')
    for (const label of labels) {
      if (label === 'FAVES') continue                 // legitimately empty at first
      act(() => { chip(label).click() })
      expect(rows().length, `${label} is a dead chip`).toBeGreaterThan(0)
    }
  })

  it('marks the selected chip with the accent and says so in the markup', async () => {
    await mount()
    const pill = label => chip(label).querySelector('span')
    expect(chip('ALL').getAttribute('aria-pressed')).toBe('true')
    expect(pill('ALL').style.background).toBe('var(--pq-accent-grad)')
    expect(pill('ALL').style.color).toBe('var(--pq-on-accent-ink)')

    act(() => { chip('PASTA').click() })
    expect(chip('ALL').getAttribute('aria-pressed')).toBe('false')
    expect(pill('ALL').style.background).toBe('var(--pq-panel)')
    expect(pill('PASTA').style.background).toBe('var(--pq-accent-grad)')
  })

  it('combines a chip with a search', async () => {
    await mount()
    act(() => { chip('SEAFOOD').click() })
    const seafood = recipes.filter(r => r.tags.includes('seafood'))
    search(seafood[0].name)
    expect(rows()).toHaveLength(1)
    expect(text()).toContain(seafood[0].name)
  })

  it('fills FAVES only once something is favourited', async () => {
    await mount()
    act(() => { chip('FAVES').click() })
    expect(text()).toContain('No recipes match')

    act(() => { chip('ALL').click() })
    const heart = [...host.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Add '))
    const name = heart.getAttribute('aria-label').replace('Add ', '').replace(' to favourites', '')
    act(() => { heart.click() })

    act(() => { chip('FAVES').click() })
    expect(rows()).toHaveLength(1)
    expect(text()).toContain(name)
  })
})

describe('the row actions', () => {
  it('opens the recipe sheet from the row', async () => {
    await mount()
    act(() => { rows()[0].click() })
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('INGREDIENTS')
  })

  /* The trailing control is the heart, per the markup — not the assign
     button the prose describes. Assigning happens in the sheet, so the
     row does not carry two different commit actions. */
  it('toggles a favourite from the trailing heart, and persists it', async () => {
    await mount()
    const heart = [...host.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Add '))
    expect(heart.getAttribute('aria-pressed')).toBe('false')

    act(() => { heart.click() })
    expect(box.store.favorites.size).toBe(1)

    const again = [...host.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Remove '))
    expect(again.getAttribute('aria-pressed')).toBe('true')
  })

  it('gives every button at least 44px', async () => {
    await mount()
    for (const b of host.querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `"${b.textContent.slice(0, 24)}" at ${h || 'no height'}`)
        .toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\d+px|^\d{3,}px/)
    }
  })

  /* The pill is drawn at the design's size; the TARGET around it is 44.
     Growing the pill would change the design, shrinking the target would
     break the handoff's own floor. */
  it('draws the chip pill smaller than its 44px target', async () => {
    await mount()
    const c = chip('PASTA')
    expect(c.style.minHeight).toBe('var(--pq-tap-min)')
    expect(c.querySelector('span').style.padding).toBe('7px 12px')
  })
})

/* ── The ramp, confirmed at full list length ──────────────────────────
 *
 * Block A closed the "does it read flat at 260 rows" question by making
 * the ramp a fixed layer rather than a document-height one, and the
 * brief asks for that confirmed HERE, on the screen that actually holds
 * 260 rows.
 *
 * jsdom cannot measure a gradient, so this asserts the mechanism that
 * makes the question unanswerable-by-construction: the ramp is an
 * absolute layer inside a fixed, clipped frame, and the rows live in a
 * SEPARATE scrolling child. A layer pinned to `inset: 0` of a clipped
 * 100dvh frame cannot grow with its sibling's content — there is no
 * length of list that stretches it.
 */
describe('the shell ramp at 260 rows', () => {
  it('keeps the ramp on a fixed layer while the rows scroll past it', async () => {
    const { default: Shell } = await import('../components/Shell')
    const h = document.createElement('div')
    document.body.appendChild(h)
    const r = createRoot(h)
    await act(async () => {
      r.render(
        <ThemeProvider><AppStoreProvider>
          <Shell><Recipes /></Shell>
        </AppStoreProvider></ThemeProvider>)
    })
    await act(async () => { await authCb(null) })

    /* load every recipe */
    const more = () => [...h.querySelectorAll('button')].find(b => b.textContent.startsWith('LOAD MORE'))
    while (more()) act(() => { more().click() })
    const listed = [...h.querySelectorAll('button')]
      .filter(b => b.style.padding === '11px 0px 11px 12px')
    expect(listed).toHaveLength(recipes.length)

    const frame = h.firstElementChild
    expect(frame.style.position).toBe('fixed')
    expect(frame.style.height).toBe('100dvh')
    expect(frame.style.overflow).toBe('hidden')

    const ramp = frame.children[0]
    expect(ramp.getAttribute('aria-hidden')).toBe('true')
    expect(ramp.style.position).toBe('absolute')
    expect(ramp.style.inset).toBe('0px')
    expect(ramp.style.background).toBe('var(--pq-shell)')
    /* nothing ties the ramp's size to the list */
    expect(ramp.style.height).toBe('')
    expect(ramp.contains(listed[0])).toBe(false)

    /* The scroller is inside the flex row that also holds the rail on
       wide surfaces — one wrapper, both layouts, one ramp behind them. */
    const row = frame.children[1]
    expect(row.style.display).toBe('flex')
    const scroller = [...row.children].find(c => c.style.overflowY === 'auto')
    expect(scroller).toBeTruthy()
    expect(scroller.contains(listed[0])).toBe(true)
    expect(scroller.contains(listed[listed.length - 1])).toBe(true)
    /* the scroller paints nothing, so every card sits on the ramp */
    expect(scroller.style.background).toBe('')

    act(() => { r.unmount() })
    h.remove()
  })
})
