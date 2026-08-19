import { describe, it, expect } from 'vitest'
import {
  buildGroceryItems, groupBySection, readChecks, writeChecks, CHECKS_VERSION,
} from '../store/storeLogic'
import catalog from '../data/groceryCatalog.json'

/* THE GROCERY DERIVATION.
 *
 * The screen is uncovered by design; this is where a silent wrong answer
 * lives. The version this replaces listed one row per RECIPE and called
 * them groceries — twelve dish names and no food — and nothing caught it
 * because nothing tested the derivation.
 */

const plan = ids => ids.map((pair, i) => ({ day: `D${i}`, ids: pair }))

describe('the catalog it ships against', () => {
  it('is present, versioned, and keyed by id', () => {
    expect(catalog.version).toBe(1)
    expect(Object.keys(catalog.items).length).toBeGreaterThan(400)
    for (const [k, v] of Object.entries(catalog.items)) {
      expect(Number.isInteger(Number(k))).toBe(true)
      expect(typeof v.name).toBe('string')
      expect(typeof v.section).toBe('string')
    }
  })

  it('places every item in a section the order knows about', () => {
    const known = new Set(catalog.sectionOrder)
    for (const v of Object.values(catalog.items)) expect(known.has(v.section)).toBe(true)
  })

  /* Order is data so it can become a user preference later. */
  it('carries its own order rather than the code hardcoding one', () => {
    expect(Array.isArray(catalog.sectionOrder)).toBe(true)
    expect(catalog.sectionOrder[catalog.sectionOrder.length - 1]).toBe('Other')
    expect(catalog.hideWhenEmpty).not.toContain('Other')
  })
})

describe('buildGroceryItems', () => {
  const week = plan([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, null], [12, null]])

  it('returns FOOD, not recipe names', () => {
    const rows = buildGroceryItems(week, catalog)
    expect(rows.length).toBeGreaterThan(40)
    const names = rows.map(r => r.name)
    /* The failure this replaces: rows named after dishes. */
    expect(names).not.toContain('Spicy Chicken Wraps')
    expect(names.some(n => n === 'chicken breast')).toBe(true)
    expect(names.some(n => n === 'paprika')).toBe(true)
  })

  it('merges one row per item across meals, with every meal recorded', () => {
    const rows = buildGroceryItems(week, catalog)
    const ids = rows.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)          // no duplicate rows
    const chicken = rows.find(r => r.name === 'chicken breast')
    expect(chicken.meals.length).toBeGreaterThan(1)      // needed by several meals
    expect(new Set(chicken.meals).size).toBe(chicken.meals.length)
  })

  it('counts a repeated meal once', () => {
    const once = buildGroceryItems(plan([[1, null]]), catalog)
    const twice = buildGroceryItems(plan([[1, null], [1, null]]), catalog)
    expect(twice.length).toBe(once.length)
    expect(twice.find(r => r.meals.length > 1)).toBeUndefined()
  })

  it('carries quantities only for the sections that need them', () => {
    const rows = buildGroceryItems(week, catalog)
    const qtySections = new Set(catalog.quantitySections)
    for (const r of rows) {
      if (qtySections.has(r.section)) continue
      expect(r.qty, `${r.name} in ${r.section} should carry no quantity`).toHaveLength(0)
    }
    /* And the sections that DO need them actually have them — otherwise
       the assertion above passes by everything being empty. */
    const meat = rows.filter(r => r.section === 'Meat & fish')
    expect(meat.length).toBeGreaterThan(0)
    expect(meat.some(r => r.qty.length > 0)).toBe(true)
  })

  it('survives an empty plan and null slots', () => {
    expect(buildGroceryItems([], catalog)).toEqual([])
    expect(buildGroceryItems(plan([[null, null]]), catalog)).toEqual([])
    expect(buildGroceryItems(undefined, catalog)).toEqual([])
  })
})

describe('exclusions — the Clear round-trip', () => {
  const week = plan([[1, 2], [3, 4]])

  it('removes exactly the cleared ids and nothing else', () => {
    const before = buildGroceryItems(week, catalog)
    const drop = before.slice(0, 3).map(r => r.id)
    const after = buildGroceryItems(week, catalog, new Set(drop))
    expect(after.length).toBe(before.length - 3)
    for (const id of drop) expect(after.find(r => r.id === id)).toBeUndefined()
  })

  /* Ids, never names. The normaliser has changed on nearly every pass of
     this work; a name key would have broken each time. */
  it('is keyed on an id that survives a rename', () => {
    const rows = buildGroceryItems(week, catalog)
    for (const r of rows) expect(Number.isInteger(r.id)).toBe(true)
  })

  it('ignores an id that is not on the list', () => {
    const before = buildGroceryItems(week, catalog)
    const after = buildGroceryItems(week, catalog, new Set([999999]))
    expect(after.length).toBe(before.length)
  })
})

describe('groupBySection', () => {
  const rows = buildGroceryItems(plan([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]), catalog)

  it('walks the shop in the catalog order', () => {
    const groups = groupBySection(rows, catalog)
    const names = groups.map(g => g.name)
    const order = catalog.sectionOrder.filter(s => names.includes(s))
    expect(names).toEqual(order)
  })

  it('drops empty sections but never Other', () => {
    const groups = groupBySection([], catalog)
    expect(groups.map(g => g.name)).toEqual(['Other'])
    expect(groups[0].items).toEqual([])
  })

  it('marks the spice rack collapsed and nothing else', () => {
    const groups = groupBySection(rows, catalog)
    const collapsed = groups.filter(g => g.collapsed).map(g => g.name)
    expect(collapsed).toEqual(catalog.collapsedByDefault)
  })

  it('loses no rows', () => {
    const groups = groupBySection(rows, catalog)
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(rows.length)
  })

  it('sorts by how many meals need it, then by name', () => {
    for (const g of groupBySection(rows, catalog)) {
      for (let i = 1; i < g.items.length; i++) {
        const a = g.items[i - 1], b = g.items[i]
        expect(a.meals.length >= b.meals.length).toBe(true)
        if (a.meals.length === b.meals.length) {
          expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0)
        }
      }
    }
  })
})

describe('the check re-key', () => {
  it('reads nothing from the old recipe-keyed shape', () => {
    /* v1 stored `recipe_${id}` strings. They cannot be mapped onto the
       nineteen ingredients of a recipe without inventing data, so a
       rollback or an old document yields an unchecked list. */
    expect(readChecks({ ids: ['recipe_1', 'recipe_2'] }).size).toBe(0)
    expect(readChecks({ version: 1, ids: ['recipe_1'] }).size).toBe(0)
    expect(readChecks(null).size).toBe(0)
    expect(readChecks({}).size).toBe(0)
  })

  /* THE VERSION CHECK, ISOLATED. The assertions above pass even without
     it: they use string ids, which the integer filter drops anyway, so
     the filter was doing the work and the version gate was never
     exercised. A mutant that deleted the gate survived. These ids are
     integers, so only the version can reject them. */
  it('rejects a wrong-version document even when its ids look valid', () => {
    expect(readChecks({ version: 1, ids: [1, 2, 3] }).size).toBe(0)
    expect(readChecks({ version: CHECKS_VERSION + 1, ids: [1, 2, 3] }).size).toBe(0)
    expect(readChecks({ ids: [1, 2, 3] }).size).toBe(0)
    expect(readChecks({ version: CHECKS_VERSION, ids: [1, 2, 3] }).size).toBe(3)
  })

  it('round-trips the new id-keyed shape', () => {
    const ids = new Set([3, 1, 2])
    const doc = writeChecks(ids)
    expect(doc.version).toBe(CHECKS_VERSION)
    expect(doc.ids).toEqual([1, 2, 3])           // sorted, so the write is stable
    expect([...readChecks(doc)].sort()).toEqual([1, 2, 3])
  })

  it('refuses a mixed document rather than half-reading it', () => {
    expect([...readChecks({ version: CHECKS_VERSION, ids: [1, 'recipe_2', 3] })]).toEqual([1, 3])
  })

  it('writes a replacement, not a merge — old keys cannot linger', () => {
    expect(writeChecks(new Set([5])).ids).toEqual([5])
  })
})
