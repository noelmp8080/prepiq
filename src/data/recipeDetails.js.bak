import detailsData from './prepiq-recipe-details.json'
import { recipes } from './recipes'

// Normalize function exactly as specified in _meta.normalize_js
// Using RegExp constructor so unicode escapes survive the source encoding
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g')

const normalize = s =>
  s.normalize('NFKD')
   .replace(COMBINING, '')
   .toLowerCase()
   .replace(/\bv\d+\b/g, '')
   .replace(/\b(and|&)\b/g, ' ')
   .replace(/[^a-z0-9 ]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim()

const jsonRecipes = detailsData.recipes
const detailsMap = new Map()

for (const recipe of recipes) {
  const key = `${recipe.source}::${normalize(recipe.name)}`
  if (jsonRecipes[key]) {
    detailsMap.set(recipe.id, jsonRecipes[key])
    continue
  }
  // Fallback: try the other source
  const altSource = recipe.source === 'jalal' ? 'mealprep' : 'jalal'
  const altKey = `${altSource}::${normalize(recipe.name)}`
  if (jsonRecipes[altKey]) {
    detailsMap.set(recipe.id, jsonRecipes[altKey])
  }
}

if (import.meta.env.DEV) {
  const matched = detailsMap.size
  const unmatched = recipes.filter(r => !detailsMap.has(r.id)).map(r => r.name)
  console.log(`[recipeDetails] ${matched}/${recipes.length} matched`)
  if (unmatched.length) console.log('[recipeDetails] unmatched:', unmatched)
}

export function getRecipeDetails(recipe) {
  const d = detailsMap.get(recipe.id)
  if (!d) return null
  return { ingredients: d.ingredients, steps: d.steps, servings: d.servings }
}
