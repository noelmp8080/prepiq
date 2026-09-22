/* ── HOW MUCH, SHORT ENOUGH FOR A ROW ─────────────────────────────────
 *
 * The catalog stores whole ingredient LINES, not normalised amounts —
 * "500g (17.6oz) Chicken Breast, cubed" — which is why the row has
 * never carried a quantity (DEVIATIONS §8, §19). This parses a short
 * amount out of the front of one, so the row can say `1.1 lb` without
 * the user opening the expander.
 *
 * IT NEVER GUESSES. A line that does not parse cleanly returns null and
 * the row shows nothing — not a dash, not a zero, not the first few
 * characters of a sentence. The expander still carries the full line,
 * unchanged, so nothing is lost by declining.
 *
 * IMPERIAL WINS WHEN THE LINE OFFERS IT. 711 of the 1,009 quantity
 * lines carry a parenthesised imperial value, which is there precisely
 * because it is the readable one for this user. `500g (17.6oz)` reads
 * as `1.1 lb`, not as `500 g`.
 *
 * PARSING AND FORMATTING ARE SEPARATE, and that is load-bearing for
 * summing. `parseAmount` returns the value in the unit the line used;
 * `formatAmount` decides that 17.6 oz should be shown as 1.1 lb. Doing
 * the conversion at parse time would leave two lines of the same
 * ingredient in different units — one oz, one lb — and the sum rule
 * would refuse to add them.
 */

/* Unicode fractions that appear in recipe text. Written out rather than
   computed, because ⅓ is not 0.33 and rounding it here would be a
   guess in a module that promises not to. */
const VULGAR = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

/* A WHITELIST, not "whatever word comes next". `3 whole Eggs` would
   otherwise read as `3 whole` and `2 Large Onions` as `2 Large` — the
   next token is usually an adjective, not a measure. Anything not here
   yields a bare number, which is what "3" means on a row. */
const UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs',
  'tbsp', 'tsp', 'tbs', 'cup', 'cups',
  'scoop', 'scoops', 'clove', 'cloves', 'can', 'cans', 'tin', 'tins',
  'slice', 'slices', 'sheet', 'sheets', 'stick', 'sticks',
  'handful', 'handfuls', 'pinch', 'pinches', 'sprig', 'sprigs',
  'packet', 'packets', 'sachet', 'sachets', 'bunch', 'bunches',
])

/* Plural and spelling variants collapse so two lines of the same
   ingredient can actually be added together. */
const CANONICAL = {
  lbs: 'lb', cups: 'cup', scoops: 'scoop', cloves: 'clove', cans: 'can',
  tins: 'tin', slices: 'slice', sheets: 'sheet', sticks: 'stick',
  handfuls: 'handful', pinches: 'pinch', sprigs: 'sprig',
  packets: 'packet', sachets: 'sachet', bunches: 'bunch', tbs: 'tbsp',
}
const canon = u => (u ? CANONICAL[u] || u : null)

/** "1 1/2" -> 1.5, "3/4" -> 0.75, "½" -> 0.5, "2.5" -> 2.5, else null. */
function readNumber(text) {
  const s = String(text).trim()

  // mixed number with a vulgar fraction: "1½"
  let m = /^(\d+)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/.exec(s)
  if (m) return Number(m[1]) + VULGAR[m[2]]

  // a vulgar fraction alone
  if (VULGAR[s] !== undefined) return VULGAR[s]

  // mixed number with a written fraction: "1 1/2"
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s)
  if (m) return Number(m[2]) === 0 || Number(m[3]) === 0
    ? null : Number(m[1]) + Number(m[2]) / Number(m[3])

  // a written fraction alone: "3/4"
  m = /^(\d+)\/(\d+)$/.exec(s)
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2])

  // a plain number
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)

  return null
}

/* The leading quantity of a line, in whatever unit it is written in.
   Matches a mixed number, a fraction, or a decimal, optionally a RANGE
   ("15-20g"), optionally followed by a unit with or without a space:
   "500g", "2 tbsp", "1 1/2 cups", "80-100g". */
const LEADING = /^\s*(\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\/\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:\.\d+)?)(\s*-\s*\d+(?:\.\d+)?)?\s*([A-Za-z]+)?/

/* An imperial value in brackets: "(17.6oz)", "(3.3lbs)", and the first
   of "(53oz / 3.3lbs)". Only oz and lb — the bracket exists to give an
   imperial reading, and a bracketed gram would be the metric twice.
   Anchored, because it is only trusted where it ADJOINS the leading
   amount: "40ml (1.4oz) Water" halfway down a line about cornflour is
   the water's weight, not the cornflour's. */
const PAREN_IMPERIAL_HERE = /^\s*\(\s*(\d+(?:\.\d+)?)\s*(oz|lbs?)\b/i

/**
 * The amount at the front of one quantity line.
 *
 * @param   {string} line
 * @returns {{ value: number, unit: string|null }|null}
 *
 * `unit` is null for a bare count ("3 Eggs" -> 3). Null overall means
 * the line did not parse and the caller must show nothing.
 */
export function parseAmount(line) {
  if (!line || typeof line !== 'string') return null

  const m = LEADING.exec(line)
  if (!m || !m[1]) return null

  const isRange = !!m[2]

  /* The bracketed imperial, but only where it adjoins what was just
     read. This is the reading the line was written to give — the metric
     is the recipe's, the bracket is the shopper's — and it also settles
     a range: "80-100g (3.5oz)" has one imperial answer even though the
     metric is two numbers. */
  const paren = PAREN_IMPERIAL_HERE.exec(line.slice(m[0].length))
  if (paren) {
    const value = Number(paren[1])
    if (Number.isFinite(value)) return { value, unit: canon(paren[2].toLowerCase()) }
  }

  /* A RANGE WITH NO BRACKET HAS NO SINGLE ANSWER. "2-3 Whole Eggs" is
     two or three; printing "2" on the row would be this module doing
     the one thing it promises not to. */
  if (isRange) return null

  const value = readNumber(m[1])
  if (value === null || !Number.isFinite(value)) return null

  const word = m[3] ? m[3].toLowerCase() : null
  const unit = word && UNITS.has(word) ? canon(word) : null
  return { value, unit }
}

/* Trailing zeros are noise on a row: 6 oz, not 6.0 oz. */
function trim(n, places) {
  return Number(n.toFixed(places)).toString()
}

/**
 * One parsed amount as the row should show it.
 *
 * OUNCES CLIMB INTO POUNDS AT 16, to one decimal — "1.1 lb" rather than
 * "17.6 oz", because past a pound the pound is the number a person
 * carries. Below 16 the ounce is finer and stays.
 */
export function formatAmount(parsed) {
  if (!parsed || !Number.isFinite(parsed.value)) return null
  const { value, unit } = parsed

  if (unit === 'oz' && value >= 16) return `${trim(value / 16, 1)} lb`
  if (!unit) return trim(value, 2)
  return `${trim(value, 2)} ${unit}`
}

/**
 * The amount to show for an item, from every quantity line it carries.
 *
 * ADD ONLY LIKE TO LIKE. When every line parsed to the same unit the
 * sum is a real answer; when they differ there is no answer without a
 * conversion table this module refuses to invent, so it shows the first
 * two joined and stops. Two is the point at which the row is still
 * readable at 375px.
 *
 * Lines that do not parse are dropped rather than failing the whole
 * item: one unparseable line among three should not hide the other two.
 * Nothing parseable at all returns null, and the row shows nothing.
 */
export function amountFor(lines = []) {
  const parsed = (Array.isArray(lines) ? lines : [])
    .map(parseAmount)
    .filter(Boolean)

  if (!parsed.length) return null
  if (parsed.length === 1) return formatAmount(parsed[0])

  const unit = parsed[0].unit
  if (parsed.every(p => p.unit === unit)) {
    return formatAmount({ value: parsed.reduce((n, p) => n + p.value, 0), unit })
  }

  return parsed.slice(0, 2).map(formatAmount).filter(Boolean).join(' + ')
}
