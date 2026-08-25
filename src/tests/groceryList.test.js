import { describe, it, expect } from 'vitest'
import {
  buildGroceryItems, groupBySection, dayKey, isDayKey, todayIndex, readChecks, writeChecks,
  CHECKS_VERSION, EXCLUDED_VERSION,
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
  /* RE-AIMED, NOT DISCARDED. These were written against week-wide
     derivation. Their subjects mostly survive the change — "merges
     across meals" still has a job, it is now merging across the meals of
     ONE day. Only the assertions whose whole subject was cross-day
     accumulation actually died, and those moved to the day-scoped block
     below.

     Every call now passes a day index. Without one the function returns
     [] and several of these would pass against an empty array, which is
     exactly how a rewrite ends up encoding whatever the code does rather
     than what the spec requires. Each carries a non-vacuity guard. */
  const week = plan([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, null], [12, null]])
  const MON = 0

  it('returns FOOD, not recipe names', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), MON)
    expect(rows.length).toBeGreaterThan(20)
    const names = rows.map(r => r.name)
    /* The failure this replaces: rows named after dishes. */
    expect(names).not.toContain('Spicy Chicken Wraps')
    expect(names.some(n => n === 'chicken breast')).toBe(true)
    expect(names.some(n => n === 'paprika')).toBe(true)
  })

  it('merges one row per item across the meals OF THAT DAY', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), MON)
    const ids = rows.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)          // no duplicate rows
    /* Monday is recipes 1 and 2, which share six items — so merging
       within a day is a real thing to assert, not a leftover from the
       week-wide version. */
    const shared = rows.filter(r => r.meals.length > 1)
    expect(shared.length).toBe(6)
    for (const r of shared) {
      expect(new Set(r.meals).size).toBe(r.meals.length)
      expect([...r.meals].sort()).toEqual([1, 2])
    }
  })

  it('counts a repeated meal once', () => {
    const once = buildGroceryItems(plan([[1, null]]), catalog, new Set(), 0)
    const twice = buildGroceryItems(plan([[1, 1]]), catalog, new Set(), 0)
    expect(once.length).toBeGreaterThan(0)              // not vacuous
    expect(twice.length).toBe(once.length)
    expect(twice.find(r => r.meals.length > 1)).toBeUndefined()
  })

  it('carries quantities only for the sections that need them', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), MON)
    expect(rows.length).toBeGreaterThan(0)
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

  it('survives an empty plan, null slots and a missing day index', () => {
    expect(buildGroceryItems([], catalog, new Set(), 0)).toEqual([])
    expect(buildGroceryItems(plan([[null, null]]), catalog, new Set(), 0)).toEqual([])
    expect(buildGroceryItems(undefined, catalog, new Set(), 0)).toEqual([])
    /* A missing day index is not "today" — the store resolves that.
       Here it is simply no day, and the function says so rather than
       guessing, which is the whole reason date resolution lives at the
       call site. */
    expect(buildGroceryItems(week, catalog)).toEqual([])
  })
})

describe('exclusions — the Clear round-trip', () => {
  const week = plan([[1, 2], [3, 4]])
  const MON = 0

  it('removes exactly the cleared ids and nothing else', () => {
    const before = buildGroceryItems(week, catalog, new Set(), MON)
    expect(before.length).toBeGreaterThan(3)
    const drop = before.slice(0, 3).map(r => r.id)
    const keys = new Set(drop.map(id => dayKey(MON, id)))
    const after = buildGroceryItems(week, catalog, keys, MON)
    expect(after.length).toBe(before.length - 3)
    for (const id of drop) expect(after.find(r => r.id === id)).toBeUndefined()
  })

  /* Ids, never names. The normaliser has changed on nearly every pass of
     this work; a name key would have broken each time. */
  it('is keyed on an id that survives a rename', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), MON)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(Number.isInteger(r.id)).toBe(true)
  })

  it('ignores an id that is not on the list', () => {
    const before = buildGroceryItems(week, catalog, new Set(), MON)
    expect(before.length).toBeGreaterThan(0)
    const after = buildGroceryItems(week, catalog, new Set([dayKey(MON, 999999)]), MON)
    expect(after.length).toBe(before.length)
  })

  /* ONE DEFINITION OF THE KEY, used by the derivation to look up and by
     the store to write. Two hand-built strings is how a key ends up
     half-applied — the excluding side working while the writing side
     emits something that never matches. */
  it('builds the key one way', () => {
    expect(dayKey(3, 41)).toBe('3:41')
    expect(dayKey(0, 1)).toBe('0:1')
  })
})

describe('groupBySection', () => {
  const rows = buildGroceryItems(
    plan([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]), catalog, new Set(), 0)

  it('has rows to group — the rest of this block is vacuous without it', () => {
    expect(rows.length).toBeGreaterThan(10)
  })

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
    expect(groups.some(g => g.name === 'Spices & seasoning')).toBe(true)
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

describe('the stored key space', () => {
  /* Two resets in one bump, and the reasons differ.

     CHECKS were bare item ids and week-wide. There is no honest mapping
     from one bare id onto seven possible days.

     EXCLUSIONS were bare ids too — and, crucially, were stored under
     CHECKS_VERSION because they never had a constant of their own. A
     measured document from this branch read
     `{"version":2,"ids":[13,18]}`. That is why EXCLUDED_VERSION is 3 and
     not the 2 the phase plan named: at 2 those bare ids would read back
     as VALID, match nothing, clear nothing, and look like a reset while
     being a migration that lost. */
  it('gives exclusions a version that actually rejects what is on disk', () => {
    expect(EXCLUDED_VERSION).not.toBe(2)
    expect(readChecks({ version: 2, ids: [13, 18] }, EXCLUDED_VERSION).size).toBe(0)
    expect(readChecks({ version: 2, ids: [13, 18] }, CHECKS_VERSION).size).toBe(0)
  })

  it('reads nothing from either older shape', () => {
    expect(readChecks({ ids: ['recipe_1', 'recipe_2'] }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({ version: 1, ids: ['recipe_1'] }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({ version: 2, ids: [1, 2, 3] }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks(null, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({}, CHECKS_VERSION).size).toBe(0)
  })

  /* THE VERSION CHECK, ISOLATED — these keys are well-formed, so only
     the version can reject them. Without this a mutant that deleted the
     gate survived, because the shape filter was doing all the work. */
  it('rejects a wrong-version document even when its keys are valid', () => {
    const keys = ['0:1', '0:2', '3:41']
    expect(readChecks({ version: 1, keys }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({ version: CHECKS_VERSION + 1, keys }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({ keys }, CHECKS_VERSION).size).toBe(0)
    expect(readChecks({ version: CHECKS_VERSION, keys }, CHECKS_VERSION).size).toBe(3)
  })

  /* ONE VALIDATOR, BOTH SIDES. This is the assertion that would have
     caught the defect that produced this commit: a reader wanting
     `"1:13"` and a writer emitting `13`, each with its own filter, each
     internally consistent, and Clear silently doing nothing.
     Asserting the two functions AGREE — rather than asserting each
     against a literal — is what makes drift impossible to introduce
     without a red test. */
  it('cannot drift: everything written is read back, and only that', () => {
    const mixed = ['0:1', '3:41', 13, 'recipe_2', '1.0:2', ' 1:2', '01:2', '1e3:2',
                   '', '1:', ':1', '1:2:3', null, undefined, '-1:2']
    const doc = writeChecks(mixed, CHECKS_VERSION)
    const back = readChecks(doc, CHECKS_VERSION)
    expect([...back].sort()).toEqual(doc.keys.slice().sort())
    for (const k of mixed) expect(back.has(k)).toBe(isDayKey(k))
  })

  /* Structural, not a pattern. Every rejected string below coerces to a
     number happily; none is a key this app ever wrote. A regex looking
     for digits either accepts them or grows until it is this function. */
  it('accepts only canonical integer pairs', () => {
    for (const ok of ['0:1', '3:41', '6:577', '-1:2']) expect(isDayKey(ok)).toBe(true)
    for (const no of ['1.0:2', ' 1:2', '01:2', '1e3:2', '1:', ':1', '', '1:2:3',
                      '1', 13, null, undefined, {}, ['0:1']]) {
      expect(isDayKey(no), `${String(no)} should be rejected`).toBe(false)
    }
  })

  it('round-trips the day-keyed shape', () => {
    const keys = new Set([dayKey(3, 41), dayKey(0, 1)])
    const doc = writeChecks(keys, CHECKS_VERSION)
    expect(doc.version).toBe(CHECKS_VERSION)
    expect(doc.keys).toEqual(['3:41', '0:1'])
    expect(readChecks(doc, CHECKS_VERSION)).toEqual(keys)
  })

  /* NO SORT, DELIBERATELY. It used to end `.sort((a, b) => a - b)`,
     which on strings compares NaN every time — a sort that does nothing
     while reading as though it orders the file. Storage order is
     cosmetic, so this asserts insertion order survives rather than
     pretending an ordering exists. */
  it('does not reorder what it stores', () => {
    expect(writeChecks(['6:9', '0:1', '3:41'], CHECKS_VERSION).keys)
      .toEqual(['6:9', '0:1', '3:41'])
  })

  it('writes a replacement, not a merge — old keys cannot linger', () => {
    expect(writeChecks(new Set([dayKey(0, 5)]), CHECKS_VERSION).keys).toEqual(['0:5'])
  })

  /* The two stores are versioned separately so they can move apart
     later, but a document from one must not validate against the other's
     constant if they ever diverge. */
  it('keeps the two versions independent', () => {
    const doc = writeChecks(['0:1'], EXCLUDED_VERSION)
    expect(readChecks(doc, EXCLUDED_VERSION).size).toBe(1)
    if (CHECKS_VERSION !== EXCLUDED_VERSION) {
      expect(readChecks(doc, CHECKS_VERSION).size).toBe(0)
    }
  })
})

/* ─────────────────────────────────────────────────────────────────────
 * DAY-SCOPED DERIVATION — the redesign spec.
 *
 * Written BEFORE buildGroceryItems changes, and expected to fail until
 * it does. The order matters: the week-wide assertions above are about
 * to be rewritten, and if that happened first they would encode whatever
 * the new code does rather than what the handoff requires.
 *
 * Handoff, "Grocery — the interaction model to preserve":
 *
 *   chosen day -> assigned recipe ids -> ingredient rows from the catalog
 *              -> merged by catalog key, source recipes remembered
 *              -> grouped by store section, in walk order
 *              -> minus items excluded FOR THAT DAY
 *
 * Anchored on real catalog data, not fixtures: day 0 holds recipes 1 and
 * 2 (25 items), day 1 holds 3 and 4 (31 items), and they share 9.
 * ───────────────────────────────────────────────────────────────────── */

const WEEK = [
  { day: 'Mon', ids: [1, 2] },
  { day: 'Tue', ids: [3, 4] },
  { day: 'Wed', ids: [5, 6] },
  { day: 'Thu', ids: [7, 8] },
  { day: 'Fri', ids: [9, 10] },
  { day: 'Sat', ids: [11, null] },
  { day: 'Sun', ids: [12, null] },
]

describe('the list is one day, not the week', () => {
  it('returns only the chosen day\'s items', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    const tue = buildGroceryItems(WEEK, catalog, new Set(), 1)
    expect(mon).toHaveLength(25)
    expect(tue).toHaveLength(31)
  })

  it('leaves out an item that belongs only to another day', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    /* garlic powder, basmati rice and cumin are on Tuesday's recipes and
       not Monday's — under week-wide derivation they would all appear */
    for (const id of [26, 27, 28]) {
      expect(mon.find(r => r.id === id), `item ${id} leaked from another day`).toBeUndefined()
    }
    const tue = buildGroceryItems(WEEK, catalog, new Set(), 1)
    for (const id of [26, 27, 28]) expect(tue.find(r => r.id === id)).toBeDefined()
  })

  it('is never the whole week for any single day', () => {
    const week = new Set()
    for (let d = 0; d < 7; d++) {
      for (const r of buildGroceryItems(WEEK, catalog, new Set(), d)) week.add(r.id)
    }
    for (let d = 0; d < 7; d++) {
      expect(buildGroceryItems(WEEK, catalog, new Set(), d).length).toBeLessThan(week.size)
    }
  })

  /* dayIndex is ALWAYS a real integer. Date resolution lives at the call
     site in the store, so this stays pure and testable — and so the UTC
     bug that once lived in date handling has no surface here. */
  it('takes a real integer, and does not resolve today itself', () => {
    expect(buildGroceryItems(WEEK, catalog, new Set(), 5)).toHaveLength(
      buildGroceryItems([{ day: 'Sat', ids: [11, null] }], catalog, new Set(), 0).length)
    /* out of range is an empty day, not a crash and not a fallback */
    expect(buildGroceryItems(WEEK, catalog, new Set(), 99)).toEqual([])
    expect(buildGroceryItems(WEEK, catalog, new Set(), -1)).toEqual([])
  })

  it('an empty day derives an empty list', () => {
    const plan = [{ day: 'Mon', ids: [] }, { day: 'Tue', ids: [3] }]
    expect(buildGroceryItems(plan, catalog, new Set(), 0)).toEqual([])
    expect(buildGroceryItems(plan, catalog, new Set(), 1).length).toBeGreaterThan(0)
  })

  /* Survives the change and is easy to lose by accident. */
  it('still counts a recipe twice in ONE day as one shop', () => {
    const once = buildGroceryItems([{ day: 'Mon', ids: [1] }], catalog, new Set(), 0)
    const twice = buildGroceryItems([{ day: 'Mon', ids: [1, 1] }], catalog, new Set(), 0)
    expect(twice).toHaveLength(once.length)
    expect(twice.every(r => new Set(r.meals).size === r.meals.length)).toBe(true)
  })

  it('remembers which of that day\'s recipes need each item', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    for (const row of mon) {
      expect(row.meals.length).toBeGreaterThan(0)
      for (const m of row.meals) expect([1, 2]).toContain(m)
    }
  })

  /* Listed, never force-converted or summed. The handoff's derivation
     summary says "quantities summed"; its row spec says multiple
     quantities are listed. The row spec is the specific one and is what
     the shipped screen already does. */
  it('lists quantities rather than summing them', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    const withQty = mon.filter(r => r.qty.length)
    expect(withQty.length).toBeGreaterThan(0)
    for (const r of withQty) expect(Array.isArray(r.qty)).toBe(true)
  })
})

describe('exclusions are keyed to the day', () => {
  it('clearing Thursday leaves Friday intact', () => {
    const thu = buildGroceryItems(WEEK, catalog, new Set(), 3)
    const fri = buildGroceryItems(WEEK, catalog, new Set(), 4)
    const shared = thu.map(r => r.id).filter(id => fri.some(r => r.id === id))
    expect(shared.length, 'need a shared item to make this meaningful').toBeGreaterThan(0)

    const cleared = new Set(shared.map(id => `3:${id}`))
    const thuAfter = buildGroceryItems(WEEK, catalog, cleared, 3)
    const friAfter = buildGroceryItems(WEEK, catalog, cleared, 4)

    for (const id of shared) {
      expect(thuAfter.find(r => r.id === id), `${id} should be cleared on Thu`).toBeUndefined()
      expect(friAfter.find(r => r.id === id), `${id} must survive on Fri`).toBeDefined()
    }
  })

  it('ignores a bare item id — the key is dayIndex:itemId', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    const id = mon[0].id
    /* the old key shape must no longer exclude anything */
    const withOldKey = buildGroceryItems(WEEK, catalog, new Set([id]), 0)
    expect(withOldKey).toHaveLength(mon.length)
    const withNewKey = buildGroceryItems(WEEK, catalog, new Set([`0:${id}`]), 0)
    expect(withNewKey).toHaveLength(mon.length - 1)
  })

  /* CURRENTLY VACUOUS BEFORE STEP 4, and deliberately kept: the old
     implementation ignored string keys entirely, so this passed by
     accident. After the change it passes because the day prefix does
     not match - the reason it was written for. Verified to flip its
     reason, not its result. */
  it('ignores an exclusion for a day that is not being shown', () => {
    const mon = buildGroceryItems(WEEK, catalog, new Set(), 0)
    const other = new Set(mon.map(r => `4:${r.id}`))
    expect(buildGroceryItems(WEEK, catalog, other, 0)).toHaveLength(mon.length)
  })
})

describe('the list is derived, never stored', () => {
  it('changing the day\'s meal changes the list with no other call', () => {
    const before = buildGroceryItems([{ day: 'Mon', ids: [1] }], catalog, new Set(), 0)
    const after = buildGroceryItems([{ day: 'Mon', ids: [3] }], catalog, new Set(), 0)
    expect(after.map(r => r.id)).not.toEqual(before.map(r => r.id))
  })

  it('groups the day into sections in walk order', () => {
    const rows = buildGroceryItems(WEEK, catalog, new Set(), 0)
    const groups = groupBySection(rows, catalog)
    const names = groups.map(g => g.name)
    expect(names).toEqual(catalog.sectionOrder.filter(s => names.includes(s)))
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(rows.length)
  })
})

describe('todayIndex — resolved at the call site, never in the derivation', () => {
  const week = plan([[1], [2], [3], [4], [5], [6], [7]])
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const named = labels.map((day, i) => ({ day, ids: week[i].ids }))

  it('finds each weekday by the plan\'s own labels', () => {
    /* 2026-08-24 is a Monday. Local parts, not UTC — the date bug this
       codebase already paid for lived in exactly this conversion. */
    for (let i = 0; i < 7; i++) {
      expect(todayIndex(named, new Date(2026, 7, 24 + i))).toBe(i)
    }
  })

  it('does not assume Monday is index 0', () => {
    const shifted = [{ day: 'Wed', ids: [] }, { day: 'Thu', ids: [] }, { day: 'Mon', ids: [] }]
    expect(todayIndex(shifted, new Date(2026, 7, 24))).toBe(2)   // Monday
    expect(todayIndex(shifted, new Date(2026, 7, 26))).toBe(0)   // Wednesday
  })

  it('always returns a real integer, so the caller always has one', () => {
    expect(todayIndex([], new Date(2026, 7, 24))).toBe(0)
    expect(todayIndex(undefined, new Date(2026, 7, 24))).toBe(0)
    expect(Number.isInteger(todayIndex(named))).toBe(true)
  })
})

/* ── Which recipe asked for which amount ──────────────────────────────
 *
 * The expander lists each quantity beside the meal that needs it. A card
 * can contribute more than one line, so `meals` cannot be indexed
 * against `qty` — that is the off-by-one that puts Tuesday's amount under
 * Monday's recipe. `qtyFrom` runs parallel to `qty` instead.
 */
describe('qtyFrom pairs every quantity with its source recipe', () => {
  const week = plan([[1, 2], [3, 4]])

  it('is the same length as qty, on every row', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), 0)
    expect(rows.length).toBeGreaterThan(20)
    for (const r of rows) expect(r.qtyFrom).toHaveLength(r.qty.length)
  })

  it('names only recipes that are actually on that day', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), 0)
    const onMonday = new Set([1, 2])
    let seen = 0
    for (const r of rows) for (const id of r.qtyFrom) { seen++; expect(onMonday.has(id)).toBe(true) }
    expect(seen).toBeGreaterThan(0)
  })

  /* THE CASE THAT DECIDES THE SHAPE. Two recipes both needing chicken
     breast contribute one quantity line each; the row must be able to
     say which is which. */
  it('keeps two lines apart when two meals need the same item', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), 0)
    const shared = rows.find(r => r.qty.length > 1)
    expect(shared, 'no row on Monday carries two quantities').toBeTruthy()
    expect(new Set(shared.qtyFrom).size).toBe(shared.qtyFrom.length)
    expect(shared.qtyFrom.every(id => shared.meals.includes(id))).toBe(true)
  })

  it('stays empty where the section carries no quantities', () => {
    const rows = buildGroceryItems(week, catalog, new Set(), 0)
    const qtySections = new Set(catalog.quantitySections)
    for (const r of rows) {
      if (qtySections.has(r.section)) continue
      expect(r.qtyFrom).toHaveLength(0)
    }
  })
})
