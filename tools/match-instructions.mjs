// PrepIQ — instructions matching pass (Phase 3, instructions track)
// Matches unwired recipes.js entries against unused prepiq-recipe-details.json
// extraction keys. AUTO-WIRES only same-source, exact-normalized, unique
// matches. Everything else goes to match-review.md for human decision.
// Usage: node tools/match-instructions.mjs [--apply]
//   (no flag = dry run, prints what it would do; --apply edits recipeDetailKeys.js)

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const APPLY = process.argv.includes('--apply')

/* ── Load sources ─────────────────────────────────────────────── */

const recipesSrc = fs.readFileSync(path.join(ROOT, 'src/data/recipes.js'), 'utf8')
const keysPath   = path.join(ROOT, 'src/data/recipeDetailKeys.js')
const keysSrc    = fs.readFileSync(keysPath, 'utf8')
const details    = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/prepiq-recipe-details.json'), 'utf8'))
const juneAmbig  = JSON.parse(fs.readFileSync(path.join(ROOT, 'ambiguous-matches.json'), 'utf8'))
const juneNoJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'no-json-entry.json'), 'utf8'))

const appRecipes = [...recipesSrc.matchAll(/id:\s*(\d+),\s*name:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?source:\s*"(\w+)"/g)]
  .map(m => ({ id: +m[1], name: m[2], source: m[3] }))

const wired = new Map([...keysSrc.matchAll(/^\s*(\d+):\s*"([^"]+)"/gm)].map(m => [+m[1], m[2]]))
const usedKeys = new Set(wired.values())

const allKeys = Object.keys(details.recipes)
const unusedKeys = allKeys.filter(k => !usedKeys.has(k))
const unwired = appRecipes.filter(r => !wired.has(r.id))

/* ── Normalization ────────────────────────────────────────────── */

function normalize(s) {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // parentheticals
    .replace(/&/g, ' and ')
    .replace(/\bn\b/g, ' and ')        // "sweet n sour"
    .replace(/[^a-z0-9 ]+/g, ' ')      // punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

const stripPlural = t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)
const tokenSet = s => new Set(normalize(s).split(' ').filter(Boolean).map(stripPlural))

function dice(aSet, bSet) {
  let inter = 0
  for (const t of aSet) if (bSet.has(t)) inter++
  return (2 * inter) / (aSet.size + bSet.size)
}

const keyName = k => k.split('::').slice(1).join('::')  // key sans book prefix
const keyBook = k => k.split('::')[0]

/* ── Tier-1 auto matches ──────────────────────────────────────── */

const autoWired = []   // { id, name, source, key }
const needsReview = [] // { id, name, source, candidates: [{key, score, sameSource, usedBy}] , juneFlag }

const setsEqual = (a, b) => a.size === b.size && [...a].every(t => b.has(t))

for (const r of unwired) {
  const rNorm = normalize(r.name)
  const rSet  = tokenSet(r.name)

  // exact or token-set-equal, same source, among UNUSED keys only
  const exact = unusedKeys.filter(k =>
    keyBook(k) === r.source &&
    (normalize(keyName(k)) === rNorm || setsEqual(tokenSet(keyName(k)), rSet))
  )

  if (exact.length === 1) {
    autoWired.push({ ...r, key: exact[0] })
    continue
  }

  // otherwise: rank ALL keys (any source, used or not) for the review file
  const scored = allKeys.map(k => ({
    key: k,
    score: dice(rSet, tokenSet(keyName(k))),
    sameSource: keyBook(k) === r.source,
    usedBy: usedKeys.has(k) ? [...wired.entries()].find(([, v]) => v === k)?.[0] : null,
  }))
    .sort((a, b) => (b.score + (b.sameSource ? 0.05 : 0)) - (a.score + (a.sameSource ? 0.05 : 0)))
    .slice(0, 3)

  needsReview.push({
    ...r,
    candidates: scored,
    juneAmbiguous: juneAmbig.some(a => a.id === r.id),
    juneNoJson: juneNoJson.some(a => a.id === r.id),
  })
}

// Guard: no two auto-wires may claim the same key
const claimCount = {}
for (const a of autoWired) claimCount[a.key] = (claimCount[a.key] || 0) + 1
const conflicted = autoWired.filter(a => claimCount[a.key] > 1)
const cleanAuto  = autoWired.filter(a => claimCount[a.key] === 1)
for (const c of conflicted) {
  needsReview.push({ ...c, candidates: [{ key: c.key, score: 1, sameSource: true, usedBy: null }], conflict: true })
}

/* ── Report ───────────────────────────────────────────────────── */

console.log(`unwired app recipes: ${unwired.length}`)
console.log(`unused extraction keys: ${unusedKeys.length}`)
console.log(`AUTO-WIRE (exact, same-source, unique): ${cleanAuto.length}`)
console.log(`NEEDS REVIEW: ${needsReview.length}`)
if (conflicted.length) console.log(`  (of which ${conflicted.length} demoted due to key conflicts)`)

/* ── Write review markdown ────────────────────────────────────── */

const fmtCand = c => {
  const pct = Math.round(c.score * 100)
  const src = c.sameSource ? '' : ' ⚠cross-book'
  const used = c.usedBy ? ` ⛔already used by id ${c.usedBy}` : ''
  return `\`${c.key}\` (${pct}%${src}${used})`
}

const rows = needsReview
  .sort((a, b) => a.id - b.id)
  .map(r => {
    const best = r.candidates[0]
    const bestCell = best && best.score >= 0.5 && !best.usedBy ? `\`${best.key}\`` : '— (no good match)'
    return `| ${r.id} | ${r.name} | ${r.source} | ${r.candidates.map(fmtCand).join('<br>')} | ${bestCell} |`
  })

const hadCands = needsReview.filter(r => !r.juneNoJson)
const noCands  = needsReview.filter(r => r.juneNoJson)

const md = `# PrepIQ — instruction match review
Generated ${new Date().toISOString().slice(0, 10)}.
Decide each row: keep my best guess, replace it with another candidate key,
or write \`none\` if the recipe truly isn't in either book's extraction.
Edit the **Your decision** column (pre-filled with my best guess where confident).

Auto-wired this run (not in this file): ${cleanAuto.length} recipes — exact same-source title matches.

## Section A — ambiguous matches (${hadCands.length})
| id | App recipe | Src | Candidates (score) | Your decision |
|---|---|---|---|---|
${rows.filter((_, i) => !needsReview.sort((a, b) => a.id - b.id)[i].juneNoJson).join('\n')}

## Section B — June "no candidate" ids, closest 3 anyway (${noCands.length})
| id | App recipe | Src | Candidates (score) | Your decision |
|---|---|---|---|---|
${rows.filter((_, i) => needsReview.sort((a, b) => a.id - b.id)[i].juneNoJson).join('\n')}
`

fs.writeFileSync(path.join(ROOT, 'match-review.md'), md)
console.log('wrote match-review.md')

/* ── Apply auto-wires ─────────────────────────────────────────── */

if (APPLY && cleanAuto.length) {
  const lines = keysSrc.split('\n')
  const newEntries = cleanAuto.map(a => ({ id: a.id, line: `  ${a.id}: ${JSON.stringify(a.key)},  // ${a.name}` }))

  // insert each new line before the first existing mapping line with a larger id
  for (const ne of newEntries.sort((a, b) => b.id - a.id)) {
    let insertAt = -1
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(\d+):\s*"/)
      if (m && +m[1] > ne.id) { insertAt = i; break }
      if (lines[i].trim() === '}') { insertAt = i; break }
    }
    lines.splice(insertAt, 0, ne.line)
  }

  let out = lines.join('\n')
  const total = wired.size + cleanAuto.length
  out = out.replace(/\/\/ \d+ of 220 cards wired\./, `// ${total} of 220 cards wired.`)
  fs.writeFileSync(keysPath, out)
  console.log(`APPLIED: ${cleanAuto.length} new mappings -> recipeDetailKeys.js (total ${total}/220)`)
} else if (cleanAuto.length) {
  console.log('(dry run — re-run with --apply to write recipeDetailKeys.js)')
  cleanAuto.slice(0, 10).forEach(a => console.log(`  would wire ${a.id} -> ${a.key}`))
}
