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

export function removeLS(key) {
  try { localStorage.removeItem(key); return true } catch { return false }
}

export function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/* ── The grocery list ──────────────────────────────────────────────────
 *
 * Moved out of Grocery.jsx because this is where a silent wrong answer
 * lives. The old version listed RECIPES — it built one row per meal and
 * called them groceries — so the screen showed twelve dish names and no
 * food. Everything below derives the actual shopping list from the
 * generated catalog.
 *
 * MERGING IS A VIEW, NEVER A LOSS. One row per thing you buy, merged
 * across meals and across sub-recipe sections, but every contributing
 * meal and raw quantity line stays attached to the row so the expanded
 * chip can answer "why" and "how much".
 */

/** One shopping row per item, for ONE day.
 *
 *  The redesign scopes the list to a chosen day rather than the week:
 *  quantities differ per day, and a week-wide list cannot say how much
 *  of anything Thursday actually needs.
 *
 *  @param weekPlan  [{day, ids:[recipeId|null]}]
 *  @param catalog   src/data/groceryCatalog.json
 *  @param excluded  Set of `dayIndex:itemId` keys the user cleared. Ids,
 *                   never names — the normaliser has changed on nearly
 *                   every pass of this work and a name key would break
 *                   each time.
 *  @param dayIndex  ALWAYS A REAL INTEGER. `null -> today` is resolved at
 *                   the call site in the store, deliberately: keeping
 *                   date resolution out of this function keeps it pure
 *                   and testable, and gives the UTC bug that once lived
 *                   in date handling no surface here.
 */
/** Which index in weekPlan is today.
 *
 *  PURE, AND TAKES THE DATE. buildGroceryItems must never resolve this
 *  itself — the whole reason dayIndex is a required integer is to keep
 *  date handling out of the derivation, where a UTC bug once lived in
 *  this codebase and was invisible for months.
 *
 *  Matches on the plan's own day labels rather than assuming Monday is
 *  index 0, so reordering the week is a data change and not a hunt for
 *  an off-by-one.
 *
 *  Returns 0 when today is not in the plan, so a caller always has a
 *  real integer to pass. */
export function todayIndex(weekPlan = [], date = new Date()) {
  const label = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  const i = weekPlan.findIndex(d => String(d?.day || '').toLowerCase().startsWith(label))
  return i >= 0 ? i : 0
}

export function buildGroceryItems(weekPlan = [], catalog = {}, excluded = new Set(), dayIndex) {
  const byCard = catalog.byCard || {}
  const meta = catalog.items || {}
  const day = Array.isArray(weekPlan) ? weekPlan[dayIndex] : undefined
  if (!day) return []                                // out of range is an empty day

  const rows = new Map()
  const seenCards = new Set()

  for (const rid of day.ids || []) {
    if (!rid || seenCards.has(rid)) continue          // a recipe twice in one day is one shop
    seenCards.add(rid)
    for (const entry of byCard[String(rid)] || []) {
      if (excluded.has(dayKey(dayIndex, entry.id))) continue
      const info = meta[String(entry.id)]
      if (!info) continue                             // retired id, no longer stocked
      let row = rows.get(entry.id)
      if (!row) {
        row = { id: entry.id, name: info.name, section: info.section,
                meals: [], qty: [], qtyFrom: [] }
        rows.set(entry.id, row)
      }
      row.meals.push(rid)
      /* LISTED, NEVER SUMMED. "1 cup" + "200g" + "2 cloves" has no
         answer without unit conversion, so the summed reading of the
         handoff is under-defined rather than merely less specific.

         `qtyFrom` runs PARALLEL to `qty`, one recipe id per line, because
         the expander shows each quantity beside the meal that needs it.
         A card can contribute more than one line, so `meals` cannot be
         indexed against `qty` — pairing them by position is exactly the
         off-by-one that shows Tuesday's amount under Monday's recipe. */
      for (const q of entry.qty || []) { row.qty.push(q); row.qtyFrom.push(rid) }
    }
  }
  return [...rows.values()]
}

/** Group rows into the shop's walk order.
 *
 *  Order comes from the catalog, not from a constant here, so making it
 *  a user preference later is a write rather than a refactor. Empty
 *  sections are dropped except Other, which is always shown: an item the
 *  map could not place is still an item you are buying.
 */
export function groupBySection(rows = [], catalog = {}) {
  const order = catalog.sectionOrder || []
  const hideWhenEmpty = new Set(catalog.hideWhenEmpty || [])
  const collapsed = new Set(catalog.collapsedByDefault || [])
  const bucket = new Map(order.map(s => [s, []]))
  for (const r of rows) {
    if (!bucket.has(r.section)) bucket.set(r.section, [])
    bucket.get(r.section).push(r)
  }
  const out = []
  for (const name of order) {
    const items = (bucket.get(name) || [])
      .sort((a, b) => b.meals.length - a.meals.length || a.name.localeCompare(b.name))
    if (!items.length && hideWhenEmpty.has(name)) continue
    out.push({ name, items, collapsed: collapsed.has(name) })
  }
  return out
}

/* ── THE STORED KEY SPACE ─────────────────────────────────────────────
 *
 * Checks and exclusions are both sets of `dayIndex:itemId`, and both are
 * stored the same way. Two version bumps, both resets.
 *
 * CHECKS: v2 -> v3. A check was week-wide and keyed on a bare item id.
 * It has no day to belong to, and quantities differ per day, so a global
 * check claims "bought" against a row that still needs a different
 * amount. There is no honest mapping from one bare id to seven possible
 * days, so the old keys are dropped rather than migrated.
 *
 * EXCLUSIONS: also v2 -> v3, and NOT v1 -> v2 as the phase plan said.
 * Exclusions never had a version constant of their own — they reused
 * CHECKS_VERSION and are on disk today carrying `version: 2`. Setting
 * EXCLUDED_VERSION to 2 would have read every existing bare-id exclusion
 * back as valid, where it would match nothing and clear nothing: a
 * migration that looks like a reset and is not one. Separate constants
 * so the two can drift apart later; both past 2 so both actually reset.
 *
 * `ids` becomes `keys` in the same bump. The field holds strings now and
 * calling them ids was how the last defect read as correct. A rollback
 * to v2 code finds no `ids` and no matching version, and shows an empty
 * list rather than garbage. Writes REPLACE, so old keys cannot linger. */
export const CHECKS_VERSION = 3
export const EXCLUDED_VERSION = 3

/** `dayIndex:itemId` — the one key both stores use, so clearing
 *  Thursday leaves Friday's list intact.
 *
 *  Built here and nowhere else. Two hand-built strings is how a key ends
 *  up half-applied: the reading side excluding correctly while the
 *  writing side emits something that never matches. */
export const dayKey = (dayIndex, itemId) => `${dayIndex}:${itemId}`

/** Is this a key this app wrote?
 *
 *  ONE VALIDATOR, USED BY BOTH SIDES. `readChecks` and `writeChecks`
 *  each carried their own `.filter(Number.isInteger)`, and that is the
 *  shape of the bug this closes — two filters that can drift apart did
 *  drift apart, leaving a reader that wanted `"1:13"` and a writer that
 *  emitted `13`. The suite stayed green and Clear silently stopped
 *  removing anything.
 *
 *  Structural, not a regex: split on the separator and require both
 *  halves to be integers IN CANONICAL FORM. The round-trip through
 *  Number is what does that work — it rejects `" 1"`, `"1.0"`, `"01"`,
 *  `"1e3"` and `""`, all of which coerce to a number happily and none of
 *  which this app ever wrote. A pattern that merely looks for digits
 *  would accept them and store keys that never match. */
const isCanonicalInt = part => {
  const n = Number(part)
  return Number.isInteger(n) && String(n) === part
}

export function isDayKey(k) {
  if (typeof k !== 'string') return false
  const parts = k.split(':')
  return parts.length === 2 && parts.every(isCanonicalInt)
}

export function readChecks(doc, version) {
  if (!doc || doc.version !== version) return new Set()
  return new Set((doc.keys || []).filter(isDayKey))
}

/* NO SORT. It used to end `.sort((a, b) => a - b)`, which on strings
   returns NaN for every comparison — a sort that silently does nothing
   while reading as though it orders the file. Storage order is cosmetic,
   so dropping it is the honest version. */
export function writeChecks(keys, version) {
  return { version, keys: [...keys].filter(isDayKey) }
}

/* ── WHOSE DATA IS THIS? ──────────────────────────────────────────────
 *
 * Every localStorage key is scoped to an owner. They were not:
 * `prepiq_goals`, `prepiq_weekplan`, `prepiq_favorites` and both grocery
 * keys were global, and only the meal log interpolated anything — and
 * that was a date, not a user.
 *
 * That was MASKED, not harmless. Hydration waited for Firestore, which
 * overwrote whatever localStorage held, so on a shared device user B saw
 * their own data a beat later. Making hydration synchronous EXPOSES it:
 * user B would open the app to user A's plan and see it until the cloud
 * read lands. The scoping is a fix for a latent bug, not a precaution
 * against a new one.
 */
export const ANON = 'anon'
export const scopeOf = uid => uid || ANON
export const lsKey = (uid, name) => `prepiq_${scopeOf(uid)}_${name}`

/* ── ADOPTING SIGNED-OUT WORK ─────────────────────────────────────────
 *
 * Signed-out work is real work. Someone plans a week on the train, then
 * signs up — the plan has to follow them into the account, or signing up
 * is punished.
 *
 * PER KEY, NOT ALL-OR-NOTHING. Each name is decided on its own: adopt
 * only where the account has no answer of its own. All-or-nothing would
 * mean one populated field on the account blocking five empty ones, or
 * one empty field letting anon overwrite five populated ones.
 *
 * THE EMPTINESS TEST IS resolveField's — nullish, and nothing else. `[]`,
 * `0` and `''` are answers somebody gave. An account whose favourites are
 * deliberately empty must not have anon's favourites poured into it.
 *
 * GROCERY IS NOT ADOPTED. Checks and exclusions are transient state about
 * one shop on one day, keyed by a day index that means nothing across a
 * sign-in boundary. The same reason both are reset rather than migrated.
 */
export const ADOPTABLE = ['goals', 'weekplan', 'favorites']
export const NEVER_ADOPTED = ['grocery', 'grocery_excluded']
export const adoptedMarker = uid => `prepiq_anon_adopted_${uid}`

/** Copy anon-scoped values into `uid`'s scope, once, per key.
 *
 *  IDEMPOTENT BY MARKER, not by comparing values. A second run must be a
 *  no-op even when it would be harmless, because "harmless" stops being
 *  true the moment the user edits after signing in: without the marker,
 *  a later re-entry would look at an account key the user had since
 *  cleared, find it empty, and pour the stale anon value back in.
 *
 *  The anon keys are LEFT IN PLACE. Signing out returns you to them, and
 *  a device is often shared with the same person's signed-out self. */
export function adoptAnonKeys(uid, names = ADOPTABLE) {
  if (!uid) return { adopted: [], skipped: [], alreadyRun: false }
  if (loadLS(adoptedMarker(uid), null) != null) {
    return { adopted: [], skipped: [...names], alreadyRun: true }
  }
  const adopted = [], skipped = []
  for (const name of names) {
    if (NEVER_ADOPTED.includes(name)) { skipped.push(name); continue }
    const theirs = loadLS(lsKey(null, name), null)
    if (theirs == null) { skipped.push(name); continue }      // nothing to bring
    const mine = loadLS(lsKey(uid, name), null)
    if (mine != null) { skipped.push(name); continue }        // the account already answered
    saveLS(lsKey(uid, name), theirs)
    adopted.push(name)
  }
  saveLS(adoptedMarker(uid), true)
  return { adopted, skipped, alreadyRun: false }
}

/* ── BOOTING WITHOUT THE NETWORK ──────────────────────────────────────
 *
 * Hydration used to wait for `onAuthStateChanged`, which waits for
 * Firebase, which on a cold start in a shop with one bar is the
 * difference between a list and a spinner. The data was already on the
 * device the whole time.
 *
 * The catch is that at construction nobody knows WHOSE data to read —
 * auth has not resolved. Reading the anon scope would show a signed-in
 * user a stranger's app for a beat, which is the shared-device bug this
 * migration just fixed, reintroduced from the other end. So the last
 * signed-in uid is remembered, unscoped, and the boot reads that scope.
 *
 * If auth then resolves to somebody else — or to nobody — the store
 * reloads from the right scope and the optimism costs one render. It is
 * an optimistic read of a value Firebase itself persists locally, so it
 * is right on every launch except the one after a sign-out elsewhere. */
export const LAST_UID = 'prepiq_last_uid'
export const lastScope = () => loadLS(LAST_UID, null)
export const rememberScope = uid =>
  uid ? saveLS(LAST_UID, uid) : removeLS(LAST_UID)

/** Everything this app keeps, read out of one scope in one go. */
export function hydrateLocal(uid, date, defaults = {}) {
  return {
    goals:           loadLS(lsKey(uid, 'goals'), defaults.goals),
    mealLog:         loadLS(lsKey(uid, `log_${date}`), []),
    weekPlan:        loadLS(lsKey(uid, 'weekplan'), defaults.weekPlan),
    favorites:       arrayToSet(loadLS(lsKey(uid, 'favorites'), [])),
    groceryChecks:   readChecks(loadLS(lsKey(uid, 'grocery'), null), CHECKS_VERSION),
    groceryExcluded: readChecks(loadLS(lsKey(uid, 'grocery_excluded'), null), EXCLUDED_VERSION),
  }
}

/* ── WHAT WAS PLANNED VS WHAT WAS EATEN ───────────────────────────────
 *
 * Today shows the day's planned meals and marks the ones already logged.
 * Track shows the same pairing from the other side: what is planned and
 * NOT yet logged is the `PLANNED · ONE TAP TO LOG` list, and what was
 * logged without being planned is `ALSO LOGGED`.
 *
 * ONE FUNCTION, because the two screens must agree. Two implementations
 * of "is this planned meal logged yet?" is how Today shows a meal ticked
 * while Track still offers to log it — and the user taps, and it is
 * logged twice.
 *
 * PAIRING IS ONE-TO-ONE AND ORDER-STABLE. A day planning the same recipe
 * twice, with one of them eaten, must show one done and one to go — so a
 * log entry is CONSUMED by the first planned slot that matches it and is
 * not offered to the second. Matching on "does any log mention this
 * recipe" would tick both.
 *
 * Nothing here reads the clock or the store; it is given the day's ids
 * and the log, and returns the pairing.
 */
export function planVsLog(plannedIds = [], mealLog = []) {
  const spare = mealLog.map(entry => ({ entry, taken: false }))

  const planned = []
  for (let slot = 0; slot < plannedIds.length; slot++) {
    const recipeId = plannedIds[slot]
    if (!recipeId) continue                          // an empty slot is not a meal
    const hit = spare.find(s => !s.taken && s.entry?.recipeId === recipeId)
    if (hit) hit.taken = true
    planned.push({ recipeId, slot, log: hit ? hit.entry : null })
  }

  return {
    planned,
    /* Logged, but not against anything on the plan. */
    extras: spare.filter(s => !s.taken).map(s => s.entry),
  }
}

/** Macro totals for a set of recipe ids. */
export function sumMacros(ids = [], recipeById = {}) {
  const out = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  for (const id of ids) {
    const r = recipeById[id]
    if (!r) continue
    out.calories += r.cal || 0
    out.protein  += r.protein || 0
    out.carbs    += r.carbs || 0
    out.fat      += r.fat || 0
  }
  return out
}

/** Percentage of a goal, clamped to 100 for bar widths.
 *  Clamped so an overshoot cannot draw past the track; the NUMBER above
 *  the bar is never clamped, because going over is worth seeing. */
export function pct(value, goal) {
  if (!goal || goal <= 0) return 0
  return Math.min(100, Math.round((value / goal) * 100))
}
