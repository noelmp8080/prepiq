import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  todayISO, resolveField, dayChanged, setToArray, arrayToSet, loadLS, saveLS,
  lsKey, scopeOf, ANON, adoptAnonKeys, adoptedMarker, ADOPTABLE, NEVER_ADOPTED,
} from '../store/storeLogic'

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
