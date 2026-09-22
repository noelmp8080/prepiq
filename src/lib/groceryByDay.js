import { groupBySection, dayKey } from '../store/storeLogic'

/* ── A DAY AS RECIPE GROUPS ───────────────────────────────────────────
 *
 * The second reading of one day's plan. `buildGroceryItems` answers
 * "what do I buy" — one row per item, merged across every meal, walked
 * in shop order. This answers "what am I cooking" — one group per
 * planned recipe, each carrying only its own ingredients.
 *
 * BOTH READ THE SAME SOURCE AND MUST AGREE ON WHAT IS ON THE LIST.
 * The union of every group's items is the same id set `buildGroceryItems`
 * returns for that day; only the shape differs. A parity test asserts
 * that against the harness's own Tuesday fixture, because the failure
 * mode — one view showing an ingredient the other has dropped — is
 * invisible on either screen alone.
 *
 * WHAT IT DOES NOT DO:
 *
 *  - No meal slots. The plan has none: `day.ids` is a flat, positional
 *    array and `slot` everywhere else in this app is its index. Groups
 *    are ordered and labelled by POSITION, 1-based at the call site.
 *  - No splitting. The compound splitter is `tools/split-compounds.py`,
 *    a build-time tool; `byCard` arrives already split. Reusing it means
 *    not re-deriving it.
 *  - No new sort. Item order comes from `groupBySection`, the same
 *    function the consolidated list walks, so the two cannot drift into
 *    different shop orders.
 *  - No dates. `dayIndex` is an integer, as it is everywhere else in
 *    this store — date handling stays out of the derivation, which is
 *    where a UTC bug once lived here for months.
 */

/**
 * One day's plan as recipe groups.
 *
 * @param {Array}  weekPlan   [{ day, ids: [recipeId|null, …] }, …]
 * @param {object} catalog    src/data/groceryCatalog.json
 * @param {Set}    excluded   `dayIndex:itemId` keys the user cleared
 * @param {number} dayIndex   which day — a real integer, never resolved here
 *
 * @returns {Array<{
 *   instanceId: string,      // `${recipeId}#${position}` — stable while position is
 *   position: number,        // 0-based index in day.ids of its FIRST appearance
 *   timesPlanned: number,    // 2 when the same recipe is planned twice that day
 *   recipeId: number,
 *   items: Array<{ itemId: number, name: string, quantity: string[], section: string }>
 * }>}
 *
 * `quantity` is an ARRAY, and the plural is the honest shape: 76% of
 * card-item pairs carry none at all (`quantitySections` limits them to
 * three sections) and 38 carry more than one. Listed, never summed —
 * see DEVIATIONS §5. The expander renders them; the row does not.
 */
export function groupsForDay(weekPlan = [], catalog = {}, excluded = new Set(), dayIndex) {
  const byCard = catalog.byCard || {}
  const meta = catalog.items || {}
  const day = Array.isArray(weekPlan) ? weekPlan[dayIndex] : undefined
  if (!day) return []                                  // out of range is an empty day

  /* ONE GROUP PER RECIPE, NOT PER SLOT. A recipe planned twice in a day
     is one thing to cook twice, and one set of ingredients to have in —
     the same call `buildGroceryItems` makes with `seenCards`. The repeat
     is carried as `timesPlanned` so the eyebrow can say so, rather than
     being silently dropped.

     A Map, not an object: it preserves insertion order for every key
     type, so walking `ids` in order leaves the groups in position order
     with no sort to keep correct. */
  const planned = new Map()
  ;(day.ids || []).forEach((rid, position) => {
    if (!rid) return                                   // an empty slot is not a meal
    const key = String(rid)
    const seen = planned.get(key)
    if (seen) seen.timesPlanned += 1
    else planned.set(key, { recipeId: rid, position, timesPlanned: 1 })
  })

  const groups = []
  for (const [key, info] of planned) {
    const rows = new Map()

    for (const entry of byCard[key] || []) {
      /* Exclusions are keyed `dayIndex:itemId`, day-wide and not
         per-recipe, so clearing an item removes it from every group it
         appears in that day. That is the same key space the
         consolidated list uses, deliberately: an exclusion means "I
         already have this", which is a fact about the shop and not
         about one recipe. */
      if (excluded.has(dayKey(dayIndex, entry.id))) continue

      const info_ = meta[String(entry.id)]
      if (!info_) continue                             // retired id, no longer stocked

      /* Deduped WITHIN the recipe only. The catalog carries no repeated
         item id inside one card today, so this is a guard rather than a
         correction — but the contract is per-recipe dedupe, and a
         rebuild could introduce one. Quantities merge rather than the
         second line being dropped. */
      let row = rows.get(entry.id)
      if (!row) {
        row = { id: entry.id, name: info_.name, section: info_.section,
                meals: [info.recipeId], qty: [] }
        rows.set(entry.id, row)
      }
      for (const q of entry.qty || []) row.qty.push(q)
    }

    /* Shop order from the same function the consolidated list uses,
       flattened back to one list. Within a group every row has exactly
       one meal, so groupBySection's meal-count tiebreak is inert and the
       order inside a section is by name — deterministic either way. */
    const ordered = groupBySection([...rows.values()], catalog)
      .flatMap(section => section.items)

    groups.push({
      instanceId: `${info.recipeId}#${info.position}`,
      position: info.position,
      timesPlanned: info.timesPlanned,
      recipeId: info.recipeId,
      items: ordered.map(r => ({
        itemId: r.id, name: r.name, quantity: r.qty, section: r.section,
      })),
    })
  }

  return groups
}

/** The eyebrow above a group: `MEAL 1 · 9 ITEMS`, or `MEAL 1 · ×2 · 9
 *  ITEMS` when the same recipe is planned twice that day.
 *
 *  Positional because the plan has no meal slots to name (decision 1,
 *  DEVIATIONS §16). 1-based here and only here — `position` stays a
 *  0-based array index everywhere it is used as one. */
export function groupEyebrow(group) {
  if (!group) return ''
  const n = group.items?.length || 0
  return [
    `MEAL ${group.position + 1}`,
    group.timesPlanned > 1 ? `×${group.timesPlanned}` : null,
    `${n} ITEM${n === 1 ? '' : 'S'}`,
  ].filter(Boolean).join(' · ')
}

/** The check key for the day view: `dayIndex:instanceId:itemId`.
 *
 *  A THIRD KEY SPACE, deliberately. The consolidated list checks
 *  `dayIndex:itemId` — one row, one state. Here the same ingredient can
 *  appear in two groups on one day, and checking it under Monday's wrap
 *  must not check it under Monday's curry. Additive: nothing reads or
 *  writes the existing space through this. */
export const groupItemKey = (dayIndex, instanceId, itemId) =>
  `${dayIndex}:${instanceId}:${itemId}`
