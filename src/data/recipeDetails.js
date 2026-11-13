// PrepIQ recipe-details join.
//
// Cards are wired to content by an EXPLICIT id -> key map (recipeDetailKeys.js),
// NOT by name-normalization. This removes the silent break that happened whenever
// a card's display name drifted from its extracted name. A card with no mapping
// returns null, and the UI shows its graceful placeholder.

import detailsData from './prepiq-recipe-details.json'
import { detailKeys } from './recipeDetailKeys'
import { recipeExtras, BATCH_IDS } from './recipeExtras'

const jsonRecipes = detailsData.recipes
const detailsMap = new Map()

for (const [id, key] of Object.entries(detailKeys)) {
  const entry = jsonRecipes[key]
  if (entry) detailsMap.set(Number(id), entry)
}

if (import.meta.env.DEV) {
  console.log(`[recipeDetails] ${detailsMap.size}/${Object.keys(detailKeys).length} cards wired to real content`)
  const badKeys = Object.entries(detailKeys).filter(([, k]) => !jsonRecipes[k])
  if (badKeys.length) console.warn('[recipeDetails] mapped keys not found in JSON:', badKeys)
}

/* ── Page-break debris ────────────────────────────────────────────────
 * Where a recipe ran onto a second PDF page the extraction kept the
 * book's "»» / » Continue" markers as if they were ingredients. They are
 * navigation, not food: the marker lines are dropped and a trailing »»
 * is trimmed off the ingredient it was stuck to. */
const CONTINUE_LINE = /^\s*»+\s*continue\s*$/i
export function cleanIngredients(lines = []) {
  return lines
    .filter(l => !CONTINUE_LINE.test(String(l)))
    .map(l => String(l).replace(/\s*»+\s*$/, ''))
    .filter(Boolean)
}

/* ── Step titles ─────────────────────────────────────────────────────
 * The batch recipes print a short title in capitals before each step
 * ("MARINATE THE CHICKEN: Trim…"). Split it off so it can be shown as a
 * title rather than shouted at the start of the paragraph. */
const STEP_TITLE = /^([A-Z][A-Z0-9 &'/-]{2,40}):\s+/
export function splitStep(step) {
  if (step && typeof step === 'object') return { title: step.title || null, text: step.text }
  const s = String(step || '')
  const m = s.match(STEP_TITLE)
  if (!m) return { title: null, text: s }
  const t = m[1].trim().toLowerCase()
  return { title: t[0].toUpperCase() + t.slice(1), text: s.slice(m[0].length) }
}

export const isBatch = recipe => BATCH_IDS.has(recipe?.id)

export function getRecipeDetails(recipe) {
  const d = detailsMap.get(recipe.id)
  const x = recipeExtras[recipe.id] || {}
  if (!d && !recipeExtras[recipe.id]) return null
  return {
    ingredients: cleanIngredients(d?.ingredients),
    /* Book-read groups replace a damaged extracted list outright. */
    groups: x.groups || null,
    steps: (x.steps || d?.steps || []).map(splitStep),
    servings: x.servings || d?.servings || null,
    intro: x.intro || null,
    notes: x.notes || null,
    withSauce: x.withSauce || null,
    serveWith: x.serveWith || null,
    batch: BATCH_IDS.has(recipe.id),
  }
}
