import { describe, it, expect } from 'vitest'
import catalog from '../data/groceryCatalog.json'
import { groupsForDay, groupEyebrow } from '../lib/groceryByDay'
import { buildGroceryItems, dayKey } from '../store/storeLogic'

/* The same fixture the reflow harness pins, copied rather than imported
   because that file is a DOM suite with its own jsdom setup. Day 1 is
   Tuesday -> recipes 1 and 2, and it deliberately swaps the default
   seeding so a fallback to DEFAULT_WEEK_PLAN is observable. */
const FIXED_PLAN = [
  { day: 'Mon', ids: [3, 4] },
  { day: 'Tue', ids: [1, 2] },
  { day: 'Wed', ids: [5, 6] },
  { day: 'Thu', ids: [7, 8] },
  { day: 'Fri', ids: [9, 10] },
  { day: 'Sat', ids: [11, null] },
  { day: 'Sun', ids: [12, null] },
]
const TUE = 1

const NONE = new Set()
const idsOf = groups => groups.flatMap(g => g.items.map(i => i.itemId))

describe('groupsForDay — the shape', () => {
  const groups = groupsForDay(FIXED_PLAN, catalog, NONE, TUE)

  it('returns one group per planned recipe', () => {
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.recipeId)).toEqual([1, 2])
  })

  it('carries an instance id built from recipe and position', () => {
    expect(groups.map(g => g.instanceId)).toEqual(['1#0', '2#1'])
  })

  it('gives every item the four fields the screen needs', () => {
    const item = groups[0].items[0]
    expect(Object.keys(item).sort()).toEqual(['itemId', 'name', 'quantity', 'section'])
    expect(typeof item.name).toBe('string')
    expect(Array.isArray(item.quantity)).toBe(true)
    expect(catalog.sectionOrder).toContain(item.section)
  })

  /* 76% of card-item pairs carry no quantity line, so an empty array is
     the ordinary case and must not be confused with a missing field. */
  it('uses an empty array, not null, for an item with no quantity line', () => {
    const empties = groups.flatMap(g => g.items).filter(i => i.quantity.length === 0)
    expect(empties.length).toBeGreaterThan(0)
    for (const i of empties) expect(i.quantity).toEqual([])
  })
})

describe('groupsForDay — group order', () => {
  it('is the order the recipes sit in day.ids, not id order', () => {
    const plan = [{ day: 'Mon', ids: [2, 1] }]
    const groups = groupsForDay(plan, catalog, NONE, 0)
    expect(groups.map(g => g.recipeId)).toEqual([2, 1])
    expect(groups.map(g => g.position)).toEqual([0, 1])
  })

  it('records position as the index in day.ids, gaps included', () => {
    const plan = [{ day: 'Mon', ids: [null, 1, null, 2] }]
    const groups = groupsForDay(plan, catalog, NONE, 0)
    expect(groups.map(g => g.position)).toEqual([1, 3])
    expect(groups.map(g => g.instanceId)).toEqual(['1#1', '2#3'])
  })
})

describe('groupsForDay — a recipe planned twice', () => {
  const plan = [{ day: 'Mon', ids: [1, 2, 1] }]
  const groups = groupsForDay(plan, catalog, NONE, 0)

  /* One thing to cook twice is one set of ingredients to have in — the
     same call buildGroceryItems makes with seenCards. */
  it('renders ONE group, not two', () => {
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.recipeId)).toEqual([1, 2])
  })

  it('counts the repeat rather than dropping it silently', () => {
    expect(groups[0].timesPlanned).toBe(2)
    expect(groups[1].timesPlanned).toBe(1)
  })

  it('anchors the instance id to the FIRST appearance', () => {
    expect(groups[0].instanceId).toBe('1#0')
  })

  it('does not duplicate that recipe\'s items', () => {
    const once = groupsForDay([{ day: 'Mon', ids: [1] }], catalog, NONE, 0)
    expect(groups[0].items.length).toBe(once[0].items.length)
  })
})

describe('groupsForDay — items within a group', () => {
  const groups = groupsForDay(FIXED_PLAN, catalog, NONE, TUE)

  it('walks the catalog section order, never a hardcoded one', () => {
    for (const g of groups) {
      const seen = g.items.map(i => catalog.sectionOrder.indexOf(i.section))
      expect(seen).toEqual([...seen].sort((a, b) => a - b))
    }
  })

  it('has no repeated item id inside one group', () => {
    for (const g of groups) {
      const ids = g.items.map(i => i.itemId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  /* Dedupe is WITHIN a recipe only. Two recipes that share an ingredient
     each keep their own row — that is the whole difference from the
     consolidated list. */
  it('keeps a shared ingredient in both groups', () => {
    const a = new Set(groups[0].items.map(i => i.itemId))
    const b = new Set(groups[1].items.map(i => i.itemId))
    const shared = [...a].filter(id => b.has(id))
    expect(shared.length).toBeGreaterThan(0)
  })
})

describe('groupsForDay — empty and malformed input', () => {
  it.each([
    ['a day of nulls', [{ day: 'Sat', ids: [null, null] }], 0],
    ['a day with no ids key', [{ day: 'Sat' }], 0],
    ['an empty ids array', [{ day: 'Sat', ids: [] }], 0],
  ])('returns [] for %s', (_label, plan, index) => {
    expect(groupsForDay(plan, catalog, NONE, index)).toEqual([])
  })

  it.each([
    ['an out-of-range index', FIXED_PLAN, 99],
    ['a negative index', FIXED_PLAN, -1],
    ['an undefined index', FIXED_PLAN, undefined],
    ['an empty plan', [], 0],
  ])('returns [] for %s', (_label, plan, index) => {
    expect(groupsForDay(plan, catalog, NONE, index)).toEqual([])
  })

  it('survives no arguments at all', () => {
    expect(groupsForDay()).toEqual([])
  })

  it('skips a recipe the catalog has never heard of', () => {
    const groups = groupsForDay([{ day: 'Mon', ids: [999999] }], catalog, NONE, 0)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual([])
  })
})

describe('groupsForDay — exclusions', () => {
  const groups = groupsForDay(FIXED_PLAN, catalog, NONE, TUE)
  const victim = groups[0].items[0].itemId

  it('drops a cleared item, keyed the same way the list keys it', () => {
    const excluded = new Set([dayKey(TUE, victim)])
    const after = groupsForDay(FIXED_PLAN, catalog, excluded, TUE)
    expect(idsOf(after)).not.toContain(victim)
    expect(idsOf(after).length).toBe(idsOf(groups).length - countOf(groups, victim))
  })

  /* Exclusions are day-wide, not per-recipe: "I already have this" is a
     fact about the shop. So a shared ingredient leaves EVERY group. */
  it('removes a shared ingredient from every group at once', () => {
    const a = new Set(groups[0].items.map(i => i.itemId))
    const shared = groups[1].items.map(i => i.itemId).find(id => a.has(id))
    const after = groupsForDay(FIXED_PLAN, catalog, new Set([dayKey(TUE, shared)]), TUE)
    expect(idsOf(after)).not.toContain(shared)
  })

  it('ignores an exclusion for a different day', () => {
    const excluded = new Set([dayKey(TUE + 1, victim)])
    const after = groupsForDay(FIXED_PLAN, catalog, excluded, TUE)
    expect(idsOf(after)).toContain(victim)
  })

  it('ignores an id that is not on this day', () => {
    const after = groupsForDay(FIXED_PLAN, catalog, new Set([dayKey(TUE, 999999)]), TUE)
    expect(idsOf(after).length).toBe(idsOf(groups).length)
  })
})

function countOf(groups, itemId) {
  return groups.flatMap(g => g.items).filter(i => i.itemId === itemId).length
}

/* ── PARITY ───────────────────────────────────────────────────────────
 * The two views read the same day from the same catalog. They may shape
 * it differently; they may not disagree about what is on the list. The
 * failure this guards is an ingredient present in one view and absent
 * from the other, which neither screen can show on its own. */
describe('parity with buildGroceryItems', () => {
  const day = TUE
  const rows = buildGroceryItems(FIXED_PLAN, catalog, NONE, day)
  const groups = groupsForDay(FIXED_PLAN, catalog, NONE, day)

  it('has something to compare — vacuous otherwise', () => {
    expect(rows.length).toBeGreaterThan(0)
    expect(groups.length).toBeGreaterThan(0)
  })

  it('covers exactly the same item ids', () => {
    const flat = new Set(rows.map(r => r.id))
    const grouped = new Set(idsOf(groups))
    expect([...grouped].sort((a, b) => a - b)).toEqual([...flat].sort((a, b) => a - b))
  })

  /* 25 distinct items on this fixture, the number the reflow harness
     pins as DERIVED_ROWS. Stated here so the two suites fail together
     if the catalog moves under them. */
  it('agrees on the harness\'s own count of 25', () => {
    expect(rows).toHaveLength(25)
    expect(new Set(idsOf(groups)).size).toBe(25)
  })

  it('agrees on names too, not just ids', () => {
    const flat = new Map(rows.map(r => [r.id, r.name]))
    for (const g of groups) {
      for (const i of g.items) expect(i.name).toBe(flat.get(i.itemId))
    }
  })

  it('still agrees once something is excluded', () => {
    const victim = rows[0].id
    const ex = new Set([dayKey(day, victim)])
    const flat = new Set(buildGroceryItems(FIXED_PLAN, catalog, ex, day).map(r => r.id))
    const grouped = new Set(idsOf(groupsForDay(FIXED_PLAN, catalog, ex, day)))
    expect([...grouped].sort((a, b) => a - b)).toEqual([...flat].sort((a, b) => a - b))
  })

  it('agrees on every day of the fixture, not just Tuesday', () => {
    for (let d = 0; d < FIXED_PLAN.length; d++) {
      const flat = new Set(buildGroceryItems(FIXED_PLAN, catalog, NONE, d).map(r => r.id))
      const grouped = new Set(idsOf(groupsForDay(FIXED_PLAN, catalog, NONE, d)))
      expect([...grouped].sort((a, b) => a - b)).toEqual([...flat].sort((a, b) => a - b))
    }
  })
})

describe('groupEyebrow', () => {
  it('is positional and 1-based', () => {
    expect(groupEyebrow({ position: 0, timesPlanned: 1, items: [1, 2, 3] }))
      .toBe('MEAL 1 · 3 ITEMS')
  })

  it('names the repeat when a recipe is planned twice', () => {
    expect(groupEyebrow({ position: 0, timesPlanned: 2, items: new Array(9) }))
      .toBe('MEAL 1 · ×2 · 9 ITEMS')
  })

  it('says ITEM for one', () => {
    expect(groupEyebrow({ position: 2, timesPlanned: 1, items: [1] }))
      .toBe('MEAL 3 · 1 ITEM')
  })

  it('copes with an empty group and with nothing at all', () => {
    expect(groupEyebrow({ position: 0, timesPlanned: 1, items: [] })).toBe('MEAL 1 · 0 ITEMS')
    expect(groupEyebrow(null)).toBe('')
  })
})
