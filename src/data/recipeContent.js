// What the recipe sheet shows beyond a card's name and macros, keyed by
// card id. Generated from the two cookbooks by
// tools/extract-recipe-content.py — regenerate there, do not edit the JSON.
//
// Every string is printed in the books. A field the book does not print
// for a recipe is absent, and the sheet shows nothing in its place.

import content from './recipeContent.json'

export function getRecipeContent(recipe) {
  return (recipe && content[recipe.id]) || null
}

/* Every card has an entry, so a missing one is a card added without
   re-running the extractor. A test holds this. */
export const contentIds = Object.keys(content).map(Number)
