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

/** One shopping row per item across the week's meals.
 *
 *  @param weekPlan  [{day, ids:[recipeId|null]}]
 *  @param catalog   src/data/groceryCatalog.json
 *  @param excluded  Set of item ids the user cleared. Ids, never names —
 *                   the normaliser has changed on nearly every pass of
 *                   this work and a name key would break each time.
 */
export function buildGroceryItems(weekPlan = [], catalog = {}, excluded = new Set()) {
  const byCard = catalog.byCard || {}
  const meta = catalog.items || {}
  const rows = new Map()
  const seenCards = new Set()

  for (const day of weekPlan) {
    for (const rid of day?.ids || []) {
      if (!rid || seenCards.has(rid)) continue      // a repeated meal is one shop
      seenCards.add(rid)
      for (const entry of byCard[String(rid)] || []) {
        if (excluded.has(entry.id)) continue
        const info = meta[String(entry.id)]
        if (!info) continue                          // retired id, no longer stocked
        let row = rows.get(entry.id)
        if (!row) {
          row = { id: entry.id, name: info.name, section: info.section, meals: [], qty: [] }
          rows.set(entry.id, row)
        }
        row.meals.push(rid)
        for (const q of entry.qty || []) row.qty.push(q)
      }
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

/* CHECKS RE-KEY FROM `recipe_${id}` TO ITEM IDS, AND RESET.
 *
 * A check meant "I have the ingredients for Spicy Chicken Wraps". It
 * cannot be mapped onto that recipe's nineteen ingredients without
 * inventing data, so the old keys are dropped rather than migrated.
 *
 * The version marks which key space a stored set belongs to. A rollback
 * reads v2 keys, finds none it recognises, and shows an unchecked list —
 * an empty list rather than garbage. Writes REPLACE so old keys cannot
 * linger and quietly inflate the count. */
export const CHECKS_VERSION = 2

export function readChecks(doc) {
  if (!doc || doc.version !== CHECKS_VERSION) return new Set()
  return new Set((doc.ids || []).filter(n => Number.isInteger(n)))
}

export function writeChecks(ids) {
  return { version: CHECKS_VERSION, ids: [...ids].filter(Number.isInteger).sort((a, b) => a - b) }
}
