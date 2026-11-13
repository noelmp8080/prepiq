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

/** Remove every stored day-log in one scope; returns how many went.
 *
 *  Keys are collected BEFORE any is removed: removing while walking
 *  `localStorage.key(i)` shifts the indexes and skips every other one.
 *  Matched on the scope's own `log_` prefix, so another account's logs
 *  on a shared device are not touched. */
export function removeLocalLogs(uid) {
  const prefix = lsKey(uid, 'log_')
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
    return keys.length
  } catch {
    return 0
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

export function buildGroceryItems(weekPlan = [], catalog = {}, excluded = new Set(), dayIndex, hidden = new Set()) {
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

      /* EITHER SET REMOVES THE ITEM. Excluded is "I already have this,
         for this shop" and is day-scoped; hidden is "I never need this"
         and is global. Different reasons, same consequence: it is not
         on the list. See HIDDEN_VERSION and DEVIATIONS §22. */
      if (hidden.has(String(entry.id))) continue

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

/* ── HIDDEN IS NOT EXCLUDED ───────────────────────────────────────────
 *
 * Two stores, two meanings, and merging them would lose one:
 *
 *   EXCLUDED  "I already have this, for this shop."  Day-scoped,
 *             transient, written by Clear, wiped by START A NEW LIST.
 *   HIDDEN    "I never need this."  Global per item, durable, written
 *             one row at a time, and START A NEW LIST does not touch it.
 *
 * That last line is the whole reason this is a second set rather than a
 * widening of the first: a durable statement stored in the transient
 * set would be erased by a button whose job is to clear the shop.
 *
 * VERSION 1, and no bump anywhere else. Nothing existing changes shape,
 * so no stored exclusion or check is invalidated by this arriving.
 */
export const HIDDEN_VERSION = 1

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

/** A HIDDEN key: one bare item id, no day.
 *
 *  Same canonical-integer rule as above, and one part rather than two —
 *  which is also what keeps the two stores from ever reading each
 *  other's keys. A `dayIndex:itemId` fails this; a bare id fails
 *  `isDayKey`. They cannot be confused by accident. */
export function isItemKey(k) {
  return typeof k === 'string' && isCanonicalInt(k)
}

/* ONE BODY, TWO KEY LANGUAGES. Checks and exclusions speak
   `dayIndex:itemId`; the hidden set speaks a bare item id. The shape is
   the only difference, so the validator is the parameter and everything
   else — the version gate first, the filter on both sides — is shared.
   Two copies of this is how a reader and a writer drift apart, which is
   the bug `isDayKey` was written to close. */
function readKeyed(doc, version, valid) {
  if (!doc || doc.version !== version) return new Set()
  return new Set((doc.keys || []).filter(valid))
}

export function readChecks(doc, version) {
  return readKeyed(doc, version, isDayKey)
}

/** The HIDDEN set — bare item ids, no day. See HIDDEN_VERSION. */
export function readHidden(doc, version) {
  return readKeyed(doc, version, isItemKey)
}

/* NO SORT. It used to end `.sort((a, b) => a - b)`, which on strings
   returns NaN for every comparison — a sort that silently does nothing
   while reading as though it orders the file. Storage order is cosmetic,
   so dropping it is the honest version. */
export function writeChecks(keys, version) {
  return { version, keys: [...keys].filter(isDayKey) }
}

export function writeHidden(keys, version) {
  return { version, keys: [...keys].filter(isItemKey) }
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
/* grocery_hidden IS adopted, unlike the other two grocery keys:
   "I never need anchovies" is a preference about the person, not state
   about one shop on one day, so it should survive signing in. */
/* `planstart` travels with `weekplan`: the start date is what the plan's
   day order was rotated to, and one without the other reorders a week. */
export const ADOPTABLE = ['goals', 'weekplan', 'planstart', 'favorites', 'grocery_hidden']
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
    planStart:       loadLS(lsKey(uid, 'planstart'), null),
    favorites:       arrayToSet(loadLS(lsKey(uid, 'favorites'), [])),
    groceryChecks:   readChecks(loadLS(lsKey(uid, 'grocery'), null), CHECKS_VERSION),
    groceryExcluded: readChecks(loadLS(lsKey(uid, 'grocery_excluded'), null), EXCLUDED_VERSION),
    groceryHidden:   readHidden(loadLS(lsKey(uid, 'grocery_hidden'), null), HIDDEN_VERSION),
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

/* ── THE RAIL IS A CHOICE, NOT A BREAKPOINT ───────────────────────────
 *
 * The handoff is explicit that rail width is "a user choice rather than
 * a function of screen size", and it is available on BOTH wide surfaces.
 * So it cannot be derived from the viewport — it has to be stored.
 *
 * `null` means "never chosen", and only then does the surface decide:
 * expanded on desktop, collapsed on iPad. The moment the user touches
 * the control it becomes a real boolean and the surface stops having an
 * opinion. Defaulting to `false` instead would have made desktop open
 * collapsed; defaulting per-surface without storing the choice would
 * have thrown it away on every resize.
 *
 * LOCAL ONLY, not written to Firestore. How wide your sidebar is on this
 * machine is not account data, and syncing it would mean a phone session
 * silently rearranging a desktop one.
 */
export const railKey = uid => lsKey(uid, 'rail_expanded')

export function readRail(uid) {
  const v = loadLS(railKey(uid), null)
  return typeof v === 'boolean' ? v : null
}

export function writeRail(uid, value) {
  return saveLS(railKey(uid), !!value)
}

/** Resolve the stored choice against the surface it is being shown on. */
export const railIsExpanded = (stored, surface) =>
  typeof stored === 'boolean' ? stored : surface === 'desktop'

/* ── A PLANNED ID THAT NO LONGER NAMES A RECIPE ───────────────────────
 *
 * The catalog is not append-only: `recipes.js` holds 260 entries spread
 * over ids 1-384, so a rebuild has already removed ids that a stored
 * plan may still be pointing at. Such an id is TRUTHY and resolves to
 * nothing, and that combination is what breaks three screens at once:
 *
 *   Plan     renders the "Add a meal" control for the slot (`!r`), but
 *            `assignMeal` looks for the first FALSY slot to fill — a
 *            dangling id is truthy, so the day reads as full and the
 *            control silently does nothing.
 *   Grocery  `groupsForDay` builds a group for it, `byCard` has no
 *            entry, and the day view renders "MEAL n · 0 ITEMS ·
 *            Unknown recipe" above the real meals.
 *   Today,
 *   Track    pair it through `planVsLog` as a planned meal that can
 *            never be logged.
 *
 * ONE NORMALISATION AT THE BOUNDARY rather than a guard on each reader.
 * Five screens would need the same check, and the fifth would be added
 * without it. Null is the shape every reader already handles — the plan
 * has always allowed an empty slot — so nulling a dangling id turns an
 * unrepresentable state into an ordinary one.
 *
 * NOT A MIGRATION. Nothing is written here. The cleaned plan reaches
 * Firestore on the next ordinary save, which is what the user was
 * already doing when they hit this; a one-off write would touch
 * production data from a dev session, and preview and prod share a
 * project (PHASES, "Preview needs its own Firebase project").
 *
 * TAKES THE LOOKUP, does not import it. storeLogic imports no data, so
 * a test can pass its own catalog and this stays pure.
 *
 * @param plan        [{ day, ids: [...] }, ...]
 * @param recipeById  the id -> recipe map; string and number keys both
 *                    resolve because it is a plain object
 */
export function normalizeWeekPlan(plan, recipeById = {}) {
  if (!Array.isArray(plan)) return plan
  let touched = false
  const next = plan.map(d => {
    if (!d || !Array.isArray(d.ids)) return d
    let dayTouched = false
    const ids = d.ids.map(id => {
      /* Already empty. Passed through exactly as found: null and
         undefined are both falsy and every reader treats them the
         same, and coercing one to the other here would make the
         result depend on whether a SIBLING id needed cleaning. */
      if (!id) return id
      if (recipeById[id]) return id
      dayTouched = true
      return null
    })
    if (!dayTouched) return d
    touched = true
    return { ...d, ids }
  })
  /* Same array back when nothing changed, so this cannot cause a render
     by identity alone on every load. */
  return touched ? next : plan
}

/* ── THE WEEK HAS DATES, EVEN THOUGH THE PLAN DOES NOT ────────────────
 *
 * weekPlan is seven labelled days with no calendar identity. The LOG is
 * the opposite: one document per calendar date. Track and Plan both need
 * to put the two side by side — "what did I eat on the day I planned
 * this" — so the mapping lives here, once.
 *
 * ANCHORED ON TODAY'S INDEX, not on "Monday is 0". Plan day i is
 * (i - todayIdx) days from now, which stays right whatever order the
 * plan's days are in — the same reason todayIndex matches on labels.
 */
export function planDates(length, todayIdx, now = new Date()) {
  return Array.from({ length }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (i - todayIdx))
    return todayISO(d)
  })
}

/** YYYY-MM-DD back to a LOCAL date. `new Date('2026-11-10')` is UTC
 *  midnight, which is yesterday evening west of Greenwich — the same
 *  fault todayISO was written to remove. */
export function fromISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/* ── A DAY HOLDS AS MANY MEALS AS YOU GIVE IT ─────────────────────────
 *
 * A day used to be exactly two slots, and a third meal was refused. With
 * a planned week that made every day FULL, so the one action a meal
 * planner exists for — "I want this on Thursday" — did nothing.
 *
 * BASE_SLOTS is how many empty rows an empty day shows, and the floor a
 * day shrinks back to. Above it a day grows by one per meal and gives
 * the slot back when the meal goes, so a day never accumulates blank
 * rows it has to be cleaned of.
 */
export const BASE_SLOTS = 2

/** `recipeId` on `dayIndex`: the first empty slot, or one more slot. */
export function addMealToDay(plan = [], dayIndex, recipeId) {
  return plan.map((d, i) => {
    if (i !== dayIndex) return d
    const ids = [...(d.ids || [])]
    const free = ids.findIndex(x => !x)
    if (free >= 0) ids[free] = recipeId
    else ids.push(recipeId)
    return { ...d, ids }
  })
}

/** Empty one slot. An EXTRA slot is removed outright; one of the base
 *  slots is emptied and stays, so the day keeps its "Add a meal" rows. */
export function removeMealFromDay(plan = [], dayIndex, slot) {
  return plan.map((d, i) => {
    if (i !== dayIndex) return d
    const ids = [...(d.ids || [])]
    if (slot < 0 || slot >= ids.length) return d
    if (ids.length > BASE_SLOTS) ids.splice(slot, 1)
    else ids[slot] = null
    return { ...d, ids }
  })
}

/** The same week, emptied: every day keeps its label and goes back to
 *  the base number of empty slots. */
export function emptiedWeekPlan(plan = []) {
  return plan.map(d => ({ ...d, ids: Array.from({ length: BASE_SLOTS }, () => null) }))
}

/** How far through each day's shopping you are: [{ total, got }], one
 *  per plan day.
 *
 *  Plan uses it to say, on each day card, what the grocery list is
 *  doing — and the grocery day pills use it to mark a day as done. It
 *  calls buildGroceryItems rather than counting on its own, so the
 *  number on Plan cannot disagree with the list it links to. */
export function groceryProgressByDay(weekPlan = [], catalog = {}, excluded = new Set(),
                                     hidden = new Set(), checks = new Set()) {
  return weekPlan.map((_, i) => {
    const rows = buildGroceryItems(weekPlan, catalog, excluded, i, hidden)
    const got = rows.reduce((n, r) => n + (checks.has(dayKey(i, r.id)) ? 1 : 0), 0)
    return { total: rows.length, got }
  })
}

/* ── THE WHOLE WEEK AS ONE LIST ───────────────────────────────────────
 *
 * The list was day-scoped by an earlier decision, because quantities
 * differ per day. That is right for cooking and wrong for the weekly
 * shop, where it meant walking seven lists. So the week is a THIRD
 * READING of the same data — not a second store.
 *
 * BUILT FROM THE DAY LISTS, never beside them. Each day's rows come from
 * buildGroceryItems exactly as the day view gets them, and are merged by
 * item id. So an item cleared or hidden for a day is missing here for
 * the same reason, and the week cannot list something no day does.
 *
 * `days` IS WHAT MAKES THE CHECK HONEST. A week row stands for the item
 * on every day that needs it, and its check is those days' ordinary
 * `dayIndex:itemId` keys — all of them. Tick it here and each day shows
 * it ticked; tick every day and it is ticked here. One key space, as
 * DEVIATIONS §21 requires, with nothing new stored.
 *
 * `qtyDay` runs parallel to `qty` like `qtyFrom` does, so the expander
 * can say which day each amount is for.
 */
export function buildWeekGroceryItems(weekPlan = [], catalog = {}, excluded = new Set(),
                                      hidden = new Set()) {
  const rows = new Map()
  ;(Array.isArray(weekPlan) ? weekPlan : []).forEach((_, dayIndex) => {
    for (const r of buildGroceryItems(weekPlan, catalog, excluded, dayIndex, hidden)) {
      let row = rows.get(r.id)
      if (!row) {
        row = { id: r.id, name: r.name, section: r.section,
                meals: [], qty: [], qtyFrom: [], qtyDay: [], days: [] }
        rows.set(r.id, row)
      }
      row.days.push(dayIndex)
      row.meals.push(...r.meals)
      r.qty.forEach((q, i) => {
        row.qty.push(q); row.qtyFrom.push(r.qtyFrom[i]); row.qtyDay.push(dayIndex)
      })
    }
  })
  return [...rows.values()]
}

/** Every stored key a week row stands for. */
export const weekRowKeys = row => (row?.days || []).map(d => dayKey(d, row.id))

/** Got for the week means got on every day that needs it. */
export const weekRowChecked = (row, checks = new Set()) => {
  const keys = weekRowKeys(row)
  return keys.length > 0 && keys.every(k => checks.has(k))
}

/* ── CHECKED ROWS SINK ────────────────────────────────────────────────
 *
 * The list used to hold every row still on tap. It now behaves like a
 * checklist in a notes app, at the user's request: what you still need
 * stays at the top in shop order, and what you have got drops to the
 * bottom of its group and piles up there.
 *
 * `rankOf(item)` is -1 for an unchecked row, otherwise the order it was
 * checked in. Unchecked rows KEEP their incoming order — only the tapped
 * row moves, so the row under your thumb is replaced by the one that was
 * below it and nothing else changes place.
 */
export function sinkChecked(items = [], rankOf) {
  const open = [], got = []
  for (const it of items) (rankOf(it) < 0 ? open : got).push(it)
  got.sort((a, b) => rankOf(a) - rankOf(b))
  return [...open, ...got]
}

/* ── THE MONTH CALENDAR ───────────────────────────────────────────────
 *
 * Progress over months, on Track. Everything here is pure: the screen
 * hands in a year, a month and the logs it has, and gets back cells and
 * totals. Dates are built from LOCAL parts throughout, for the reason
 * todayISO gives.
 */

/** Every date in a month, as YYYY-MM-DD. `month` is 0-based, like Date. */
export function monthDates(year, month) {
  const days = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: days }, (_, i) => todayISO(new Date(year, month, i + 1)))
}

/** How many blank cells sit before the 1st in a MONDAY-first grid — the
 *  same week the Plan screen draws. */
export const monthLeadingBlanks = (year, month) =>
  (new Date(year, month, 1).getDay() + 6) % 7

/** Within this fraction of the calorie target counts as on target, and
 *  the same fraction short of the protein target still counts as hit. A
 *  day at 1,795 of 1,800 is not a miss. */
export const ON_TARGET_BAND = 0.1

/** A day's calories against the target: none | under | hit | over. */
export function dayStatus(kcal, goal) {
  if (!kcal || kcal <= 0) return 'none'
  if (!goal || goal <= 0) return 'under'
  const r = kcal / goal
  if (r > 1 + ON_TARGET_BAND) return 'over'
  return r >= 1 - ON_TARGET_BAND ? 'hit' : 'under'
}

export const proteinHit = (protein, goal) =>
  !!goal && goal > 0 && protein >= goal * (1 - ON_TARGET_BAND)

/** One cell per date: its totals and its status.
 *
 *  A date AFTER `today` is `future` and carries nothing, so the screen
 *  can dim it instead of reporting a miss for a day that has not come.
 *  Totals are rounded — a few recipes carry half-calories.
 */
export function monthCells(dates = [], logsByDate = {}, recipeById = {}, goals = {}, today = todayISO()) {
  return dates.map(date => {
    const future = date > today
    const entries = future ? [] : (logsByDate[date] || [])
    const t = sumLog(entries, recipeById)
    const kcal = Math.round(t.calories), protein = Math.round(t.protein)
    return {
      date, future, entries, kcal, protein,
      carbs: Math.round(t.carbs), fat: Math.round(t.fat),
      status: future ? 'none' : dayStatus(kcal, goals.calories),
      proteinHit: !future && proteinHit(protein, goals.protein),
    }
  })
}

/** The four numbers above the grid.
 *
 *  `streak` is the LONGEST run of consecutive logged days in the month,
 *  not the current one: a current streak reads 0 the morning after a
 *  perfect fortnight, which is discouraging and tells you nothing.
 */
export function monthSummary(cells = []) {
  let logged = 0, onTarget = 0, kcal = 0, proteinDays = 0, streak = 0, run = 0
  for (const c of cells) {
    if (c.future) continue
    if (c.kcal > 0) {
      logged++; kcal += c.kcal
      if (c.status === 'hit') onTarget++
      if (c.proteinHit) proteinDays++
      run++; if (run > streak) streak = run
    } else run = 0
  }
  return { logged, onTarget, proteinDays, streak,
           avgKcal: logged ? Math.round(kcal / logged) : 0 }
}

/** Macro totals for one day's LOG entries. */
export function sumLog(entries = [], recipeById = {}) {
  return sumMacros((entries || []).map(e => e?.recipeId), recipeById)
}

/** Which planned ids no longer name a recipe — for reporting, not for
 *  rendering. Returns [{ dayIndex, day, position, id }]. */
export function danglingPlanIds(plan, recipeById = {}) {
  if (!Array.isArray(plan)) return []
  const out = []
  plan.forEach((d, dayIndex) => {
    ;(d?.ids || []).forEach((id, position) => {
      if (id && !recipeById[id]) out.push({ dayIndex, day: d.day, position, id })
    })
  })
  return out
}

/* ── A PLAN CAN START ON A DAY YOU CHOOSE ─────────────────────────────
 *
 * Asked for by the owner: "I want to start my diet next week and start
 * meal prepping now, and the app won't let me pick a future date."
 *
 * The plan stays seven labelled days. What a start date adds is ONE
 * calendar anchor, `planStart` (YYYY-MM-DD, local), and two rules:
 *
 *   1. THE START DAY IS PLAN DAY 0. Choosing a Wednesday rotates the
 *      week so Wed is first — the meals stay with their labels, the
 *      plan just begins where the diet does. After that, todayIndex's
 *      label match keeps working for every repeat of the week.
 *   2. BEFORE THE START, NO PLAN DAY IS TODAY. planToday is -1, the
 *      plan's dates run forward from the start, and Today/Track say the
 *      plan has not begun rather than presenting day 1 as today. The
 *      grocery list defaults to day 1 — that is the shop you prep for.
 *
 * Once the start date is reached it changes nothing further: the week
 * behaves exactly as it did before this existed.
 */

/** Is `start` a real YYYY-MM-DD date? Anything else is "no start". */
export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return todayISO(fromISO(s)) === s
}

/** Has the plan not started yet? Strings compare correctly for ISO dates. */
export function planIsUpcoming(start, today = todayISO()) {
  return isISODate(start) && start > today
}

/** Plan day 0's weekday becomes `start`'s weekday.
 *
 *  Returns the rotated plan and `shift`, the old index that is now 0, so
 *  the caller can carry grocery keys across. A plan whose labels do not
 *  include that weekday is returned unchanged with shift 0. */
export function rotatePlanToStart(plan = [], start) {
  if (!Array.isArray(plan) || !plan.length || !isISODate(start)) return { plan, shift: 0 }
  const shift = todayIndex(plan, fromISO(start))
  const label = fromISO(start).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  if (!String(plan[shift]?.day || '').toLowerCase().startsWith(label) || shift === 0) {
    return { plan, shift: 0 }
  }
  return { plan: [...plan.slice(shift), ...plan.slice(0, shift)], shift }
}

/** Move `dayIndex:itemId` keys along with a rotation, so a ticked item
 *  stays ticked on the same day after the week is reordered. */
export function shiftDayKeys(keys = new Set(), shift = 0, length = 7) {
  if (!shift || !length) return keys
  const out = new Set()
  for (const k of keys) {
    if (!isDayKey(k)) continue
    const [d, id] = k.split(':').map(Number)
    out.add(dayKey((d - shift + length) % length, id))
  }
  return out
}

/** Which plan index is today, given an optional start date. -1 while
 *  the plan has not begun. */
export function planTodayIndex(weekPlan = [], start, date = new Date()) {
  if (planIsUpcoming(start, todayISO(date))) return -1
  return todayIndex(weekPlan, date)
}

/** The calendar date of each plan day. Before the start, they run
 *  forward from it; after, they are this week's, as planDates gives. */
export function planDatesWithStart(length, todayIdx, start, now = new Date()) {
  if (todayIdx < 0 && isISODate(start)) {
    const s = fromISO(start)
    return Array.from({ length }, (_, i) =>
      todayISO(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)))
  }
  return planDates(length, Math.max(0, todayIdx), now)
}

/** Whole days from `today` to `start`. */
export function daysUntil(start, today = todayISO()) {
  if (!isISODate(start)) return 0
  return Math.round((fromISO(start) - fromISO(today)) / 86_400_000)
}

export const longDate = iso => fromISO(iso).toLocaleDateString('en-US',
  { weekday: 'short', month: 'short', day: 'numeric' })

export function addDaysISO(iso, n) {
  const d = fromISO(iso)
  return todayISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

/** Next Monday, strictly after today. */
export function nextMonday(today = todayISO()) {
  const dow = fromISO(today).getDay()            // 0 Sun … 6 Sat
  return addDaysISO(today, ((8 - dow) % 7) || 7)
}

/** "STARTS IN 5 DAYS" / "STARTS TOMORROW" — the line under the header. */
export function startsInLabel(start, today = todayISO()) {
  const n = daysUntil(start, today)
  if (n <= 0) return 'STARTED'
  if (n === 1) return 'STARTS TOMORROW'
  return `STARTS IN ${n} DAYS`
}
