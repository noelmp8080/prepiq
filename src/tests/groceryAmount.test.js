import { describe, it, expect } from 'vitest'
import catalog from '../data/groceryCatalog.json'
import { parseAmount, formatAmount, amountFor } from '../lib/groceryAmount'

const show = line => formatAmount(parseAmount(line))

/* Every line below is REAL — taken from groceryCatalog.json, not
   invented — because the shapes this has to survive are the ones the
   catalog actually holds, and a made-up fixture is a test of the
   fixture. */
describe('parseAmount — real catalog lines', () => {
  it.each([
    // the bracketed imperial is the reading the line was written to give
    ['500g (17.6oz) Chicken Breast, cubed',            '1.1 lb'],
    ['170g (6oz) Uncooked Macaroni',                   '6 oz'],
    ['600g (21oz) Raw Chicken Breast, cut into strips', '1.3 lb'],
    ['100g (3.5oz) Fat Free Yogurt',                   '3.5 oz'],
    ['250ml (8.8oz) Skimmed Milk',                     '8.8 oz'],
    ['120g (4.3oz) Light Cream Cheese',                '4.3 oz'],
    ['30g (1.1oz) Cornflour/ Corn Starch',             '1.1 oz'],

    // exactly at the pound boundary, and just under it
    ['450g (16oz) Chicken',                            '1 lb'],
    ['420g (15.9oz) Chicken',                          '15.9 oz'],

    // no bracket: the leading value and its unit
    ['1 Tsp Baking Powder',                            '1 tsp'],
    ['2 Tbsp Olive Oil',                               '2 tbsp'],
    ['10g (2 Tsp) Cornstarch or Corn Flour',           '10 g'],

    // a bare count: no unit is a real answer, not a missing one
    ['3 Eggs',                                         '3'],
    ['3 Whole Eggs',                                   '3'],

    // fractions and mixed numbers
    ['1/2 Cup Egg Whites',                             '0.5 cup'],
    ['1/2 Tsp Baking Powder',                          '0.5 tsp'],
    ['1 1/2 Tsp Salt',                                 '1.5 tsp'],
    ['½ Cup Oats',                                     '0.5 cup'],
    ['1/4 Cup (2oz) Almond or Low Fat Milk',           '2 oz'],
  ])('%s -> %s', (line, expected) => {
    expect(show(line)).toBe(expected)
  })
})

describe('parseAmount — what it refuses', () => {
  /* NEVER GUESS. A line with no amount shows nothing; the expander
     still carries the whole line. */
  it.each([
    ['Low Fat Cheese'],
    ['Parmesan Cheese'],
    ['Add the Chicken'],
    ['Cooked Rice Noodles'],
    ['Dash of Milk for desired consistency'],
    ['Pinch of Baking Powder'],
    ['Season Again with Same Spices as Chicken'],
  ])('declines %s', (line) => {
    expect(parseAmount(line)).toBeNull()
  })

  /* A RANGE HAS NO SINGLE VALUE. Printing the low end would be a guess
     and the row would understate what to buy. */
  it.each([
    ['2-3 Whole Eggs (Can Use Egg Whites)'],
    ['1-2 Eggs (egg wash)'],
  ])('declines the range %s', (line) => {
    expect(parseAmount(line)).toBeNull()
  })

  /* …unless the line resolves it itself. The bracket is one number. */
  it.each([
    ['80-100g (3.5oz) Chicken Pieces',  '3.5 oz'],
    ['15-20g (1oz) Light Cheese Slice', '1 oz'],
    ['20-30g (1.1oz) Grated Parmesan',  '1.1 oz'],
  ])('%s -> %s, because the bracket settles it', (line, expected) => {
    expect(show(line)).toBe(expected)
  })

  it.each([[null], [undefined], [''], [42], [{}]])('survives %s', (v) => {
    expect(parseAmount(v)).toBeNull()
  })
})

/* THE BRACKET IS ONLY TRUSTED WHERE IT ADJOINS THE AMOUNT. This line is
   about cornflour; the (1.4oz) belongs to the water it is mixed with. */
describe('parseAmount — a bracket further down the line is not this amount', () => {
  it('reads the cornflour, not the water', () => {
    expect(show('5g (1 Tsp) Cornflour mixed with 40ml (1.4oz) Water (Optional)'))
      .toBe('5 g')
  })

  it('takes the FIRST of two bracketed readings', () => {
    /* "…Pasta/500g (18oz) Cooked" is the same ingredient weighed twice;
       the first is the one being bought. */
    expect(show('225g (8oz) Uncooked Macaroni Pasta/500g (18oz) Cooked')).toBe('8 oz')
  })
})

describe('formatAmount', () => {
  it('climbs into pounds at 16oz, to one decimal', () => {
    expect(formatAmount({ value: 16, unit: 'oz' })).toBe('1 lb')
    expect(formatAmount({ value: 17.6, unit: 'oz' })).toBe('1.1 lb')
    expect(formatAmount({ value: 53, unit: 'oz' })).toBe('3.3 lb')
  })

  it('leaves ounces alone below 16', () => {
    expect(formatAmount({ value: 15.9, unit: 'oz' })).toBe('15.9 oz')
    expect(formatAmount({ value: 6, unit: 'oz' })).toBe('6 oz')
  })

  it('shows a bare count with no unit', () => {
    expect(formatAmount({ value: 3, unit: null })).toBe('3')
  })

  it('drops a trailing zero — 6 oz, not 6.0 oz', () => {
    expect(formatAmount({ value: 6.0, unit: 'oz' })).toBe('6 oz')
    expect(formatAmount({ value: 2.50, unit: 'tbsp' })).toBe('2.5 tbsp')
  })

  it('is null for nothing', () => {
    expect(formatAmount(null)).toBeNull()
    expect(formatAmount({ value: NaN, unit: 'oz' })).toBeNull()
  })
})

describe('amountFor — several lines for one item', () => {
  /* ADD ONLY LIKE TO LIKE. */
  it('sums when every line parsed to the same unit', () => {
    expect(amountFor(['100g (3.5oz) Yogurt', '170g (6oz) Yogurt'])).toBe('9.5 oz')
  })

  it('sums past the pound boundary and shows pounds', () => {
    expect(amountFor(['250g (9oz) Chicken', '250g (9oz) Chicken'])).toBe('1.1 lb')
  })

  it('joins the first two when the units differ', () => {
    expect(amountFor(['2 Tbsp Olive Oil', '1 Cup Rice'])).toBe('2 tbsp + 1 cup')
  })

  it('stops at two, however many differ', () => {
    expect(amountFor(['2 Tbsp Oil', '1 Cup Rice', '3 Cloves Garlic']))
      .toBe('2 tbsp + 1 cup')
  })

  /* One unparseable line among several must not hide the others. */
  it('drops the lines that did not parse and keeps going', () => {
    expect(amountFor(['Low Fat Cheese', '170g (6oz) Macaroni'])).toBe('6 oz')
  })

  it('is null when nothing parsed, and for no lines at all', () => {
    expect(amountFor(['Low Fat Cheese', 'Add the Chicken'])).toBeNull()
    expect(amountFor([])).toBeNull()
    expect(amountFor()).toBeNull()
    expect(amountFor(null)).toBeNull()
  })

  it('passes a single line straight through', () => {
    expect(amountFor(['500g (17.6oz) Chicken Breast, cubed'])).toBe('1.1 lb')
  })

  /* Bare counts share the null unit, so they add. */
  it('adds bare counts', () => {
    expect(amountFor(['2 Eggs', '3 Eggs'])).toBe('5')
  })
})

/* ── THE SHARE THAT PARSES ────────────────────────────────────────────
 * Pinned so a change to the parser shows up as a number rather than as
 * a row that quietly went blank. */
describe('against the whole catalog', () => {
  const lines = Object.values(catalog.byCard)
    .flatMap(list => list.flatMap(e => e.qty || []))

  it('has the corpus it claims to', () => {
    expect(lines.length).toBe(1009)
  })

  it('parses at least 92% of quantity lines', () => {
    const ok = lines.filter(l => parseAmount(l)).length
    expect(ok / lines.length).toBeGreaterThan(0.92)
  })

  /* Every decline is one of two shapes, and neither is a parser gap:
     a line with no number in front of it, or a range the line does not
     resolve itself. If a third shape appears, it wants looking at. */
  it('declines only lines with no leading number, or an unresolved range', () => {
    const declined = lines.filter(l => !parseAmount(l))
    const other = declined.filter(l =>
      /^\s*\d/.test(l) && !/^\s*\d+(\.\d+)?\s*-\s*\d/.test(l))
    expect(other).toEqual([])
  })

  it('never returns a NaN or an empty string for a line it accepted', () => {
    for (const l of lines) {
      const out = formatAmount(parseAmount(l))
      if (out === null) continue
      expect(out).not.toContain('NaN')
      expect(out.trim()).not.toBe('')
    }
  })

  /* A row is ~331px at 375px and the name has to fit beside this. */
  it('keeps every amount short enough for a row', () => {
    for (const l of lines) {
      const out = formatAmount(parseAmount(l))
      if (out) expect(out.length).toBeLessThanOrEqual(12)
    }
  })
})
