// Phase B — extract per-recipe macros VERBATIM from the cookbook PDFs' text.
// Reads tools/extracted/{jalal,mealprep}.txt (pdftotext -layout output).
// Output: tools/extracted/macros.json  { key: {cal,protein,carbs,fat,book,pageIndex} }
// Rules: numbers are read from the page text only — never computed or guessed.
// Unmatched/garbled recipes get null macros and are listed in the report.

import fs from 'fs'

const details = JSON.parse(fs.readFileSync('src/data/prepiq-recipe-details.json', 'utf8'))
const keys = Object.keys(details.recipes)

const normalize = s => s.toLowerCase()
  .replace(/’/g, "'")
  .replace(/\(.*?\)/g, ' ')
  .replace(/&/g, ' and ')
  .replace(/\bn\b/g, ' and ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const stripPlural = t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)
const tokSet = s => new Set(normalize(s).split(' ').filter(Boolean).map(stripPlural))
const setsEqual = (a, b) => a.size === b.size && [...a].every(t => b.has(t))

/* ── Parse candidate (title, macros) per page, per book ───────── */

// A macro value is a number, a decimal, or a verbatim range like "3-4".
// Ranges are NOT averaged/resolved here — they surface as flags for review.
const NUM = String.raw`(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)`
const toVal = s => {
  const t = s.replace(/\s+/g, '')
  return /-/.test(t) ? { range: t } : +t
}
const isRange = v => typeof v === 'object' && v !== null

function parseJalalPage(text, idx) {
  // macros line: "347 CALORIES  38g PROTEIN   24g CARBS  11.5g FAT" (decimals/ranges occur)
  const m = text.match(new RegExp(`${NUM}\\s*CALORIES\\s+${NUM}\\s*g\\s*PROTEIN\\s+${NUM}\\s*g\\s*CARBS\\s+${NUM}\\s*g\\s*FAT`, 'i'))
  if (!m) return null
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!firstLine) return null
  return { title: firstLine, cal: toVal(m[1]), protein: toVal(m[2]), carbs: toVal(m[3]), fat: toVal(m[4]), pageIndex: idx }
}

function parseMealprepPage(text, idx) {
  if (!/Recipe\s*#\s*\d+/i.test(text) || !/CALORIES/i.test(text)) return null
  // values line: "597   59g   52g   16g" (cal has no g)
  const m = text.match(new RegExp(`${NUM}\\s+${NUM}\\s*g\\s+${NUM}\\s*g\\s+${NUM}\\s*g`))
  if (!m) return null
  // title = non-empty lines between the "Recipe #" line and "Nutritional Facts"
  const lines = text.split('\n')
  const start = lines.findIndex(l => /Recipe\s*#\s*\d+/i.test(l))
  const end = lines.findIndex(l => /Nutritional\s+Facts/i.test(l))
  if (start < 0 || end < 0 || end <= start) return null
  const title = lines.slice(start + 1, end)
    .map(l => l.trim())
    .filter(l => l && !/THE MEAL PREP COOK ?BOOK/i.test(l))
    .join(' ')
  if (!title) return null
  return { title, cal: toVal(m[1]), protein: toVal(m[2]), carbs: toVal(m[3]), fat: toVal(m[4]), pageIndex: idx }
}

const books = {
  jalal:    { pages: fs.readFileSync('tools/extracted/jalal.txt', 'utf8').split('\f'),    parse: parseJalalPage },
  mealprep: { pages: fs.readFileSync('tools/extracted/mealprep.txt', 'utf8').split('\f'), parse: parseMealprepPage },
}

const parsed = { jalal: [], mealprep: [] }
for (const [book, { pages, parse }] of Object.entries(books)) {
  pages.forEach((p, i) => {
    const r = parse(p, i)
    if (r) parsed[book].push(r)
  })
  console.log(`${book}: pages with parseable title+macros: ${parsed[book].length}`)
}

/* ── Match extraction keys to parsed pages ────────────────────── */

const out = {}
const flagged = []
const usedPages = { jalal: new Set(), mealprep: new Set() }

for (const key of keys) {
  const book = key.split('::')[0]
  const name = details.recipes[key].name
  const nNorm = normalize(name)
  const nSet = tokSet(name)

  let cands = parsed[book].filter(p => normalize(p.title) === nNorm)
  if (cands.length === 0) cands = parsed[book].filter(p => setsEqual(tokSet(p.title), nSet))

  if (cands.length > 1) {
    const macroSig = c => JSON.stringify([c.cal, c.protein, c.carbs, c.fat])
    const allSame = cands.every(c => macroSig(c) === macroSig(cands[0]))
    if (allSame) {
      cands = [cands[0]]
    } else {
      // Disambiguate duplicate titles by ingredient overlap: pick the page whose
      // (verbatim) text contains the most of this extraction entry's ingredients.
      // jalal prints ingredients on the recipe page; mealprep on the NEXT page.
      const ingTokens = new Set(
        (details.recipes[key].ingredients || []).flatMap(i => normalize(i).split(' '))
          .filter(t => t.length > 3)
      )
      const scoreOf = c => {
        const pageText = book === 'jalal'
          ? books[book].pages[c.pageIndex]
          : (books[book].pages[c.pageIndex + 1] || '')
        const pt = new Set(normalize(pageText).split(' '))
        let hit = 0
        for (const t of ingTokens) if (pt.has(t)) hit++
        return hit / Math.max(1, ingTokens.size)
      }
      const scored = cands.map(c => ({ c, s: scoreOf(c) })).sort((a, b) => b.s - a.s)
      if (scored[0].s - scored[1].s >= 0.15) {
        cands = [scored[0].c]
      } else {
        out[key] = { cal: null, protein: null, carbs: null, fat: null, book, pageIndex: null }
        flagged.push({ key, reason: 'duplicate titles, ingredient overlap inconclusive',
                       pages: scored.map(x => `${x.c.pageIndex}(${x.s.toFixed(2)})`) })
        continue
      }
    }
  }

  if (cands.length === 1) {
    const c = cands[0]
    const ranges = ['cal', 'protein', 'carbs', 'fat'].filter(f => isRange(c[f]))
    if (ranges.length) {
      out[key] = { cal: null, protein: null, carbs: null, fat: null, book, pageIndex: c.pageIndex }
      flagged.push({ key, reason: 'macro printed as a RANGE in the book: ' +
                     ranges.map(f => `${f}="${c[f].range}"`).join(', ') + ' — needs your call' })
    } else {
      out[key] = { cal: c.cal, protein: c.protein, carbs: c.carbs, fat: c.fat, book, pageIndex: c.pageIndex }
    }
    usedPages[book].add(c.pageIndex)
  } else {
    out[key] = { cal: null, protein: null, carbs: null, fat: null, book, pageIndex: null }
    flagged.push({ key, reason: 'no page with matching title' })
  }
}

fs.writeFileSync('tools/extracted/macros.json', JSON.stringify(out, null, 1))

const clean = keys.filter(k => out[k].cal != null)
console.log(`\ncaptured cleanly: ${clean.length}/${keys.length}`)
console.log(`flagged null: ${flagged.length}`)
for (const f of flagged) console.log('  FLAG:', f.key, '—', f.reason, f.pages ?? '')

// parsed pages never claimed by any key (potential extra recipes / mismatches)
for (const book of ['jalal', 'mealprep']) {
  const orphans = parsed[book].filter(p => !usedPages[book].has(p.pageIndex))
  console.log(`${book}: parsed pages not matched to any extraction key: ${orphans.length}`)
  orphans.slice(0, 10).forEach(o => console.log(`   page ${o.pageIndex}: "${o.title}"`))
}

/* ── Diff: 96 carried cards' current macros vs PDF macros ─────── */

const keysSrc = fs.readFileSync('src/data/recipeDetailKeys.js', 'utf8')
const wired = [...keysSrc.matchAll(/^\s*(\d+):\s*"([^"]+)"/gm)].map(m => ({ id: +m[1], key: m[2] }))
const src = fs.readFileSync('src/data/recipes.js', 'utf8')
const app = new Map()
for (const m of src.matchAll(/id:\s*(\d+),\s*name:\s*"([^"]*)",\s*cal:\s*(\d+),\s*protein:\s*(\d+),\s*carbs:\s*(\d+),\s*fat:\s*(\d+)/g)) {
  app.set(+m[1], { name: m[2], cal: +m[3], protein: +m[4], carbs: +m[5], fat: +m[6] })
}

console.log('\n── carried-card macro diff (app vs PDF) ──')
let match = 0, mismatch = 0, unknown = 0
for (const w of wired) {
  const a = app.get(w.id), p = out[w.key]
  if (!a || !p || p.cal == null) { unknown++; continue }
  if (a.cal === p.cal && a.protein === p.protein && a.carbs === p.carbs && a.fat === p.fat) { match++; continue }
  mismatch++
  console.log(`  id ${w.id} "${a.name}": app ${a.cal}/${a.protein}P/${a.carbs}C/${a.fat}F  →  PDF ${p.cal}/${p.protein}P/${p.carbs}C/${p.fat}F`)
}
console.log(`carried cards — macros agree: ${match}, MISMATCH: ${mismatch}, PDF macros unknown: ${unknown}`)
