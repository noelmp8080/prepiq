// PrepIQ recipe-details join.
//
// Cards are wired to content by an EXPLICIT id -> key map (recipeDetailKeys.js),
// NOT by name-normalization. This removes the silent break that happened whenever
// a card's display name drifted from its extracted name. A card with no mapping
// returns null, and the UI shows its graceful placeholder.

import detailsData from './prepiq-recipe-details.json'
import { detailKeys } from './recipeDetailKeys'

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

export function getRecipeDetails(recipe) {
  const d = detailsMap.get(recipe.id)
  if (!d) return null
  return { ingredients: d.ingredients, steps: d.steps, servings: d.servings }
}
