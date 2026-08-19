/* THE PURE PARTS OF THE STORE.
 *
 * Split out of useAppStore.jsx so they can be tested without booting
 * Firebase. useAppStore imports `../firebase` at module load, which
 * initialises a real app — that single import is why none of this logic
 * was covered, and every rule below is one where a wrong answer is
 * silent rather than loud.
 *
 * Nothing here touches React, Firestore, or module-level state. The one
 * concession is localStorage, which is read through the two helpers at
 * the bottom and stubbed in tests.
 */

/** Today as YYYY-MM-DD in the DEVICE'S timezone, read at call time.
 *
 *  Replaces `new Date().toISOString().slice(0, 10)` held in a module
 *  constant, which was wrong twice over:
 *
 *    1. toISOString() is UTC. West of Greenwich the date rolls over
 *       before local midnight, so an evening meal was written to
 *       TOMORROW's log and disappeared from a screen showing today.
 *    2. Computed once at module load. This is a PWA and stays open;
 *       running past midnight, every write still landed on the day the
 *       app was opened.
 *
 *  Local parts, and a function rather than a constant — the second
 *  fault is why a corrected one-liner would still have been wrong.
 */
export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Pick between what the cloud returned and what this device has.
 *
 *  THE CLOUD WINS UNLESS IT IS NULLISH, and the sharp edge is that
 *  `[]`, `0` and `''` are NOT nullish. That is deliberate and load
 *  bearing: an empty array is a real answer — "you cleared everything"
 *  — and falling back to localStorage there would resurrect the values
 *  the user just removed.
 *
 *  It is also the mechanism behind the sync bug this store had. When a
 *  cloud write failed, the device held the new value and the cloud held
 *  the old one, and this rule handed back the old one on next load with
 *  nothing on screen to explain it. The rule is right; the silence was
 *  the bug, and cloudWrite now surfaces it.
 *
 *  The fallback is a THUNK so localStorage is not read and parsed when
 *  the cloud already answered.
 *
 *  @param {*} cloud      value from Firestore, or null when absent
 *  @param {() => *} localFallback  evaluated only when `cloud` is nullish
 */
export function resolveField(cloud, localFallback) {
  return cloud ?? localFallback()
}

/** Has the calendar day moved on since `since`? */
export const dayChanged = (since, now = todayISO()) => since !== now

export const setToArray = s => [...s]
export const arrayToSet = a => new Set(Array.isArray(a) ? a : [])

/* localStorage is a browser global and can throw: disabled in private
   mode, quota exceeded, or holding malformed JSON from an older build.
   Both helpers swallow deliberately — persistence is best-effort here,
   and the cloud is the record of truth when signed in. */
export function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
