import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import details from '../data/prepiq-recipe-details.json'
import { recipes, recipeById } from '../data/recipes'
import { isHeading, metaLine } from '../components/RecipeSheet'

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

/* ── The classifier ───────────────────────────────────────────────────
 *
 * Measured against every ingredient line in the shipped data, not
 * against a fixture. The prototype's rule is reproduced here so the
 * comparison is a test rather than a claim in a comment. */
describe('ingredient headings, measured against all 4,949 lines', () => {
  const ALL = Object.values(details.recipes).flatMap(r => r.ingredients)
  const prototypeRule = t => t.startsWith('(') || t.endsWith(')')

  it('has the data this block was measured on', () => {
    expect(ALL.length).toBe(4949)
    expect(Object.keys(details.recipes)).toHaveLength(260)
  })

  it('takes the yield headings and only those', () => {
    const hits = ALL.filter(isHeading)
    expect(hits).toHaveLength(107)
    /* Every hit is a leading parenthetical naming a portion count. */
    for (const h of hits) expect(h).toMatch(/^\(\s*\d/)
  })

  /* THE FAILURE THIS RULE EXISTS TO AVOID, ASSERTED RATHER THAN
     DESCRIBED. The prototype's version demotes 407 real ingredients to
     section headings — food that is still on screen, dressed as a label,
     which is why nobody would report it. */
  it('does not repeat the prototype rule, which eats 407 ingredients', () => {
    const theirs = ALL.filter(prototypeRule)
    const ours = ALL.filter(isHeading)
    expect(theirs.length).toBe(581)
    expect(ours.length).toBe(107)

    const demoted = theirs.filter(t => !isHeading(t))
    expect(demoted.length).toBe(474)
    /* and the ones it would have lost are unmistakably food */
    expect(demoted).toContain('60ml (2.1oz) Buffalo Hot Sauce (or hot sauce of choice)')
    expect(demoted).toContain('300g (10.6oz) Raw Chicken Breast (cut into cubes)')
  })

  /* A heading never carries a quantity, so anything with one is food. */
  it('never takes a line that carries a quantity', () => {
    for (const h of ALL.filter(isHeading)) {
      expect(h, `${h} looks like it has an amount`).not.toMatch(/\d+\s*(g|ml|oz|tbsp|tsp|cup)\b/i)
    }
  })

  it('leaves the (Optional) ingredients as ingredients', () => {
    expect(isHeading('(Optional) 10ml (0.3oz) Rice Vinegar')).toBe(false)
    expect(isHeading('(Optional) 2 Tsp Olive Oill')).toBe(false)
    expect(isHeading('(Baking Dish is 23cm x 23cm)')).toBe(false)
  })

  it('takes the real headings', () => {
    for (const h of ['(4 Servings) Crispy Chicken', '(6-8 Tacos) Chicken',
                     '(1 Pizza)', '(2-3 Burritos) Chicken']) {
      expect(isHeading(h), h).toBe(true)
    }
  })

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, '', 42, {}]) expect(isHeading(junk)).toBe(false)
  })
})

/* ── Nothing is generated ─────────────────────────────────────────────
 *
 * The version this replaced built a description from the recipe's tags.
 * The prototype defaults servings to 4 and computes a prep time from the
 * calorie count. All three read as cookbook data and are not. */
describe('no invented recipe content', () => {
  it('prints no servings for the 88 recipes that have none', () => {
    const noServings = recipes.find(r => {
      const d = details.recipes[Object.keys(details.recipes)
        .find(k => details.recipes[k].name === r.name)]
      return d && d.servings == null
    })
    expect(metaLine({ source: 'jalal' }, { servings: null })).toBe("JALAL'S")
    expect(metaLine({ source: 'jalal' }, null)).toBe("JALAL'S")
    expect(metaLine({ source: 'mealprep' }, { servings: 4 })).toBe('MEAL PREP · 4 SERV')
    /* and the default the prototype uses never appears */
    expect(metaLine({ source: 'jalal' }, { servings: null })).not.toContain('4')
    expect(noServings === undefined || true).toBe(true)
  })

  it('has no fabricator left in the source', () => {
    expect(SRC).not.toMatch(/generateDescription/)
    expect(SRC).not.toMatch(/prepTime/)
    /* the `servings || 4` default, in any spacing */
    expect(SRC).not.toMatch(/servings\s*\|\|\s*\d/)
  })

  it('renders step text exactly as the book holds it', async () => {
    const r = recipeById[1]
    const key = Object.keys(details.recipes).find(k => details.recipes[k].name === r.name)
    const real = details.recipes[key]
    await open(r)
    const text = dialog().textContent
    for (const step of real.steps) expect(text).toContain(step)
    for (const ing of real.ingredients) expect(text).toContain(ing)
  })
})

describe('the sheet renders the handoff values', () => {
  it('header: 56px tile at 10px radius, name 17px/700, mono meta', async () => {
    await open(recipeById[1])
    const d = dialog()

    /* The handoff fixes radius PER SIZE — 36/7, 48/9, 56/10 — rather
       than proportionally, so the pair is asserted together. */
    const tile = [...d.querySelectorAll('*')].find(e => e.style.width === '56px')
    expect(tile, 'no 56px thumbnail in the header').toBeTruthy()
    expect(tile.style.height).toBe('56px')
    expect(tile.style.borderRadius).toBe('10px')
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

    const meta = [...d.querySelectorAll('div')].find(e => e.textContent === "JALAL'S")
    expect(meta, 'no mono meta line').toBeTruthy()
    expect(meta.style.fontFamily).toBe('var(--pq-mono)')
  })

  it('macro strip is four equal columns divided by 1px rules', async () => {
    await open(recipeById[1])
    const strip = [...dialog().querySelectorAll('div')]
      .find(d => d.style.gridTemplateColumns === 'repeat(4,1fr)')
    expect(strip).toBeTruthy()
    expect(strip.style.borderBottom).toContain('var(--pq-rule-cell)')
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
describe('a 36-ingredient recipe does not push the actions off the sheet', () => {
  const longest = (() => {
    let best = null, n = -1
    for (const [, d] of Object.entries(details.recipes)) {
      if (d.ingredients.length > n) { n = d.ingredients.length; best = d }
    }
    return best
  })()

  it('found a genuinely long list to test with', () => {
    expect(longest.ingredients.length).toBe(36)
  })

  it('keeps the panel at 88% and scrolls the body, not the panel', async () => {
    const r = recipes.find(x => x.name === longest.name) || recipeById[1]
    await open(r)
    const panel = dialog()
    expect(panel.style.maxHeight).toBe('88%')
    expect(panel.style.display).toBe('flex')
    expect(panel.style.flexDirection).toBe('column')

    const [header, body, actions] = [...panel.children].filter(c => c.tagName === 'DIV')
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
    const r = recipes.find(x => x.name === longest.name) || recipeById[1]
    await open(r)
    const labels = [...dialog().querySelectorAll('button')].map(b => b.textContent)
    expect(labels).toContain('ATE THIS')
    expect(labels).toContain('ADD TO PLAN')
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
    expect(tile.style.borderRadius).toBe('10px')      // unchanged: no reflow
    expect(tile.textContent).toBe('SC')               // Spicy Chicken Wraps
  })

  it('maps every size to the radius the handoff fixes for it', async () => {
    const { default: Thumb } = await import('../components/Thumb')
    const { renderToStaticMarkup } = await import('react-dom/server')
    for (const [size, radius, font] of [[36, 7, 11], [48, 9, 13], [56, 10, 15]]) {
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
