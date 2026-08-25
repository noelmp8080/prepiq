import { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react'
import { EmptyBlock } from './Card'
import SyncErrorBanner from './SyncErrorBanner'
import { useAppStore } from '../store/useAppStore'
import { groupBySection, dayKey } from '../store/storeLogic'
import { recipeById } from '../data/recipes'
import catalog from '../data/groceryCatalog.json'

/* ── The grocery list ─────────────────────────────────────────────────
 *
 * BUILT FOR A SUPERMARKET, NOT FOR A DESKTOP THAT HAPPENS TO SHRINK.
 * One hand, a basket in the other, bad lighting, 375px.
 *
 * THE RULE THE WHOLE SCREEN IS BUILT AROUND: NOTHING MOVES ON TAP.
 * Checking a row changes `opacity`, `color`, `text-decoration`,
 * `background`, `box-shadow` and `border-color` — paint properties, all
 * of them. No layout, no reflow, no reorder, no insertion, no
 * sink-to-bottom. A list that rearranges under your thumb is how you
 * check the wrong item next, and in a shop you would not notice.
 *
 * Reordering happens only at moments you control: collapsing a section,
 * Clear, changing the day, or re-entering the screen.
 *
 * TWO THINGS THE REDESIGN CHANGED, AND WHY THEY MAKE THE RULE STRONGER:
 *
 *   The checkbox is a 22px box rather than a swapped icon. Both states
 *   declare the same 1.5px border and the same box, changing only
 *   colour, background and shadow — so `box-sizing: border-box` keeps
 *   the geometry identical and the reflow harness no longer needs its
 *   SVG-internals exemption.
 *
 *   THE CHECK MARK IS ALWAYS IN THE DOM, at `opacity: 0` when unchecked.
 *   Rendering it conditionally would add and remove a node on every tap,
 *   which is a DOM change the harness has to be told to ignore — and an
 *   exemption is a hole. Nothing is added or removed now, so "paint
 *   only" is literally true rather than true-modulo-an-exclusion.
 *
 * ROW GEOMETRY, measured rather than chosen:
 *   56px tall, whole row is the target (~331x56 at 375px) — about 6x the
 *   44px floor by area. The checkbox is a state indicator INSIDE the
 *   target, not the target.
 *   18px name, single line. Measured against all 577 catalog items: at
 *   375px the name column holds 27 characters and exactly two real
 *   ingredients exceed it. Those truncate; the expander carries the
 *   full name.
 *
 * QUANTITIES LIVE IN THE EXPANDER, NOT ON THE ROW. The handoff's row
 * diagram shows `1.5 lb`, which assumes a normalised amount field. This
 * catalog stores whole ingredient lines — measured across a real day,
 * 26 to 53 characters each, none under 12, and one row already carries
 * two of them. There is no column that holds those beside an 18px name.
 * Confirmed with the user; see DEVIATIONS.md.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/* ── WIDE: TWO EXPLICIT COLUMNS, NOT CSS `columns` ────────────────────
 *
 * The prototype lays the sections out with `columns: 2`. That is
 * multi-column flow, which redistributes content BETWEEN columns
 * whenever anything above it changes height — so opening an expander in
 * one column can move rows in the other, rows the user never touched.
 * On phone the worst case is "things below move"; in a flowed pair of
 * columns it is "things sideways move", which is a failure mode the row
 * contract has never had to survive.
 *
 * Worse, jsdom cannot measure column balancing, so the harness could
 * neither prove nor disprove it — the single most important property in
 * the project would have shipped unverifiable.
 *
 * So sections are assigned alternately to two INDEPENDENT columns. A
 * height change in one is structurally incapable of moving the other,
 * which is the same reasoning that made the shell ramp a fixed layer:
 * arrange it so the question cannot arise. Measured on real days, the
 * alternating split lands within 13% — 680/736px and 792/904px — so it
 * reads as balanced columns. Confirmed with the user; see DEVIATIONS.md.
 */
function splitColumns(sections) {
  const a = [], b = []
  sections.forEach((s, i) => (i % 2 === 0 ? a : b).push(s))
  return [a, b]
}

export default function Grocery({ onChange, surface = 'phone' }) {
  const wide = surface === 'tablet' || surface === 'desktop'
  const desktop = surface === 'desktop'
  const {
    weekPlan, planToday, groceryRows: rows, groceryChecks, groceryDay,
    groceryDayIsToday, setGroceryDay, toggleGroceryItem,
    clearGrocery, undoClear, startNewGroceryList,
  } = useAppStore()

  const [openRow, setOpenRow] = useState(null)
  /* COLLAPSE STATE PERSISTS ACROSS DAY CHANGES — it lives here, above
     the day, rather than being re-seeded per day. Which sections you
     want shut is about how you shop, not about which day it is. */
  const [collapsed, setCollapsed] = useState(() => new Set(catalog.collapsedByDefault))
  const [undo, setUndo] = useState(null)
  const scrollPin = useRef(null)

  const sections = useMemo(() => groupBySection(rows, catalog), [rows])

  const isChecked = id => groceryChecks.has(dayKey(groceryDay, id))
  const done = rows.filter(r => isChecked(r.id)).length
  const left = rows.length - done
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0

  const day = weekPlan[groceryDay]
  const mealCount = (day?.ids || []).filter(Boolean).length

  /* PIN THE SCROLL OFFSET when a section above the viewport collapses.
     `overflow-anchor` is not trusted here: it is unimplemented in Safari,
     which is most of this app's traffic, and the failure mode is the page
     jumping under a thumb — the exact thing the no-reflow rule exists to
     prevent. */
  useLayoutEffect(() => {
    const pin = scrollPin.current
    if (pin == null) return
    scrollPin.current = null
    const delta = document.documentElement.scrollHeight - pin.height
    if (delta) window.scrollTo({ top: Math.max(0, pin.top + delta), behavior: 'instant' })
  }, [collapsed])

  /* An open expander belongs to a row on a particular day. Leaving it
     open across a day change would reveal a different item's amounts
     under the same chevron. */
  useEffect(() => { setOpenRow(null) }, [groceryDay])

  function toggleSection(name) {
    scrollPin.current = { top: window.scrollY, height: document.documentElement.scrollHeight }
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function onClear() {
    const restored = clearGrocery()
    if (restored.size) {
      setUndo(restored)
      setTimeout(() => setUndo(u => (u === restored ? null : u)), 3500)
    }
  }

  const headerLabel = rows.length === 0 ? 'Nothing to buy'
    : left === 0 ? 'All done'
    : `${left} left`

  const dayName = (day?.day || '').toUpperCase()
  const subLine = [
    groceryDayIsToday ? 'TODAY' : null,
    dayName,
    `${mealCount} MEAL${mealCount === 1 ? '' : 'S'}`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ paddingBottom: 92 }}>

      {/* ── Sticky header ───────────────────────────────────────────
          Never scrolls away: what is left, how far you are, and what
          Clear will do are all things you look at mid-aisle. */}
      <div data-grocery-header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'linear-gradient(180deg,#49535A 0%,#3A4349 100%)',
        borderBottom: '1px solid var(--pq-rule-strong)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        padding: '12px var(--pq-gutter) 10px',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              fontSize: 19, fontWeight: 700, color: 'var(--pq-text)', letterSpacing: '-.01em',
            }}>{headerLabel}</span>
            <div style={{
              ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-2)',
              letterSpacing: 'var(--pq-track-label)', marginTop: 3,
            }}>{subLine}</div>
          </div>
          <button
            onClick={onClear}
            disabled={done === 0}
            style={{
              flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
              borderRadius: 9, border: 'none',
              cursor: done ? 'pointer' : 'default',
              background: done ? 'var(--pq-accent-grad)' : 'transparent',
              boxShadow: done ? 'var(--pq-accent-raise)' : 'none',
              color: done ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-faint)',
              ...MONO, fontSize: 'var(--pq-size-body)', fontWeight: 600,
              letterSpacing: '.04em',
            }}>{done ? `CLEAR ${done}` : 'CLEAR'}</button>
        </div>

        {/* Its agreed slot — under the header row, above the day chips.
            Parked since block B because neither existed until now. */}
        <SyncErrorBanner />

        {/* ── Day chips ─────────────────────────────────────────────
            On wide these move to the side pane, where there is room for
            full day labels and the progress bar beside them. */}
        {!wide && <div style={{ display: 'flex', gap: 5 }}>
          {weekPlan.map((d, i) => {
            const on = i === groceryDay
            const hasMeals = (d.ids || []).some(Boolean)
            return (
              /* The pill is the design's 36px; the TARGET around it is
                 the handoff's own 44px floor. Growing the pill would
                 change the design, shrinking the target would break the
                 rule the same document states two sections later. Same
                 treatment as the filter chips and the close tile. */
              <button
                key={d.day}
                onClick={() => setGroceryDay(i)}
                aria-pressed={on}
                aria-label={`${d.day}${hasMeals ? '' : ', no meals'}`}
                style={{
                  flex: 1, minHeight: 'var(--pq-tap-min)',
                  display: 'flex', alignItems: 'center',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                }}>
                <span style={{
                  flex: 1, minHeight: 36, borderRadius: 'var(--pq-r-chip)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  background: on ? 'var(--pq-accent-grad)' : 'transparent',
                  boxShadow: on ? 'var(--pq-accent-raise)' : 'inset 0 1px 2px rgba(0,0,0,0.35)',
                  border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                  color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                  ...MONO, fontSize: 10, fontWeight: 600,
                  letterSpacing: 'var(--pq-track-chip)',
                }}>
                  {DAY_LETTERS[i]}
                  <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.75 }}>
                    {hasMeals ? '•' : ' '}
                  </span>
                </span>
              </button>
            )
          })}
        </div>}

        {/* ── Progress ────────────────────────────────────────────────
            A fixed 4px track that clips its fill, so the width change on
            a tap cannot alter the header's height and cannot move the
            list beneath it. */}
        <div style={{
          height: 4, borderRadius: 2, overflow: 'hidden',
          background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
        }}>
          <div data-progress-fill style={{
            height: '100%', width: `${pct}%`, borderRadius: 2,
            background: 'var(--pq-accent-bar)', transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {/* ── Empty day ───────────────────────────────────────────────
          The dashed block, NOT a header with empty sections under it.
          Empty sections would read as a list you had finished. */}
      {rows.length === 0 ? (
        <div style={{ padding: '28px var(--pq-gutter) 0' }}>
          <EmptyBlock>
            <p style={{
              margin: '0 0 6px', fontSize: 'var(--pq-size-meal)', fontWeight: 600,
              color: 'var(--pq-text-2)',
            }}>Nothing to buy for {day?.day || 'this day'}</p>
            <p style={{
              ...MONO, margin: '0 0 18px', fontSize: 12, color: 'var(--pq-text-muted)',
              lineHeight: 1.6,
            }}>{mealCount === 0 ? 'NO MEALS ASSIGNED TO THIS DAY' : 'EVERYTHING HERE IS CLEARED'}</p>
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
      ) : (
        <div data-grocery-list style={{
          padding: '10px var(--pq-gutter)',
          ...(wide ? {
            display: 'grid',
            gridTemplateColumns: desktop ? '1fr 320px' : '1fr 280px',
            gap: desktop ? 26 : 20, alignItems: 'start',
          } : null),
        }}>
          {/* Left region. On desktop it splits again into two
              independent columns, giving three in total. */}
          <div style={desktop ? {
            display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gap: 26, alignItems: 'start',
          } : undefined}>
          {(desktop ? splitColumns(sections) : [sections]).map((group, gi) => (
          <div key={gi}>
          {group.map(section => {
            const shut = collapsed.has(section.name)
            return (
              <section key={section.name}>
                <button
                  onClick={() => toggleSection(section.name)}
                  aria-expanded={!shut}
                  style={{
                    width: '100%', minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '10px 0 6px', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    stroke="var(--pq-text-3)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: shut ? 'rotate(-90deg)' : 'none' }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span style={{
                    ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 600,
                    letterSpacing: 'var(--pq-track-section)', textTransform: 'uppercase',
                    color: 'var(--pq-text-muted)',
                  }}>{section.name}</span>
                  <span style={{
                    ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                    color: 'var(--pq-text-3)',
                  }}>{section.items.length}</span>
                </button>

                {!shut && section.items.map(item => {
                  const checked = isChecked(item.id)
                  const open = openRow === item.id
                  return (
                    <div key={item.id}>
                      <div style={{
                        display: 'flex', alignItems: 'stretch',
                        borderBottom: '1px solid var(--pq-rule-row)',
                      }}>
                        {/* THE WHOLE ROW IS THE TARGET. Only paint changes. */}
                        <button
                          onClick={() => toggleGroceryItem(item.id)}
                          aria-pressed={checked}
                          style={{
                            flex: 1, minWidth: 0, height: 'var(--pq-row-grocery)',
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            textAlign: 'left', padding: 0, fontFamily: 'var(--pq-sans)',
                            opacity: checked ? 0.45 : 1,
                            transition: 'opacity var(--pq-t-paint)',
                          }}>
                          {/* Same box, same border width, both states —
                              only colour, background and shadow move. */}
                          <span style={{
                            width: 'var(--pq-check)', height: 'var(--pq-check)',
                            borderRadius: 'var(--pq-r-check)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1.5px solid ${checked ? 'transparent' : 'rgba(255,255,255,0.3)'}`,
                            background: checked ? 'var(--pq-accent-grad)' : 'rgba(0,0,0,0.28)',
                            boxShadow: checked
                              ? 'var(--pq-accent-raise)'
                              : 'inset 0 2px 4px rgba(0,0,0,0.45)',
                          }}>
                            {/* Always present, so a tap adds no node. */}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                              aria-hidden="true" stroke="#0E1012" strokeWidth="3"
                              strokeLinecap="round" strokeLinejoin="round"
                              style={{ opacity: checked ? 1 : 0 }}>
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </span>
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: 'var(--pq-size-grocery)', fontWeight: 500,
                            color: 'var(--pq-text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            textDecoration: checked ? 'line-through' : 'none',
                          }}>{item.name}</span>
                        </button>

                        {/* The expander answers "why am I buying this"
                            without costing a line on every row. Tap row =
                            check, tap here = why. No swipe, no long-press. */}
                        <button
                          onClick={() => setOpenRow(open ? null : item.id)}
                          aria-expanded={open}
                          aria-label={`${item.meals.length} meal${item.meals.length === 1 ? '' : 's'} need ${item.name}`}
                          style={{
                            flexShrink: 0, width: 'var(--pq-expander-w)',
                            height: 'var(--pq-row-grocery)',
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            gap: 3, background: 'transparent', border: 'none',
                            cursor: 'pointer', padding: 0, color: 'var(--pq-text-3)',
                            ...MONO, fontSize: 13, fontWeight: 500,
                          }}>
                          {item.meals.length}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            aria-hidden="true" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{
                              transform: open ? 'rotate(90deg)' : 'none',
                              transition: 'transform var(--pq-t-paint)',
                            }}>
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      </div>

                      {open && (
                        <div style={{
                          padding: '6px 0 14px 36px',
                          borderBottom: '1px solid var(--pq-rule-row)',
                        }}>
                          <p style={{
                            margin: '0 0 6px', fontSize: 'var(--pq-size-body)', fontWeight: 600,
                            color: 'var(--pq-text)', wordBreak: 'break-word',
                          }}>{item.name}</p>
                          {item.qty.map((q, i) => (
                            <p key={i} style={{
                              ...MONO, margin: '0 0 2px', fontSize: 12,
                              color: 'var(--pq-text-muted)',
                            }}>
                              {q}
                              <span style={{ display: 'block', opacity: 0.7 }}>
                                — {recipeById[item.qtyFrom?.[i]]?.name || 'this day'}
                              </span>
                            </p>
                          ))}
                          <p style={{
                            margin: '6px 0 0', fontSize: 12, color: 'var(--pq-text-3)',
                            lineHeight: 1.5,
                          }}>
                            For: {item.meals.map(id => recipeById[id]?.name).filter(Boolean).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
          </div>
          ))}
          </div>

          {/* The side pane: which day, and how far through it you are.
              On phone both live in the sticky header; here there is room
              for full day names beside the list rather than above it. */}
          {wide && (
            <aside data-grocery-side style={{
              position: 'sticky', top: 10,
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: 16, borderRadius: 'var(--pq-r-card)',
              background: 'var(--pq-panel)',
              border: '1px solid var(--pq-rule-soft)',
            }}>
              <div style={{
                ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 600,
                color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
              }}>SHOPPING FOR</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {weekPlan.map((d, i) => {
                  const on = i === groceryDay
                  const hasMeals = (d.ids || []).some(Boolean)
                  return (
                    <button
                      key={d.day}
                      onClick={() => setGroceryDay(i)}
                      aria-pressed={on}
                      aria-label={`${d.day}${hasMeals ? '' : ', no meals'}`}
                      style={{
                        minHeight: 'var(--pq-tap-min)', padding: '0 12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, borderRadius: 'var(--pq-r-chip)', cursor: 'pointer',
                        background: on ? 'var(--pq-accent-grad)' : 'transparent',
                        boxShadow: on ? 'var(--pq-accent-raise)' : 'inset 0 1px 2px rgba(0,0,0,0.35)',
                        border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                        color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                        ...MONO, fontSize: 11, fontWeight: 600,
                        letterSpacing: 'var(--pq-track-chip)',
                      }}>
                      <span>{d.day.toUpperCase()}</span>
                      <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.75 }}>
                        {hasMeals ? '•' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div style={{
                ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 600,
                color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-section)',
                marginTop: 4,
              }}>PROGRESS</div>
              <div style={{
                height: 5, borderRadius: 3, overflow: 'hidden',
                background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 3,
                  background: 'var(--pq-accent-bar)', transition: 'width .4s ease',
                }} />
              </div>
              <div style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-muted)' }}>
                {done} OF {rows.length} · {pct}%
              </div>

              <button
                onClick={startNewGroceryList}
                style={{
                  marginTop: 4, minHeight: 'var(--pq-tap-min)',
                  borderRadius: 'var(--pq-r-button)', background: 'transparent',
                  border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
                  color: 'var(--pq-text-muted)',
                  ...MONO, fontSize: 11, fontWeight: 500,
                  letterSpacing: 'var(--pq-track-chip)',
                }}>START A NEW LIST</button>
            </aside>
          )}

          {!wide && <button
            onClick={startNewGroceryList}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 24,
              borderRadius: 'var(--pq-r-button)', background: 'transparent',
              border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
              color: 'var(--pq-text-muted)',
              ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
            }}>START A NEW LIST</button>}
        </div>
      )}

      {/* Undo rather than a confirm dialog: a dialog in a supermarket is
          two taps and a moment of doubt. */}
      {undo && (
        <div role="status" style={{
          position: 'fixed', left: 12, right: 12, zIndex: 102,
          bottom: 'calc(var(--pq-nav-h) + 12px + env(safe-area-inset-bottom))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 14px', borderRadius: 'var(--pq-r-button)',
          background: 'var(--pq-sheet-bg)', border: 'var(--pq-card-border)',
          boxShadow: 'var(--pq-sheet-shadow)', color: 'var(--pq-text)',
        }}>
          <span style={{ ...MONO, fontSize: 12, letterSpacing: 'var(--pq-track-chip)' }}>
            {undo.size} REMOVED
          </span>
          <button
            onClick={() => { undoClear(undo); setUndo(null) }}
            style={{
              minHeight: 'var(--pq-tap-min)', padding: '0 4px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--pq-accent)',
              ...MONO, fontSize: 12, fontWeight: 700, letterSpacing: 'var(--pq-track-chip)',
            }}>UNDO</button>
        </div>
      )}
    </div>
  )
}
