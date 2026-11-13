import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import content from '../data/recipeContent.json'
import { recipes, recipeById } from '../data/recipes'
import { metaLine } from '../components/RecipeSheet'

/* The one detail surface. Four screens open it, so a fault here is a
   fault in four places, and it is the only screen that renders cookbook
   prose rather than catalog fields. */

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

const { AppStoreProvider } = await import('../store/useAppStore')
const { default: RecipeSheet } = await import('../components/RecipeSheet')

/* Comments here necessarily name the things the rules forbid — the
   block explaining why prepTime is not ported contains "prepTime". */
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const SRC = stripComments(readFileSync('src/components/RecipeSheet.jsx', 'utf8'))

let host, root
async function open(recipe, onClose = () => {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(<AppStoreProvider><RecipeSheet recipe={recipe} onClose={onClose} /></AppStoreProvider>)
  })
  await act(async () => { await authCb(null) })
  return host
}
beforeEach(() => localStorage.clear())
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null })

const dialog = () => host.querySelector('[role="dialog"]')

/* ── The content, measured against the shipped data ───────────────────
 *
 * recipeContent.json is generated from the two cookbooks by
 * tools/extract-recipe-content.py. These hold the facts the sheet relies
 * on, so a re-extraction that breaks one fails here rather than on a
 * phone. */
describe('recipe content from the books', () => {
  const C = Object.entries(content)

  it('has an entry for every card, and nothing else', () => {
    expect(C).toHaveLength(recipes.length)
    for (const r of recipes) expect(content[r.id], `card ${r.id}`).toBeTruthy()
  })

  it('gives every card ingredients and steps', () => {
    for (const [id, c] of C) {
      expect(c.groups.flatMap(g => g.items).length, `card ${id} ingredients`).toBeGreaterThan(0)
      expect(c.steps.length, `card ${id} steps`).toBeGreaterThan(0)
      for (const s of c.steps) expect(s.text, `card ${id}`).toBeTruthy()
    }
  })

  /* The page-turn mark "»» » Continue" was once read as a heading and
     as the tail of a line. Neither may survive. */
  it('carries no page-turn marks or empty strings', () => {
    for (const [id, c] of C) {
      const all = [
        ...c.groups.map(g => g.name || ''), ...c.groups.flatMap(g => g.items),
        ...c.steps.flatMap(s => [s.title || '', s.text]), ...(c.notes || []),
      ]
      for (const t of all) expect(t, `card ${id}`).not.toMatch(/»|^Continue$/)
      for (const t of c.groups.flatMap(g => g.items)) expect(t.trim(), `card ${id}`).not.toBe('')
    }
  })

  /* The 25 recipes whose steps were scrambled, cut short or carried
     another page's text, as found in the 2026-11-12 audit. */
  it('repairs the damaged step sets', () => {
    expect(content[344].steps).toHaveLength(7)               // was 7 shown as 4
    expect(content[324].steps).toHaveLength(7)
    expect(content[310].steps).toHaveLength(6)               // FINAL STEP split out
    expect(content[96].steps[0].text).toMatch(/completely smooth and thick\.$/)
    const beef = content[80].steps.map(s => s.text).join(' ')
    expect(beef).not.toMatch(/STORAGE|Thank You/i)            // storage guide no longer glued on
  })

  it('titles steps only where the book prints a title', () => {
    expect(content[374].steps.map(s => s.title)).toEqual([
      'MARINATE THE CHICKEN', 'COOK THE CHICKEN',
      'REST THE CHICKEN (KEEP WHOLE FOR STORAGE)', 'STORE FOR THE WEEK',
    ])
    expect(content[2].steps.every(s => !s.title)).toBe(true)
  })

  it('takes the with-sauce macros only where the book prints both rows', () => {
    const withSauce = C.filter(([, c]) => c.withSauce)
    expect(withSauce).toHaveLength(8)
    for (const [id, c] of withSauce) {
      expect(c.batch, `card ${id}`).toBe(true)
      expect(c.withSauce).toHaveLength(4)
    }
    expect(content[374].withSauce).toEqual([339, 42, 14, 13])
  })

  it('links only to the three video sites', () => {
    for (const [id, c] of C) {
      for (const [k, u] of Object.entries(c.videos || {})) {
        expect(['youtube', 'tiktok', 'instagram'], `card ${id}`).toContain(k)
        expect(u).toMatch(/^https:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com|instagram\.com)\//)
      }
    }
  })

  it('tags the 17 batch proteins, and the content agrees', () => {
    const tagged = recipes.filter(r => r.tags.includes('batch')).map(r => r.id).sort((a, b) => a - b)
    const batch = C.filter(([, c]) => c.batch).map(([id]) => Number(id)).sort((a, b) => a - b)
    expect(tagged).toHaveLength(17)
    expect(batch).toEqual(tagged)
  })
})

/* ── Nothing is generated ─────────────────────────────────────────────
 *
 * The version this replaced built a description from the recipe's tags.
 * The prototype defaults servings to 4 and computes a prep time from the
 * calorie count. All three read as cookbook data and are not. */
describe('no invented recipe content', () => {
  it('says what the recipe makes only when the book does', () => {
    expect(metaLine({ source: 'jalal' }, {})).toBe("JALAL'S")
    expect(metaLine({ source: 'jalal' }, null)).toBe("JALAL'S")
    expect(metaLine({ source: 'mealprep' }, { makes: '5 SERVINGS' })).toBe('MEAL PREP · 5 SERVINGS')
    expect(metaLine({ source: 'jalal' }, { makes: 'MAKES 3 WRAPS' })).toBe("JALAL'S · MAKES 3 WRAPS")
    expect(metaLine({ source: 'mealprep' }, { batch: true, makes: '8 SERVINGS' }))
      .toBe('MEAL PREP · BATCH PROTEIN · 8 SERVINGS')
    /* Chicken Fajita Rice prints no count, so none is shown. */
    expect(content[3].makes).toBeUndefined()
    expect(metaLine(recipeById[3], content[3])).toBe("JALAL'S")
  })

  it('has no fabricator left in the source', () => {
    expect(SRC).not.toMatch(/generateDescription/)
    expect(SRC).not.toMatch(/prepTime/)
    /* the `servings || 4` default, in any spacing */
    expect(SRC).not.toMatch(/servings\s*\|\|\s*\d/)
  })

  it('renders every line of the recipe exactly as the book holds it', async () => {
    const c = content[1]
    await open(recipeById[1])
    const text = dialog().textContent
    for (const s of c.steps) expect(text).toContain(s.text)
    for (const ing of c.groups.flatMap(g => g.items)) expect(text).toContain(ing)
    expect(text).toContain(c.intro)
  })

  it('shows no notes, serving ideas or sauce switch where the book has none', async () => {
    /* Korean BBQ Beef Bowls: no notes box in the book. */
    expect(content[144].notes).toBeUndefined()
    await open(recipeById[144])
    expect(dialog().querySelector('[data-notes]')).toBe(null)
    expect(dialog().querySelector('[data-serve]')).toBe(null)
    expect(dialog().querySelector('[data-storage-link]')).toBe(null)
    expect(dialog().textContent).not.toContain('WITH SAUCE')
  })
})

describe('the new parts of the sheet', () => {
  it("groups the ingredients under the book's part names, with counts", async () => {
    await open(recipeById[144])
    const groups = [...dialog().querySelectorAll('[data-ingredient-group]')]
    expect(groups).toHaveLength(4)
    expect(groups[0].textContent).toMatch(/^Korean BBQ Beef13/)
    expect(dialog().textContent).toContain('28 ITEMS')
    expect(dialog().querySelector('[data-meta]').textContent).toBe('MEAL PREP · 5 SERVINGS')
  })

  it("shows the cook's notes and the three video links", async () => {
    await open(recipeById[2])
    const notes = dialog().querySelector('[data-notes]')
    expect(notes.textContent).toContain('Make sure you TURN OFF the heat before adding honey and BBQ sauce.')
    const links = [...dialog().querySelectorAll('[data-videos] a')]
    expect(links.map(a => a.textContent)).toEqual(['YouTube', 'TikTok', 'Instagram'])
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
  })

  it("switches a batch protein's macros between without and with sauce", async () => {
    await open(recipeById[374])
    const kcal = () => [...dialog().querySelectorAll('div')]
      .find(d => d.style.gridTemplateColumns === 'repeat(4,1fr)').children[0].textContent
    expect(kcal()).toBe('286KCAL')
    const btn = label => [...dialog().querySelectorAll('button')].find(b => b.textContent === label)
    expect(btn('WITHOUT SAUCE').getAttribute('aria-pressed')).toBe('true')
    act(() => { btn('WITH SAUCE').click() })
    expect(kcal()).toBe('339KCAL')
    expect(btn('WITH SAUCE').getAttribute('aria-pressed')).toBe('true')
    act(() => { btn('WITHOUT SAUCE').click() })
    expect(kcal()).toBe('286KCAL')
  })

  it('shows titled steps, serving ideas and the storage guide on a batch protein', async () => {
    await open(recipeById[374])
    expect([...dialog().querySelectorAll('[data-step-title]')].map(e => e.textContent))
      .toContain('MARINATE THE CHICKEN')
    expect(dialog().querySelector('[data-serve]').textContent).toContain('Sesame soy drizzle')
    act(() => { dialog().querySelector('[data-storage-link]').click() })
    const sheets = document.querySelectorAll('[role="dialog"]')
    expect(sheets).toHaveLength(2)
    const guide = sheets[1]
    expect(guide.getAttribute('aria-label')).toBe('Meal prep guides')
    expect(guide.querySelector('[data-guide="storage"] button').getAttribute('aria-expanded')).toBe('true')
    expect(guide.textContent).toContain('Air Fryer (Best Overall)')

    /* Escape closes the guide and goes back to the recipe. */
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(dialog().getAttribute('aria-label')).toBe('Korean BBQ Chicken')
  })
})

describe('the sheet renders the handoff values', () => {
  it('header: 56px tile at 16px radius, name 17px/700, mono meta', async () => {
    await open(recipeById[1])
    const d = dialog()

    /* The handoff fixes radius PER SIZE — 36/7, 48/9, 56/10 — rather
       than proportionally, so the pair is asserted together. */
    const tile = [...d.querySelectorAll('*')].find(e => e.style.width === '56px')
    expect(tile, 'no 56px thumbnail in the header').toBeTruthy()
    expect(tile.style.height).toBe('56px')
    expect(tile.style.borderRadius).toBe('16px')
    /* Every recipe in this app HAS a photo — measured, all 260 files
       present — so the header shows one. The tile is the failure path,
       covered separately below. */
    expect(tile.tagName).toBe('IMG')
    expect(tile.getAttribute('src')).toBe('/recipes/1.webp')
    expect(tile.style.objectFit).toBe('cover')

    const name = [...d.querySelectorAll('div')]
      .find(e => e.textContent === recipeById[1].name && e.style.fontWeight === '700')
    expect(name, 'no 17px/700 name').toBeTruthy()
    expect(name.style.fontSize).toBe('var(--pq-size-sheet)')
    expect(name.style.letterSpacing).toBe('-0.01em')

    const meta = d.querySelector('[data-meta]')
    expect(meta, 'no mono meta line').toBeTruthy()
    expect(meta.textContent).toBe("JALAL'S · MAKES 3-4 SPICY WRAPS")
    expect(meta.style.fontFamily).toBe('var(--pq-mono)')
  })

  it('macro strip is four equal columns divided by 1px rules', async () => {
    await open(recipeById[1])
    const strip = [...dialog().querySelectorAll('div')]
      .find(d => d.style.gridTemplateColumns === 'repeat(4,1fr)')
    expect(strip).toBeTruthy()
    expect(strip.parentElement.style.borderBottom).toContain('var(--pq-rule-cell)')
    const cells = [...strip.children]
    expect(cells).toHaveLength(4)
    for (const c of cells) expect(c.style.borderRight).toContain('var(--pq-rule-row)')
    expect(strip.textContent).toContain('KCAL')
    expect(strip.textContent).toContain('PROTEIN')
    expect(strip.textContent).toContain('CARBS')
    expect(strip.textContent).toContain('FAT')
  })

  it('numbers the steps in mono, at 1.6 line-height', async () => {
    await open(recipeById[1])
    const ol = dialog().querySelector('ol')
    expect(ol).toBeTruthy()
    expect(ol.children.length).toBeGreaterThan(1)
    expect(ol.textContent).toContain('01')
    const para = ol.querySelector('p')
    expect(para.style.lineHeight).toBe('1.6')
  })

  /* Ingredients are one line each, per the markup — no split into a name
     column and a quantity column. A row must therefore hold the whole
     string including its amount. */
  it('renders each ingredient as one whole line, amount included', async () => {
    await open(recipeById[1])
    const text = dialog().textContent
    expect(text).toContain('600g (21oz) Raw Chicken Breast, cut into strips')
  })
})

/* ── The one the brief flagged ────────────────────────────────────────
 *
 * max-height 88% against a long list. The sheet is a flex column: a
 * fixed header, a scrolling body, a fixed action row. The property that
 * makes that work is `min-height: 0` on the body — without it the body
 * grows to its content, the column overflows, and the action row is
 * pushed below the fold where nothing reveals it. The sheet still looks
 * right at four ingredients, which is why this is a test. */
describe('a 33-ingredient recipe does not push the actions off the sheet', () => {
  const longest = (() => {
    let best = null
    for (const [id, c] of Object.entries(content)) {
      const n = c.groups.reduce((t, g) => t + g.items.length, 0)
      if (!best || n > best.n) best = { id: Number(id), n }
    }
    return best
  })()

  it('found a genuinely long list to test with', () => {
    expect(longest.n).toBe(33)
  })

  it('keeps the panel at 88% and scrolls the body, not the panel', async () => {
    const r = recipeById[longest.id]
    await open(r)
    const panel = dialog()
    expect(panel.style.maxHeight).toBe('88%')
    expect(panel.style.display).toBe('flex')
    expect(panel.style.flexDirection).toBe('column')

    /* The sections sit inside the swipe wrapper (swipe between recipes),
       which must itself pass the height down: flex:1 + min-height:0, or
       the body below would grow instead of scrolling. */
    const wrap = panel.querySelector('[data-recipe-swipe]')
    expect(wrap.parentElement).toBe(panel)
    expect(wrap.style.flex).toMatch(/^1( 1 0%)?$/)
    expect(wrap.style.minHeight).toBe('0px')
    expect(wrap.style.flexDirection).toBe('column')
    const [header, body, actions] = [...wrap.children].filter(c => c.tagName === 'DIV')
    expect(header.style.flexShrink).toBe('0')
    expect(actions.style.flexShrink).toBe('0')
    /* THE LOAD-BEARING PAIR. flex:1 alone is not enough — a flex item's
       min-height defaults to auto, so the body would refuse to shrink
       below its content and take the action row with it. */
    expect(body.style.flex).toMatch(/^1( 1 0%)?$/)
    expect(body.style.minHeight).toBe('0px')
    expect(body.style.overflowY).toBe('auto')
  })

  it('still shows both actions with the longest list loaded', async () => {
    const r = recipeById[longest.id]
    await open(r)
    const labels = [...dialog().querySelectorAll('button')].map(b => b.textContent)
    expect(labels).toContain('I ATE THIS TODAY')
    /* ADD TO PLAN is seven day chips now, on the sheet itself. */
    expect(dialog().querySelectorAll('[data-day-chip]')).toHaveLength(7)
  })
})

describe('touch targets and closing', () => {
  it('gives every button at least 44px', async () => {
    await open(recipeById[1])
    for (const b of dialog().querySelectorAll('button')) {
      const h = b.style.height || b.style.minHeight
      expect(h, `a button at ${h || 'no height'}`).toMatch(/var\(--pq-tap-min\)|^4[4-9]px|^[5-9]\dpx/)
    }
  })

  /* The drawn close tile is 36px per the markup; the target around it is
     44px per the handoff's own floor. Both, not one. */
  it('draws the 36px close tile inside a 44px target', async () => {
    await open(recipeById[1])
    const close = [...dialog().querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'Close')
    expect(close.style.width).toBe('var(--pq-tap-min)')
    expect(close.querySelector('span').style.width).toBe('36px')
  })

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn()
    await open(recipeById[1], onClose)
    const close = [...dialog().querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'Close')
    act(() => { close.click() })
    expect(onClose).toHaveBeenCalled()

    onClose.mockClear()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing at all without a recipe', async () => {
    await open(null)
    expect(host.querySelector('[role="dialog"]')).toBe(null)
  })
})

/* ── The fallback tile ────────────────────────────────────────────────
 *
 * Rare in this app rather than typical, because all 260 photos exist —
 * but `image` is set for every recipe whether or not the file resolves,
 * so a missing file has nothing else to catch it. */
describe('a photo that fails to load falls back to the tile', () => {
  it('swaps to initials at the same box and radius', async () => {
    await open(recipeById[1])
    const img = [...dialog().querySelectorAll('img')][0]
    expect(img.tagName).toBe('IMG')

    act(() => { img.dispatchEvent(new Event('error')) })

    const tile = [...dialog().querySelectorAll('*')].find(e => e.style.width === '56px')
    expect(tile.tagName).not.toBe('IMG')
    expect(tile.style.borderRadius).toBe('16px')      // unchanged: no reflow
    expect(tile.textContent).toBe('SC')               // Spicy Chicken Wraps
  })

  it('maps every size to the radius the handoff fixes for it', async () => {
    const { default: Thumb } = await import('../components/Thumb')
    const { renderToStaticMarkup } = await import('react-dom/server')
    for (const [size, radius, font] of [[36, 12, 11], [48, 14, 13], [56, 16, 15]]) {
      const html = renderToStaticMarkup(<Thumb recipe={{ name: 'Peri Peri Chicken' }} size={size} />)
      expect(html, `${size}px`).toContain(`width:${size}px`)
      expect(html, `${size}px`).toContain(`border-radius:${radius}px`)
      expect(html, `${size}px`).toContain(`font-size:${font}px`)
      expect(html).toContain('PP')
    }
  })

  it('takes initials from the name and never invents one', async () => {
    const { initialsOf } = await import('../components/Thumb')
    expect(initialsOf('Spicy Chicken Wraps')).toBe('SC')
    expect(initialsOf('Pad Thai')).toBe('PT')
    expect(initialsOf('Shawarma')).toBe('S')
    expect(initialsOf('')).toBe('')
    expect(initialsOf(undefined)).toBe('')
  })
})
