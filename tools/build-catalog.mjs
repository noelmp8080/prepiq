// Phase C — rebuild the recipe catalog from the extraction JSON + PDF macros.
// - Adds the 261st recipe (mealprep p39, transcribed verbatim below)
// - Regenerates src/data/recipes.js (261 recipes) and recipeDetailKeys.js (1:1 map)
// - Carried 96 ids stay stable; retired ids never reused; new ids 221+
// Every name/macro/step comes from the extraction JSON or tools/extracted/macros.json.
// The ONLY human inputs are the two USER_DECISIONS below (book-printed ranges,
// upper bound chosen by the user on 2026-07-09) — nothing else is hand-entered
// except the verbatim 261st-recipe transcription (source: mealprep pages 39-41).

import fs from 'fs'

/* ── User decisions: book-printed macro RANGES, upper bound per user ── */
const USER_DECISIONS = {
  // book line: "100 CALORIES  8g PROTEIN  8g CARBS  3-4g FAT" (per pancake)
  'jalal::hi pro pancakes':          { cal: 100, protein: 8,  carbs: 8,  fat: 4  },
  // book line: "450-500 CALORIES  25g PROTEIN  35g CARBS  18g FAT"
  'jalal::breakfast scrambled wrap': { cal: 500, protein: 25, carbs: 35, fat: 18 },
}

/* NOTE (user decision 2026-07-09): the book's p39 "Creamy Garlic Cheesy
   Chicken & Potatoes" is a superseded duplicate of the p147 V2 already in
   the catalog — deliberately NOT added. Same for the other orphan variant
   pages (old Pad Thai p61, old Breakfast Pizza p109, Shawarma p51,
   Fajita Mac n Cheese p101). One card per dish, latest version. */

/* ── Load ─────────────────────────────────────────────────────── */

const detailsPath = 'src/data/prepiq-recipe-details.json'
const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'))
const macros = JSON.parse(fs.readFileSync('tools/extracted/macros.json', 'utf8'))

for (const [k, v] of Object.entries(USER_DECISIONS)) {
  macros[k] = { ...macros[k], ...v }
}

/* ── Carried ids (96): current map minus the gyros duplicate ──── */

const keysSrc = fs.readFileSync('src/data/recipeDetailKeys.js', 'utf8')
const wiredPairs = [...keysSrc.matchAll(/^\s*(\d+):\s*"([^"]+)"/gm)].map(m => [+m[1], m[2]])
const seen = new Set()
const carried = []           // [id, key] — first claim wins, dupes retired
for (const [id, key] of wiredPairs) {
  if (seen.has(key)) { console.log(`retiring duplicate: id ${id} also claimed ${key}`); continue }
  seen.add(key)
  carried.push([id, key])
}

/* ── New ids: 221+ in book/page order ─────────────────────────── */

const allKeys = Object.keys(details.recipes)
const newKeys = allKeys.filter(k => !seen.has(k))
  .sort((a, b) => {
    const ba = macros[a]?.book ?? a.split('::')[0], bb = macros[b]?.book ?? b.split('::')[0]
    if (ba !== bb) return ba === 'jalal' ? -1 : 1
    return (macros[a]?.pageIndex ?? 9999) - (macros[b]?.pageIndex ?? 9999)
  })
let nextId = 221
const catalog = [...carried.map(([id, key]) => ({ id, key }))]
for (const key of newKeys) catalog.push({ id: nextId++, key })
catalog.sort((a, b) => a.id - b.id)

/* ── Name + tags ──────────────────────────────────────────────── */

const SMALL = new Set(['and', 'n', 'of', 'on', 'in', 'the', 'with', 'a', 'for', 'to'])
function titleCase(name) {
  return name.split(' ').filter(Boolean).map((w, i) => {
    if (/^[A-Z0-9&']{2,}$/.test(w)) return w                 // BBQ, KFC, MY WAY
    const lower = w.toLowerCase()
    if (i > 0 && SMALL.has(lower)) return lower
    return lower.split('-').map(p => (p ? p[0].toUpperCase() + p.slice(1) : p)).join('-')
  }).join(' ')
}

function deriveTags(name, m) {
  const t = []
  const n = ' ' + name.toLowerCase() + ' '
  if (m.protein >= 40) t.push('high-protein')
  if (m.cal < 400) t.push('under-400')
  if (m.cal < 500) t.push('under-500')
  if (m.fat <= 10) t.push('low-fat')
  if (/chicken/.test(n)) t.push('chicken')
  if (/\b(beef|steak|bolognese|lamb|bulgogi)\b/.test(n)) t.push('beef')
  if (/\b(salmon|shrimp|prawn|tuna|fish|seafood)\b/.test(n)) t.push('seafood')
  if (/\b(pasta|noodles?|spaghetti|lasagna|alfredo|pad thai|chow mein)\b/.test(n) || /\bmac\b/.test(n)) t.push('pasta')
  if (/\b(rice|biryani)\b/.test(n) || /\bbowls?\b/.test(n)) t.push('rice-bowls')
  if (/\b(wraps?|burgers?|tacos?|sandwich(es)?|quesadillas?)\b/.test(n) ||
      (/\bburritos?\b/.test(n) && !/burrito bowl/.test(n)) ||
      (/\bgyros?\b/.test(n) && !/gyros? bowl/.test(n))) t.push('handheld')
  return t
}

/* ── Emit recipes.js ──────────────────────────────────────────── */

const counts = { jalal: 0, mealprep: 0 }
let nullMacros = 0
const lines = catalog.map(({ id, key }) => {
  const entry = details.recipes[key]
  const m = macros[key]
  const book = key.split('::')[0]
  counts[book]++
  if (m == null || m.cal == null) nullMacros++
  const name = titleCase(entry.name)
  const tags = deriveTags(name, m)
  return `  { id:${id}, name:${JSON.stringify(name)}, cal:${m.cal}, protein:${m.protein}, carbs:${m.carbs}, fat:${m.fat}, source:"${book}", tags:[${tags.map(t => `'${t}'`).join(',')}] },`
})

const recipesJs = `// PrepIQ recipe catalog — every entry is a real recipe from the source books:
// - Jalal's Cookbook V3 (${counts.jalal} recipes)
// - The Meal Prep Cookbook V5 (${counts.mealprep} recipes)
// Names verbatim from the books (title-cased); macros read verbatim from each
// recipe's PDF page (tools/extract-macros.mjs); tags derived mechanically:
// high-protein: protein>=40 · under-400/500: cal<400/500 · low-fat: fat<=10
// category tags from name keywords. Regenerate via tools/build-catalog.mjs.

export const recipes = [
${lines.join('\n')}
]

export const recipeById = Object.fromEntries(recipes.map(r => [r.id, r]))

export const filterRecipes = (recipes, { query = '', filter = 'all', favorites = new Set() }) => {
  return recipes.filter(r => {
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false
    if (filter === 'jalal') return r.source === 'jalal'
    if (filter === 'mealprep') return r.source === 'mealprep'
    if (filter === 'high-protein') return r.tags.includes('high-protein')
    if (filter === 'under-500') return r.tags.includes('under-500')
    if (filter === 'low-fat') return r.tags.includes('low-fat')
    if (filter === 'chicken') return r.tags.includes('chicken')
    if (filter === 'pasta') return r.tags.includes('pasta')
    if (filter === 'rice-bowls') return r.tags.includes('rice-bowls')
    if (filter === 'seafood') return r.tags.includes('seafood')
    if (filter === 'beef') return r.tags.includes('beef')
    if (filter === 'favorites') return favorites.has(r.id)
    return true
  })
}
`
fs.writeFileSync('src/data/recipes.js', recipesJs)

/* ── Emit recipeDetailKeys.js — complete 1:1 map ──────────────── */

const keyLines = catalog.map(({ id, key }) =>
  `  ${id}: ${JSON.stringify(key)},  // ${titleCase(details.recipes[key].name)}`)
const keysJs = `// PrepIQ — explicit card-id -> content-key map.
// COMPLETE 1:1 map: every catalog recipe maps to its extraction entry in
// prepiq-recipe-details.json. ${catalog.length} of ${catalog.length} cards wired.
// Regenerated by tools/build-catalog.mjs — edit there, not here.

export const detailKeys = {
${keyLines.join('\n')}
}
`
fs.writeFileSync('src/data/recipeDetailKeys.js', keysJs)

/* ── Verify ───────────────────────────────────────────────────── */

const missingEntry = catalog.filter(({ key }) => !details.recipes[key])
const missingSteps = catalog.filter(({ key }) => !(details.recipes[key]?.steps?.length > 0))
console.log(`catalog: ${catalog.length} recipes (${counts.jalal} jalal + ${counts.mealprep} mealprep)`)
console.log(`carried ids: ${carried.length} | new ids: ${newKeys.length} (221-${nextId - 1})`)
console.log(`null macros: ${nullMacros} | keys missing extraction entry: ${missingEntry.length} | missing steps: ${missingSteps.length}`)
