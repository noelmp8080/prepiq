import { useState, useMemo } from 'react'
import { EmptyBlock } from './Card'
import Thumb from './Thumb'
import GroceryRow, { GroceryRowPanel } from './GroceryRow'
import { groupsForDay, groupEyebrow } from '../lib/groceryByDay'
import { amountFor } from '../lib/groceryAmount'
import { recipeById } from '../data/recipes'
import catalog from '../data/groceryCatalog.json'

/* ── THE DAY, AS RECIPE GROUPS ────────────────────────────────────────
 *
 * The cooking read of a day: one block per planned recipe, each with its
 * photo, a positional eyebrow, the title, and only that recipe's rows.
 * The consolidated store-walk list is the shopping read and is still
 * here, behind the AISLES pill.
 *
 * THE ROWS ARE THE SAME ROWS. `GroceryRow` is the component lifted out
 * of the consolidated list, unchanged — same 56px, same two buttons,
 * same paint-only toggle. The reflow harness covers these rows because
 * they are literally the other screen's rows, not because a second
 * implementation was kept in step by hand.
 *
 * MEAL ORDER IS POSITION ORDER. The plan has no meal slots — `day.ids`
 * is a flat array and `slot` everywhere else in this app is its index —
 * so the eyebrow reads `MEAL 1`, 1-based. See DEVIATIONS §16.
 *
 * ROWS IN A GRID, NOT IN CSS `columns`. Multi-column layout reflows its
 * content between columns; a grid with a fixed column count places each
 * row in a cell of fixed height and cannot move a sibling. That is the
 * same reason block E used two explicit columns (DEVIATIONS §10), and it
 * is what lets the no-reflow rule survive three columns.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

/* Per surface: the photo column, the photo's height, the gap between
   the two halves, and how many columns the rows sit in. A table rather
   than three branches, because these are four numbers that move
   together and one of them going stale is invisible. */
const LAYOUT = {
  desktop: { photoCol: 340, photoH: 210, gap: 48, cols: 3, colGap: 40, title: 26, groupGap: 36 },
  tablet:  { photoCol: 280, photoH: 180, gap: 30, cols: 2, colGap: 36, title: 26, groupGap: 32 },
  phone:   { photoCol: 88,  photoH: 88,  gap: 14, cols: 1, colGap: 0,  title: 22, groupGap: 26 },
}

/* CHECKS ARE THE STORE'S, NOT THIS COMPONENT'S. `isChecked` and
   `onToggle` take an ITEM ID and run straight into the same
   `dayIndex:itemId` Set the aisle view uses — so an item ticked here is
   ticked there, and an ingredient that appears in two groups on one day
   ticks in both at once. It is one shop; buying a thing once buys it.
   See DEVIATIONS §21. */
export default function GroceryDay({
  weekPlan, dayIndex, excluded, surface = 'phone',
  isChecked, onToggle, onHide, hidden = new Set(), onChange,
}) {
  const L = LAYOUT[surface] || LAYOUT.phone
  const phone = surface === 'phone'

  /* A GROUP WITH NOTHING LEFT DOES NOT RENDER. Every one of its
     ingredients being hidden or cleared leaves a recipe photo and a
     title over nothing, which reads as a bug; block D's rule for an
     empty day is the dashed block, not a header with empty sections,
     and this is the same rule one level down.

     The group is still BUILT, so its hiddenItems are counted in the
     header total — hiding every ingredient of a recipe must not make
     the way back disappear with it. */
  const allGroups = useMemo(
    () => groupsForDay(weekPlan, catalog, excluded, dayIndex, hidden),
    [weekPlan, excluded, dayIndex, hidden])
  const groups = useMemo(() => allGroups.filter(g => g.items.length > 0), [allGroups])

  /* An open expander belongs to ONE ROW, so it is keyed by row, not by
     item: opening "chicken breast" under one recipe must not open it
     under the other. This is the one thing that IS per-instance — the
     check behind those two rows is shared, the disclosure is not. */
  const [openKey, setOpenKey] = useState(null)

  const day = weekPlan?.[dayIndex]
  const mealCount = (day?.ids || []).filter(Boolean).length
  const itemCount = groups.reduce((n, g) => n + g.items.length, 0)

  /* EMPTY STAYS ON THIS DAY. Jumping to a day that has meals would
     answer a question the user did not ask and hide the one fact they
     need, which is that today has nothing in it.

     A day whose items are ALL excluded is empty too. Exclusions are
     shared with the aisle view, so clearing everything there leaves
     groups here with no rows — and block D's rule is the dashed block,
     not a header with empty sections under it. */
  if (!groups.length || itemCount === 0) {
    return (
      <div data-grocery-list style={{ padding: '28px var(--pq-gutter) 0' }}>
        <EmptyBlock>
          <p style={{
            margin: '0 0 6px', fontSize: 'var(--pq-size-meal)', fontWeight: 600,
            color: 'var(--pq-text-2)',
          }}>{mealCount === 0
            ? `Nothing planned for ${day?.day || 'this day'}`
            : `Nothing to buy for ${day?.day || 'this day'}`}</p>
          <p style={{
            ...MONO, margin: '0 0 18px', fontSize: 12, color: 'var(--pq-text-muted)',
            lineHeight: 1.6,
          }}>{mealCount === 0
            ? 'NO MEALS ASSIGNED TO THIS DAY'
            : 'EVERYTHING HERE IS CLEARED'}</p>
          <button
            onClick={() => onChange?.('plan')}
            style={{
              minHeight: 'var(--pq-tap-min)', padding: '0 18px',
              borderRadius: 'var(--pq-r-button)', border: 'none', cursor: 'pointer',
              background: 'var(--pq-accent-grad)', boxShadow: 'var(--pq-accent-raise)',
              color: 'var(--pq-on-accent-ink)',
              ...MONO, fontSize: 12, fontWeight: 600, letterSpacing: 'var(--pq-track-chip)',
            }}>OPEN THE WEEK PLAN</button>
        </EmptyBlock>
      </div>
    )
  }

  return (
    <div data-grocery-list style={{
      padding: '10px var(--pq-gutter)',
      display: 'flex', flexDirection: 'column', gap: L.groupGap,
    }}>
      {groups.map(group => {
        const recipe = recipeById[group.recipeId]
        const eyebrow = groupEyebrow(group)

        const head = (
          <>
            <Thumb
              recipe={recipe}
              size={88}
              src={recipe?.image}
              style={phone
                ? { width: 88, height: 88 }
                : { width: '100%', height: L.photoH }}
            />
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              minWidth: 0, ...(phone ? { flex: 1 } : { marginTop: 12 }),
            }}>
              <span style={{
                ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 500,
                letterSpacing: 'var(--pq-track-section)',
                color: 'var(--pq-accent)', textTransform: 'uppercase',
              }}>{eyebrow}</span>
              <h3 style={{
                margin: 0, fontFamily: 'var(--pq-sans)',
                fontSize: L.title, lineHeight: phone ? 1.15 : 1.1, fontWeight: 700,
                color: 'var(--pq-text)', letterSpacing: '-.01em',
              }}>{recipe?.name || 'Unknown recipe'}</h3>
            </div>
          </>
        )

        const rows = (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${L.cols}, minmax(0, 1fr))`,
            columnGap: L.colGap, rowGap: L.cols > 1 ? 12 : 0,
            alignContent: 'start',
          }}>
            {group.items.map(item => {
              /* Identity of a ROW, not of a check. Two groups can hold
                 the same ingredient and each needs its own React key
                 and its own expander; the CHECK they share. */
              const key = `${group.instanceId}:${item.itemId}`
              const isOpen = openKey === key
              const n = item.quantity.length
              return (
                <GroceryRow
                  key={key}
                  name={item.name}
                  /* THIS RECIPE'S amount. The aisle view shows the
                     day's total for the same item; here the question
                     is how much this dish needs. */
                  amount={amountFor(item.quantity)}
                  checked={isChecked(item.itemId)}
                  onToggle={() => onToggle(item.itemId)}
                  open={isOpen}
                  onToggleOpen={() => setOpenKey(isOpen ? null : key)}
                  expanderLabel={`${item.name} for ${recipe?.name || 'this meal'}`}
                >
                  <GroceryRowPanel onHide={() => onHide(item.itemId)}>
                    <p style={{
                      margin: '0 0 6px', fontSize: 'var(--pq-size-body)', fontWeight: 600,
                      color: 'var(--pq-text)', wordBreak: 'break-word',
                    }}>{item.name}</p>
                    {/* 76% of card-item pairs carry no quantity line at
                        all — `quantitySections` limits them to three
                        sections — so "none listed" is the ordinary
                        answer and says so rather than showing a blank. */}
                    {n === 0 ? (
                      <p style={{
                        ...MONO, margin: 0, fontSize: 12, color: 'var(--pq-text-3)',
                      }}>NO AMOUNT LISTED</p>
                    ) : item.quantity.map((q, i) => (
                      <p key={i} style={{
                        ...MONO, margin: '0 0 2px', fontSize: 12,
                        color: 'var(--pq-text-muted)', wordBreak: 'break-word',
                      }}>{q}</p>
                    ))}
                  </GroceryRowPanel>
                </GroceryRow>
              )
            })}
          </div>
        )

        return phone ? (
          <section key={group.instanceId}>
            <div style={{ display: 'flex', gap: L.gap, alignItems: 'flex-start' }}>{head}</div>
            <div style={{ marginTop: 10 }}>{rows}</div>
          </section>
        ) : (
          <section key={group.instanceId} style={{
            display: 'grid',
            gridTemplateColumns: `${L.photoCol}px minmax(0, 1fr)`,
            gap: L.gap, alignItems: 'start',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>{head}</div>
            {rows}
          </section>
        )
      })}
    </div>
  )
}
