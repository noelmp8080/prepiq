import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  todayISO, resolveField, dayChanged, setToArray, arrayToSet, loadLS, saveLS,
  lsKey, scopeOf, ANON, adoptAnonKeys, adoptedMarker, ADOPTABLE, NEVER_ADOPTED,
  planVsLog, sumMacros, pct,
  normalizeWeekPlan, danglingPlanIds, buildGroceryItems,
  isItemKey, isDayKey, readHidden, writeHidden, writeChecks,
  HIDDEN_VERSION, EXCLUDED_VERSION, dayKey,
} from '../store/storeLogic'
import { recipeById } from '../data/recipes'
import { groupsForDay } from '../lib/groceryByDay'
import catalog from '../data/groceryCatalog.json'

/* The shipped default, duplicated here rather than exported from the
   store: importing useAppStore would pull firebase into a pure suite. */
const DEFAULT_PLAN = (() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const SEED = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, null], [12, null]]
  return days.map((day, i) => ({ day, ids: SEED[i] }))
})()

/* THE RULES WHERE A WRONG ANSWER IS SILENT.
 *
 * Every bug found in this store so far has been of one kind: something
 * resolving to the wrong value with nothing on screen to say so. A
 * cleared grocery list that came back, a meal logged to tomorrow, a
 * failed write reported to the console. None of them threw.
 *
 * These cover the arithmetic of that, not the UI.
 */

describe('resolveField — the cloud wins unless it is nullish', () => {
  const local = () => 'FROM_DEVICE'

  it('takes the cloud value when there is one', () => {
    expect(resolveField('FROM_CLOUD', local)).toBe('FROM_CLOUD')
  })

  it('falls back when the document is missing (null)', () => {
    expect(resolveField(null, local)).toBe('FROM_DEVICE')
  })

  it('falls back when the field is absent (undefined)', () => {
    expect(resolveField(undefined, local)).toBe('FROM_DEVICE')
  })

  /* THE SHARP EDGE, and the one that matters most here. An empty array
     is a real answer — "you cleared everything" — so it must WIN. If it
     fell back, clearing the grocery list would resurrect the checks
     from localStorage on the next load. */
  it('an empty array is an answer, not an absence', () => {
    const empty = []
    expect(resolveField(empty, local)).toBe(empty)
  })

  it('so are 0, empty string and false', () => {
    expect(resolveField(0, local)).toBe(0)
    expect(resolveField('', local)).toBe('')
    expect(resolveField(false, local)).toBe(false)
  })

  it('does not read the device when the cloud answered', () => {
    const spy = vi.fn(() => 'FROM_DEVICE')
    resolveField(['a'], spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('reads the device exactly once when it must', () => {
    const spy = vi.fn(() => 'FROM_DEVICE')
    expect(resolveField(null, spy)).toBe('FROM_DEVICE')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

/* THE BUG THIS STORE SHIPPED WITH, replayed through the real function
   rather than a script. A failed cloud write leaves the device holding
   the new value and the cloud holding the old one; resolveField hands
   back the old one, because that is what it is for. The rule is right —
   the silence was the bug, which is why cloudWrite now reports. */
describe('a failed cloud write, then a reload', () => {
  const CLEARED = []
  const STALE = ['recipe_1', 'recipe_2']

  it('restores the stale cloud value, which is why the failure must be visible', () => {
    const cloudStillHasOldIds = STALE
    expect(resolveField(cloudStillHasOldIds, () => CLEARED)).toBe(STALE)
  })

  it('and keeps the clear when the write succeeded — the control', () => {
    const cloudAcceptedTheClear = []
    expect(resolveField(cloudAcceptedTheClear, () => STALE)).toEqual([])
  })
})

describe('todayISO — local parts, never UTC', () => {
  it('formats zero-padded YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  /* THE ORIGINAL BUG. 22:30 on 14 August, in any timezone west of
     Greenwich, is already the 15th in UTC — so an evening meal was
     logged to tomorrow and vanished from a screen showing today.
     Constructed with local parts, so the Date IS 22:30 local wherever
     this runs. */
  it('an evening date stays on today, where toISOString would not', () => {
    const evening = new Date(2026, 7, 14, 22, 30)
    expect(todayISO(evening)).toBe('2026-08-14')
  })

  it('and the two genuinely disagree when the machine is west of UTC', () => {
    const evening = new Date(2026, 7, 14, 22, 30)
    const utc = evening.toISOString().slice(0, 10)
    /* NOT asserted as a fixed inequality: this suite has to pass in any
       timezone, including UTC and east of it where the two agree. What
       is asserted is that todayISO tracks the LOCAL day either way. */
    if (evening.getTimezoneOffset() > 0) {
      expect(utc).toBe('2026-08-15')          // west of Greenwich: they differ
      expect(todayISO(evening)).not.toBe(utc)
    }
    expect(todayISO(evening)).toBe('2026-08-14')
  })

  it('is read at call time, not frozen — the second half of the fix', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 7, 14, 23, 59, 30))
      const before = todayISO()
      vi.setSystemTime(new Date(2026, 7, 15, 0, 0, 30))
      const after = todayISO()
      expect(before).toBe('2026-08-14')
      expect(after).toBe('2026-08-15')
      expect(before).not.toBe(after)
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles a month and a year boundary', () => {
    expect(todayISO(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31')
    expect(todayISO(new Date(2026, 1, 1, 0, 1))).toBe('2026-02-01')
    expect(todayISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
    expect(todayISO(new Date(2027, 0, 1, 0, 1))).toBe('2027-01-01')
  })

  it('handles 29 February in a leap year', () => {
    expect(todayISO(new Date(2028, 1, 29, 12, 0))).toBe('2028-02-29')
  })
})

describe('dayChanged', () => {
  it('is false within a day and true across one', () => {
    expect(dayChanged('2026-08-14', '2026-08-14')).toBe(false)
    expect(dayChanged('2026-08-14', '2026-08-15')).toBe(true)
  })

  it('defaults its second argument to now', () => {
    expect(dayChanged(todayISO())).toBe(false)
    expect(dayChanged('1999-01-01')).toBe(true)
  })
})

describe('set and array conversion', () => {
  it('round-trips', () => {
    expect(setToArray(arrayToSet(['a', 'b']))).toEqual(['a', 'b'])
  })

  /* Firestore returns undefined for a field that was never written, and
     the load path feeds that straight in. */
  it('treats a missing array as empty rather than throwing', () => {
    expect(arrayToSet(undefined).size).toBe(0)
    expect(arrayToSet(null).size).toBe(0)
    expect(arrayToSet('not an array').size).toBe(0)
  })

  it('de-duplicates, since these are check ids', () => {
    expect(setToArray(arrayToSet(['a', 'a', 'b']))).toEqual(['a', 'b'])
  })
})

describe('loadLS / saveLS', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a value', () => {
    expect(saveLS('k', { a: 1 })).toBe(true)
    expect(loadLS('k', 'FALLBACK')).toEqual({ a: 1 })
  })

  it('returns the fallback for a key that was never written', () => {
    expect(loadLS('absent', 'FALLBACK')).toBe('FALLBACK')
  })

  /* An older build, a half-written value, a user editing devtools. */
  it('returns the fallback rather than throwing on malformed JSON', () => {
    localStorage.setItem('bad', '{not json')
    expect(loadLS('bad', 'FALLBACK')).toBe('FALLBACK')
  })

  it('reports failure instead of throwing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(saveLS('k', { a: 1 })).toBe(false)
  })

  it('survives a read throwing, too', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(loadLS('k', 'FALLBACK')).toBe('FALLBACK')
  })

  /* A STORED null IS NOT THE SAME AS AN ABSENT KEY, and this pins the
     difference because it is not the obvious behaviour.

     `raw == null` catches the MISSING key, where getItem returns null.
     A key holding the string "null" is a hit: raw is "null", which is
     not == null, so it parses to null and null is returned — the
     fallback never runs.

     Harmless today because nothing writes null: arrayToSet(null) is an
     empty set, and the fields that could not survive a null (weekPlan,
     goals) are only ever written whole objects. It is asserted so that
     if something does start writing null, the surprise is here rather
     than in a component reading .map of it. */
  it('a stored null reads back as null, NOT as the fallback', () => {
    saveLS('n', null)
    expect(loadLS('n', 'FALLBACK')).toBe(null)
  })

  it('whereas an absent key does use the fallback — the distinction', () => {
    expect(loadLS('never-written', 'FALLBACK')).toBe('FALLBACK')
  })
})

/* ── KEY SCOPING AND ADOPTION ─────────────────────────────────────────
 *
 * Both go through real localStorage, because both are about what is on
 * disk and a test that stubbed storage would prove nothing about it.
 */
describe('every key belongs to somebody', () => {
  beforeEach(() => localStorage.clear())

  it('scopes anonymous work under anon and an account under its uid', () => {
    expect(scopeOf(null)).toBe(ANON)
    expect(scopeOf(undefined)).toBe(ANON)
    expect(scopeOf('')).toBe(ANON)
    expect(scopeOf('u1')).toBe('u1')
    expect(lsKey(null, 'weekplan')).toBe('prepiq_anon_weekplan')
    expect(lsKey('u1', 'weekplan')).toBe('prepiq_u1_weekplan')
  })

  /* THE LATENT BUG THIS FIXES, STATED AS A TEST. The keys were global.
     That was masked while hydration waited for Firestore to overwrite
     them; making hydration synchronous would have shown user B user A's
     plan. Two users, one device, no bleed — through storage, both ways. */
  it('keeps two accounts apart on one device', () => {
    saveLS(lsKey('userA', 'weekplan'), ['A-plan'])
    saveLS(lsKey('userB', 'weekplan'), ['B-plan'])
    saveLS(lsKey(null, 'weekplan'), ['anon-plan'])

    expect(loadLS(lsKey('userA', 'weekplan'), null)).toEqual(['A-plan'])
    expect(loadLS(lsKey('userB', 'weekplan'), null)).toEqual(['B-plan'])
    expect(loadLS(lsKey(null, 'weekplan'), null)).toEqual(['anon-plan'])
    /* and nothing lives at the old global key any more */
    expect(localStorage.getItem('prepiq_weekplan')).toBe(null)
  })

  it('scopes the per-day log by user as well as by date', () => {
    expect(lsKey('u1', 'log_2026-08-25')).toBe('prepiq_u1_log_2026-08-25')
    expect(lsKey(null, 'log_2026-08-25')).toBe('prepiq_anon_log_2026-08-25')
  })
})

describe('adopting signed-out work on first sign-in', () => {
  const UID = 'u1'
  beforeEach(() => localStorage.clear())

  it('brings anon work into an account that has none — per key', () => {
    saveLS(lsKey(null, 'goals'), { calories: 2200 })
    saveLS(lsKey(null, 'weekplan'), ['anon-plan'])
    // favorites deliberately absent from anon

    const r = adoptAnonKeys(UID)
    expect(r.adopted.sort()).toEqual(['goals', 'weekplan'])
    expect(r.skipped).toContain('favorites')
    expect(loadLS(lsKey(UID, 'goals'), null)).toEqual({ calories: 2200 })
    expect(loadLS(lsKey(UID, 'weekplan'), null)).toEqual(['anon-plan'])
    expect(loadLS(lsKey(UID, 'favorites'), null)).toBe(null)
  })

  /* PER KEY, NOT ALL-OR-NOTHING. One populated account field must not
     block the empty ones, and one empty account field must not let anon
     overwrite the populated ones. Both directions in one case. */
  it('decides each key on its own', () => {
    saveLS(lsKey(null, 'goals'), { calories: 2200 })
    saveLS(lsKey(null, 'weekplan'), ['anon-plan'])
    saveLS(lsKey(UID, 'weekplan'), ['account-plan'])      // account already answered

    const r = adoptAnonKeys(UID)
    expect(r.adopted).toEqual(['goals'])
    expect(loadLS(lsKey(UID, 'weekplan'), null)).toEqual(['account-plan'])   // not overwritten
    expect(loadLS(lsKey(UID, 'goals'), null)).toEqual({ calories: 2200 })    // still adopted
  })

  /* THE EMPTINESS TEST IS resolveField's — nullish and nothing else. An
     account whose favourites are deliberately empty gave an answer. */
  it('treats an empty array as an answer, not as absence', () => {
    saveLS(lsKey(null, 'favorites'), [7, 9])
    saveLS(lsKey(UID, 'favorites'), [])

    expect(adoptAnonKeys(UID).adopted).toEqual([])
    expect(loadLS(lsKey(UID, 'favorites'), null)).toEqual([])
  })

  it('runs once, by marker, even when a second run would look harmless', () => {
    saveLS(lsKey(null, 'goals'), { calories: 2200 })
    expect(adoptAnonKeys(UID).adopted).toEqual(['goals'])
    expect(loadLS(adoptedMarker(UID), null)).toBe(true)

    /* the user then clears their goals inside the account */
    localStorage.removeItem(lsKey(UID, 'goals'))
    const second = adoptAnonKeys(UID)
    expect(second.alreadyRun).toBe(true)
    expect(second.adopted).toEqual([])
    /* without the marker this is where the stale anon value comes back */
    expect(loadLS(lsKey(UID, 'goals'), null)).toBe(null)
  })

  it('marks a run even when it adopted nothing, so it cannot re-arm', () => {
    expect(adoptAnonKeys(UID).adopted).toEqual([])
    saveLS(lsKey(null, 'goals'), { calories: 9999 })
    expect(adoptAnonKeys(UID).alreadyRun).toBe(true)
    expect(loadLS(lsKey(UID, 'goals'), null)).toBe(null)
  })

  it('is per uid — a second account on the device adopts on its own', () => {
    saveLS(lsKey(null, 'goals'), { calories: 2200 })
    adoptAnonKeys('userA')
    expect(loadLS(lsKey('userA', 'goals'), null)).toEqual({ calories: 2200 })
    expect(loadLS(lsKey('userB', 'goals'), null)).toBe(null)

    adoptAnonKeys('userB')
    expect(loadLS(lsKey('userB', 'goals'), null)).toEqual({ calories: 2200 })
  })

  /* GROCERY IS NEVER ADOPTED. Checks and exclusions are transient state
     about one shop on one day, keyed by a day index that means nothing
     across a sign-in. Asserted even when asked for explicitly, so the
     exclusion cannot be defeated by widening the caller's list. */
  it('refuses grocery state even when it is named', () => {
    saveLS(lsKey(null, 'grocery'), { version: 3, keys: ['0:1'] })
    saveLS(lsKey(null, 'grocery_excluded'), { version: 3, keys: ['0:2'] })

    expect(ADOPTABLE).not.toContain('grocery')
    expect(ADOPTABLE).not.toContain('grocery_excluded')
    const r = adoptAnonKeys(UID, [...ADOPTABLE, ...NEVER_ADOPTED])
    expect(r.adopted).toEqual([])
    expect(loadLS(lsKey(UID, 'grocery'), null)).toBe(null)
    expect(loadLS(lsKey(UID, 'grocery_excluded'), null)).toBe(null)
  })

  /* Signing out returns you to the anon scope, so the source keys stay.
     A device is often shared with the same person's signed-out self. */
  it('leaves the anon keys in place', () => {
    saveLS(lsKey(null, 'weekplan'), ['anon-plan'])
    adoptAnonKeys(UID)
    expect(loadLS(lsKey(null, 'weekplan'), null)).toEqual(['anon-plan'])
  })

  it('does nothing without a uid', () => {
    saveLS(lsKey(null, 'goals'), { calories: 2200 })
    expect(adoptAnonKeys(null).adopted).toEqual([])
    expect(adoptAnonKeys(undefined).alreadyRun).toBe(false)
  })
})

/* ── The pairing Today and Track share ────────────────────────────────
 *
 * Both screens ask the same question from opposite sides, so they run
 * the same function. Two implementations is how Today ticks a meal while
 * Track still offers to log it — and the tap logs it twice.
 */
describe('planVsLog', () => {
  const log = (recipeId, id = String(recipeId)) => ({ id, recipeId })

  it('marks a planned meal as logged', () => {
    const { planned, extras } = planVsLog([1, 2], [log(1)])
    expect(planned).toHaveLength(2)
    expect(planned[0]).toMatchObject({ recipeId: 1, slot: 0 })
    expect(planned[0].log).toBeTruthy()
    expect(planned[1].log).toBe(null)
    expect(extras).toEqual([])
  })

  it('reports what was eaten off-plan as extras', () => {
    const { planned, extras } = planVsLog([1], [log(1), log(9)])
    expect(planned[0].log).toBeTruthy()
    expect(extras.map(e => e.recipeId)).toEqual([9])
  })

  /* THE ONE THAT DECIDES THE SHAPE. A day with the same recipe in both
     slots, one eaten, must read as one done and one to go. Matching on
     "does any log mention this recipe" ticks both, and Track then stops
     offering the second — a meal you planned and did not eat quietly
     counted as eaten. */
  it('pairs one to one when a recipe is planned twice', () => {
    const { planned, extras } = planVsLog([5, 5], [log(5)])
    expect(planned).toHaveLength(2)
    expect(planned[0].log).toBeTruthy()
    expect(planned[1].log).toBe(null)
    expect(extras).toEqual([])
  })

  it('does not consume the same log entry twice', () => {
    const one = log(5, 'only-one')
    const { planned } = planVsLog([5, 5], [one])
    const used = planned.filter(p => p.log).map(p => p.log.id)
    expect(used).toEqual(['only-one'])
  })

  it('keeps a third helping as an extra rather than losing it', () => {
    const { planned, extras } = planVsLog([5, 5], [log(5, 'a'), log(5, 'b'), log(5, 'c')])
    expect(planned.every(p => p.log)).toBe(true)
    expect(extras.map(e => e.id)).toEqual(['c'])
  })

  it('skips empty slots without giving them a row', () => {
    const { planned } = planVsLog([7, null, undefined], [])
    expect(planned).toHaveLength(1)
    expect(planned[0].slot).toBe(0)
  })

  /* The slot index is what Plan removes by, so it must survive a gap. */
  it('carries the real slot index, not the row index', () => {
    const { planned } = planVsLog([null, 7], [])
    expect(planned[0]).toMatchObject({ recipeId: 7, slot: 1 })
  })

  it('survives empty and malformed input', () => {
    expect(planVsLog()).toEqual({ planned: [], extras: [] })
    expect(planVsLog([], [])).toEqual({ planned: [], extras: [] })
    expect(planVsLog([1], [null]).planned[0].log).toBe(null)
  })
})

describe('sumMacros and pct', () => {
  const byId = { 1: { cal: 300, protein: 30, carbs: 20, fat: 10 },
                 2: { cal: 500, protein: 40, carbs: 50, fat: 15 } }

  it('adds what it recognises and ignores what it does not', () => {
    expect(sumMacros([1, 2], byId)).toEqual({ calories: 800, protein: 70, carbs: 70, fat: 25 })
    expect(sumMacros([1, 999], byId)).toEqual({ calories: 300, protein: 30, carbs: 20, fat: 10 })
    expect(sumMacros([], byId)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })

  /* The BAR is clamped so an overshoot cannot draw past its track. The
     NUMBER above it is not — going over is the thing worth seeing. */
  it('clamps the bar at 100 and never divides by a zero goal', () => {
    expect(pct(900, 1800)).toBe(50)
    expect(pct(2400, 1800)).toBe(100)
    expect(pct(1, 0)).toBe(0)
    expect(pct(1, null)).toBe(0)
    expect(pct(0, 1800)).toBe(0)
  })
})

/* ── A PLANNED ID THAT NO LONGER NAMES A RECIPE ───────────────────────
 *
 * `recipes.js` holds 260 entries over ids 1-384, so a rebuild has
 * already removed ids a stored plan may still point at. Such an id is
 * TRUTHY and resolves to nothing, and that pair is what breaks four
 * screens at once — see normalizeWeekPlan's header for the walk.
 *
 * The fixture uses 9999 rather than one of the real gaps: a gap could
 * be filled by the next catalog rebuild and quietly turn these tests
 * vacuous.
 */
describe('normalizeWeekPlan', () => {
  const BY_ID = { 1: { id: 1, name: 'One' }, 2: { id: 2, name: 'Two' } }
  const GHOST = 9999

  it('nulls an id that resolves to nothing', () => {
    const plan = [{ day: 'Mon', ids: [GHOST, 2] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual([{ day: 'Mon', ids: [null, 2] }])
  })

  it('leaves a resolvable id alone', () => {
    const plan = [{ day: 'Mon', ids: [1, 2] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual(plan)
  })

  /* recipeById is a plain object, so both forms hit the same key. A
     string id is NOT a dangling id and must not be nulled. */
  it('resolves a string id, because the lookup is a plain object', () => {
    const plan = [{ day: 'Mon', ids: ['1', '2'] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual(plan)
  })

  it('keeps an empty slot empty rather than inventing one', () => {
    const plan = [{ day: 'Sat', ids: [1, null] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual(plan)
  })

  /* null and undefined are both an empty slot and every reader treats
     them alike, so neither is converted — converting would make the
     result depend on whether a SIBLING id happened to need cleaning. */
  it('leaves an undefined slot falsy rather than converting it', () => {
    const [day] = normalizeWeekPlan([{ day: 'Sat', ids: [1, undefined] }], BY_ID)
    expect(day.ids[1]).toBeFalsy()
  })

  it('handles several dangling ids across several days', () => {
    const plan = [
      { day: 'Mon', ids: [GHOST, 2] },
      { day: 'Tue', ids: [1, GHOST] },
      { day: 'Wed', ids: [1, 2] },
    ]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual([
      { day: 'Mon', ids: [null, 2] },
      { day: 'Tue', ids: [1, null] },
      { day: 'Wed', ids: [1, 2] },
    ])
  })

  /* Returned by identity when nothing changed, so normalising on every
     load cannot cause a render by itself. */
  it('returns the SAME array when there is nothing to clean', () => {
    const plan = [{ day: 'Mon', ids: [1, 2] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toBe(plan)
  })

  it('returns a new array when it did clean something', () => {
    const plan = [{ day: 'Mon', ids: [GHOST] }]
    expect(normalizeWeekPlan(plan, BY_ID)).not.toBe(plan)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['not an array', { day: 'Mon' }],
  ])('passes %s straight back rather than throwing', (_l, v) => {
    expect(() => normalizeWeekPlan(v, BY_ID)).not.toThrow()
  })

  it('survives a day with no ids array', () => {
    const plan = [{ day: 'Mon' }, { day: 'Tue', ids: [GHOST] }]
    expect(normalizeWeekPlan(plan, BY_ID)).toEqual([{ day: 'Mon' }, { day: 'Tue', ids: [null] }])
  })

  /* An empty lookup would null the whole plan. That is correct for the
     function and is why it is called with the real map at the boundary
     rather than anywhere a lookup might not have loaded. */
  it('nulls everything when the lookup is empty — the caller owns that', () => {
    expect(normalizeWeekPlan([{ day: 'Mon', ids: [1, 2] }], {}))
      .toEqual([{ day: 'Mon', ids: [null, null] }])
  })

  it('cleans nothing in the shipped default plan', () => {
    expect(normalizeWeekPlan(DEFAULT_PLAN, recipeById)).toBe(DEFAULT_PLAN)
  })
})

describe('danglingPlanIds — for reporting, not rendering', () => {
  const BY_ID = { 1: { id: 1 }, 2: { id: 2 } }

  it('names the day, the position and the id', () => {
    const plan = [{ day: 'Mon', ids: [9999, 2] }, { day: 'Tue', ids: [1, 8888] }]
    expect(danglingPlanIds(plan, BY_ID)).toEqual([
      { dayIndex: 0, day: 'Mon', position: 0, id: 9999 },
      { dayIndex: 1, day: 'Tue', position: 1, id: 8888 },
    ])
  })

  it('is empty for a clean plan, and for nonsense', () => {
    expect(danglingPlanIds([{ day: 'Mon', ids: [1, null] }], BY_ID)).toEqual([])
    expect(danglingPlanIds(undefined, BY_ID)).toEqual([])
  })

  it('finds nothing in the shipped default plan', () => {
    expect(danglingPlanIds(DEFAULT_PLAN, recipeById)).toEqual([])
  })
})

/* ── THE THREE SCREENS THE GHOST BROKE ────────────────────────────────
 * Asserted against the DERIVATIONS rather than the DOM: these are the
 * readers, and a normalised plan is what they are promised. */
describe('a normalised plan is invisible to every reader', () => {
  const GHOST = 9999
  const raw = [{ day: 'Mon', ids: [GHOST, 1] }]
  const clean = normalizeWeekPlan(raw, recipeById)

  it('leaves the real meal and only the real meal', () => {
    expect(clean[0].ids).toEqual([null, 1])
  })

  /* assignMeal looks for the first FALSY slot. A truthy ghost makes the
     day read as full and the Add control silently do nothing; a null is
     a slot it can fill. This is the Plan half of the bug. */
  it('gives Plan a free slot again', () => {
    expect(raw[0].ids.findIndex(x => !x)).toBe(-1)      // before: reads as full
    expect(clean[0].ids.findIndex(x => !x)).toBe(0)     // after: slot 0 is free
  })

  it('stops groupsForDay building an Unknown recipe group', () => {
    expect(groupsForDay(raw, catalog, new Set(), 0)).toHaveLength(2)
    const after = groupsForDay(clean, catalog, new Set(), 0)
    expect(after).toHaveLength(1)
    expect(after[0].recipeId).toBe(1)
  })

  it('leaves buildGroceryItems unchanged either way — parity holds', () => {
    const before = buildGroceryItems(raw, catalog, new Set(), 0).map(r => r.id).sort((a, b) => a - b)
    const after = buildGroceryItems(clean, catalog, new Set(), 0).map(r => r.id).sort((a, b) => a - b)
    expect(after).toEqual(before)

    /* And the phase 1 parity still holds on the cleaned plan. */
    const grouped = [...new Set(groupsForDay(clean, catalog, new Set(), 0)
      .flatMap(g => g.items.map(i => i.itemId)))].sort((a, b) => a - b)
    expect(grouped).toEqual(after)
  })

  it('stops Today and Track pairing a meal that cannot be logged', () => {
    expect(planVsLog(raw[0].ids, []).planned.map(r => r.recipeId)).toContain(GHOST)
    expect(planVsLog(clean[0].ids, []).planned.map(r => r.recipeId)).not.toContain(GHOST)
    /* And the real meal survives the clean. */
    expect(planVsLog(clean[0].ids, []).planned.map(r => r.recipeId)).toEqual([1])
  })
})

/* ── HIDDEN IS NOT EXCLUDED ───────────────────────────────────────────
 *
 * Two stores that both take an item off the list, for different reasons
 * and with different lifetimes:
 *
 *   excluded  "I already have this, for this shop."  day-scoped,
 *             transient, wiped by START A NEW LIST.
 *   hidden    "I never need this."  global, durable, untouched by it.
 *
 * These assert the difference, because the cost of merging them is
 * silent: a durable statement stored in the transient set is erased by
 * a button whose job is to clear a shop.
 */
describe('isItemKey — the hidden key language', () => {
  it('accepts a bare canonical integer', () => {
    expect(isItemKey('13')).toBe(true)
    expect(isItemKey('0')).toBe(true)
  })

  /* The two languages cannot be confused for each other, in either
     direction. That is what stops one store reading the other's keys. */
  it('rejects a day key, and isDayKey rejects an item key', () => {
    expect(isItemKey('1:13')).toBe(false)
    expect(isDayKey('13')).toBe(false)
  })

  it.each([[' 13'], ['13.0'], ['013'], ['1e3'], [''], ['abc'], [null], [13]])(
    'rejects %p, which this app never wrote', (k) => {
      expect(isItemKey(k)).toBe(false)
    })
})

describe('readHidden / writeHidden', () => {
  it('round-trips a set of bare ids', () => {
    const doc = writeHidden(new Set(['13', '7']), HIDDEN_VERSION)
    expect(doc.version).toBe(HIDDEN_VERSION)
    expect(readHidden(doc, HIDDEN_VERSION)).toEqual(new Set(['13', '7']))
  })

  it('drops anything that is not an item key, on both sides', () => {
    expect(writeHidden(new Set(['13', '1:13', '', 'x']), HIDDEN_VERSION).keys)
      .toEqual(['13'])
    expect(readHidden({ version: HIDDEN_VERSION, keys: ['13', '1:13', 'x'] }, HIDDEN_VERSION))
      .toEqual(new Set(['13']))
  })

  it('returns empty for a document of another version', () => {
    const doc = writeHidden(new Set(['13']), HIDDEN_VERSION)
    expect(readHidden(doc, HIDDEN_VERSION + 1)).toEqual(new Set())
  })

  it('returns empty for no document at all', () => {
    expect(readHidden(null, HIDDEN_VERSION)).toEqual(new Set())
    expect(readHidden(undefined, HIDDEN_VERSION)).toEqual(new Set())
  })

  /* A check or exclusion document read as hidden yields nothing, rather
     than half-reading day keys as item ids. */
  it('cannot read the excluded store by accident', () => {
    const excl = writeChecks(new Set(['1:13', '2:13']), EXCLUDED_VERSION)
    expect(readHidden({ ...excl, version: HIDDEN_VERSION }, HIDDEN_VERSION))
      .toEqual(new Set())
  })
})

describe('hidden removes an item from both derivations', () => {
  const PLAN = [{ day: 'Mon', ids: [1, 2] }, { day: 'Tue', ids: [1, null] }]
  const NONE = new Set()
  const idOf = name => Number(Object.entries(catalog.items)
    .find(([, v]) => v.name === name)[0])

  /* An item that recipe 1 actually asks for, so the assertions are not
     about an id that was never there. */
  const victim = buildGroceryItems(PLAN, catalog, NONE, 0)[0].id

  it('has something to hide — the rest is vacuous otherwise', () => {
    expect(victim).toBeTruthy()
    expect(idOf).toBeTruthy()
  })

  it('leaves buildGroceryItems', () => {
    const before = buildGroceryItems(PLAN, catalog, NONE, 0).map(r => r.id)
    const after = buildGroceryItems(PLAN, catalog, NONE, 0, new Set([String(victim)]))
      .map(r => r.id)
    expect(before).toContain(victim)
    expect(after).not.toContain(victim)
    expect(after.length).toBe(before.length - 1)
  })

  it('leaves groupsForDay', () => {
    const after = groupsForDay(PLAN, catalog, NONE, 0, new Set([String(victim)]))
    expect(after.flatMap(g => g.items.map(i => i.itemId))).not.toContain(victim)
  })

  /* GLOBAL, NOT DAY-SCOPED. Hiding it on Monday hides it on Tuesday,
     which is the difference from an exclusion. */
  it('is gone from EVERY day, not just the one it was hidden from', () => {
    const hidden = new Set([String(victim)])
    for (let d = 0; d < PLAN.length; d++) {
      expect(buildGroceryItems(PLAN, catalog, NONE, d, hidden).map(r => r.id))
        .not.toContain(victim)
      expect(groupsForDay(PLAN, catalog, NONE, d, hidden)
        .flatMap(g => g.items.map(i => i.itemId))).not.toContain(victim)
    }
  })

  /* An exclusion, by contrast, only touches its own day. */
  it('unlike an exclusion, which stays on its day', () => {
    const excl = new Set([dayKey(0, victim)])
    expect(buildGroceryItems(PLAN, catalog, excl, 0).map(r => r.id)).not.toContain(victim)
    expect(buildGroceryItems(PLAN, catalog, excl, 1).map(r => r.id)).toContain(victim)
  })

  /* AN ITEM IN BOTH SETS LEAVES ONCE. The row is already gone; hiding
     it as well must not change any count. */
  it('does not double-count an item that is already excluded', () => {
    const excl = new Set([dayKey(0, victim)])
    const both = buildGroceryItems(PLAN, catalog, excl, 0, new Set([String(victim)]))
    const exclOnly = buildGroceryItems(PLAN, catalog, excl, 0)
    expect(both.map(r => r.id)).toEqual(exclOnly.map(r => r.id))
  })

  it('defaults to hiding nothing when the set is not passed', () => {
    expect(buildGroceryItems(PLAN, catalog, NONE, 0).length)
      .toBe(buildGroceryItems(PLAN, catalog, NONE, 0, new Set()).length)
  })

  /* The phase 1 parity still holds with BOTH sets applied. */
  it('keeps the two views agreeing, with exclusions and hidden together', () => {
    const excl = new Set([dayKey(0, buildGroceryItems(PLAN, catalog, NONE, 0)[1].id)])
    const hid = new Set([String(victim)])
    const flat = new Set(buildGroceryItems(PLAN, catalog, excl, 0, hid).map(r => r.id))
    const grouped = new Set(groupsForDay(PLAN, catalog, excl, 0, hid)
      .flatMap(g => g.items.map(i => i.itemId)))
    expect([...grouped].sort((a, b) => a - b)).toEqual([...flat].sort((a, b) => a - b))
  })
})

describe('hidden is adopted at sign-in, unlike the other two grocery keys', () => {
  /* "I never need anchovies" is a preference about the person, not
     state about one shop on one day. */
  it('is in ADOPTABLE and not in NEVER_ADOPTED', () => {
    expect(ADOPTABLE).toContain('grocery_hidden')
    expect(NEVER_ADOPTED).not.toContain('grocery_hidden')
    expect(NEVER_ADOPTED).toEqual(['grocery', 'grocery_excluded'])
  })
})
