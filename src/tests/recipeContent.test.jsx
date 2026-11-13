import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { recipes, recipeById } from '../data/recipes'
import { cleanIngredients, splitStep, getRecipeDetails } from '../data/recipeDetails'
import { BATCH_IDS, recipeExtras } from '../data/recipeExtras'

/* The cookbook content added on top of the extraction: intro lines,
   cook's notes, ingredient groups, with-sauce macros, serving ideas and
   the storage guide. Each part shows only where the book has it. */

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

let host, root
async function open(recipe) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(<AppStoreProvider><RecipeSheet recipe={recipe} onClose={() => {}} /></AppStoreProvider>)
  })
  await act(async () => { await authCb(null) })
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove(); root = null
  document.body.innerHTML = ''
})
const dialog = () => host.querySelector('[role="dialog"]')

/* ── Cookbook content the extraction did not carry ─────────────────── */

describe('page-break debris', () => {
  it('drops "» Continue" lines and trims a trailing »»', () => {
    expect(cleanIngredients(['a', '» Continue', '50g Soy Sauce »»', 'b']))
      .toEqual(['a', '50g Soy Sauce', 'b'])
  })
  it('leaves no marker in any recipe', () => {
    for (const r of recipes) {
      for (const l of getRecipeDetails(r)?.ingredients || []) expect(l, r.name).not.toMatch(/»/)
    }
  })
})

describe('step titles', () => {
  it('splits a capitals title off the step', () => {
    expect(splitStep('COOK THE CHICKEN: Bake it.'))
      .toEqual({ title: 'Cook the chicken', text: 'Bake it.' })
  })
  it('leaves ordinary steps alone', () => {
    expect(splitStep('Heat a pan: medium.')).toEqual({ title: null, text: 'Heat a pan: medium.' })
  })
})

describe('extras are only for real recipes', () => {
  it('every id in the extras and batch list is in the catalog', () => {
    for (const id of [...Object.keys(recipeExtras).map(Number), ...BATCH_IDS]) {
      expect(recipeById[id], `id ${id}`).toBeTruthy()
    }
  })
})

describe('the recipe sheet shows the book content', () => {
  it('Jalal recipe: intro and cook\'s notes', async () => {
    await open(recipeById[2])
    expect(dialog().querySelector('[data-recipe-intro]').textContent).toContain('perfect balance of sweet')
    expect(dialog().querySelector('[data-cooks-notes]').textContent).toContain('TURN OFF the heat')
    expect(dialog().querySelector('[data-sauce-switch]')).toBeNull()
  })

  it('Meal Prep recipe: four ingredient groups and 5 servings', async () => {
    await open(recipeById[144])
    expect(dialog().querySelectorAll('[data-ingredient-group]')).toHaveLength(4)
    expect(dialog().textContent).toContain('MEAL PREP · 5 SERV')
    expect(dialog().textContent).not.toContain('Continue')
    /* the book has no notes for this one, so no box */
    expect(dialog().querySelector('[data-cooks-notes]')).toBeNull()
  })

  it('batch protein: sauce switch changes the macros', async () => {
    await open(recipeById[374])
    const d = dialog()
    expect(d.textContent).toContain('BATCH PROTEIN · MAKES 8')
    const strip = [...d.querySelectorAll('div')].find(e => e.style.gridTemplateColumns === 'repeat(4,1fr)')
    expect(strip.textContent).toContain('286')
    const withBtn = [...d.querySelectorAll('[data-sauce-switch] button')].find(b => b.textContent === 'WITH SAUCE')
    await act(async () => { withBtn.click() })
    expect(strip.textContent).toContain('339')
    expect(strip.textContent).toContain('42g')
    expect(withBtn.getAttribute('aria-pressed')).toBe('true')
    expect(d.textContent).toContain('Marinate the chicken')
    expect(d.querySelector('[data-serve-with]').textContent).toContain('Sesame soy drizzle')
  })

  it('batch protein: storage link opens the guide', async () => {
    await open(recipeById[374])
    await act(async () => { dialog().querySelector('[data-open-storage]').click() })
    const guide = document.body.querySelector('[data-guide="storage"]')
    expect(guide).toBeTruthy()
    expect(guide.open).toBe(true)
    expect(guide.textContent).toContain('2–3 months')
  })

  it('a recipe with no extras shows none of the new parts', async () => {
    await open(recipeById[1])
    const d = dialog()
    for (const sel of ['[data-recipe-intro]', '[data-cooks-notes]', '[data-serve-with]', '[data-sauce-switch]', '[data-open-storage]']) {
      expect(d.querySelector(sel), sel).toBeNull()
    }
  })
})
