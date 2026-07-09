// Phase A audit — carry-over counts + name drift. Read-only.
import fs from 'fs'

const keysSrc = fs.readFileSync('src/data/recipeDetailKeys.js', 'utf8')
const lines = keysSrc.split('\n')
const wired = []
for (const l of lines) {
  const m = l.match(/^\s*(\d+):\s*"([^"]+)"/)
  if (m) wired.push({ id: +m[1], key: m[2], approx: /\[approx\]/.test(l) })
}

const details = JSON.parse(fs.readFileSync('src/data/prepiq-recipe-details.json', 'utf8'))
const allKeys = Object.keys(details.recipes)

console.log('wired ids:', wired.length)
const usedKeys = wired.map(w => w.key)
const dupes = usedKeys.filter((k, i) => usedKeys.indexOf(k) !== i)
console.log('duplicate key usage:', dupes.length, dupes)
const badKeys = usedKeys.filter(k => !allKeys.includes(k))
console.log('wired keys missing from JSON:', badKeys.length, badKeys)
console.log('approx-tagged wires:', wired.filter(w => w.approx).length)
const unused = allKeys.filter(k => !usedKeys.includes(k))
console.log('extraction total:', allKeys.length, '| carried by wired cards:', new Set(usedKeys).size, '| NEW:', unused.length)

const src = fs.readFileSync('src/data/recipes.js', 'utf8')
const app = new Map()
for (const m of src.matchAll(/id:\s*(\d+),\s*name:\s*"([^"]*)"/g)) app.set(+m[1], m[2])

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const drift = wired.filter(w => details.recipes[w.key] && norm(app.get(w.id) || '') !== norm(details.recipes[w.key].name))
console.log('wired cards whose display name differs from book name:', drift.length)
for (const w of drift) console.log('  id', w.id, ':', JSON.stringify(app.get(w.id)), '-> book:', JSON.stringify(details.recipes[w.key].name))

// source-field accuracy among wired cards
const srcWrong = wired.filter(w => {
  const claimed = src.match(new RegExp('id:\\s*' + w.id + ',[^}]*source:"(\\w+)"'))?.[1]
  return claimed && claimed !== w.key.split('::')[0]
})
console.log('wired cards whose source field mismatches their book:', srcWrong.length)

// how the app uses recipe ids (grep summary done separately)
