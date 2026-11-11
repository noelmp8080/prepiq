import { useState, useMemo } from 'react'
import Card, { CARD_ROW_RULE, CARD_CELL_RULE } from './Card'
import Sheet from './Sheet'
import Thumb from './Thumb'
import ScreenHeader from './ScreenHeader'
import RecipeSheet from './RecipeSheet'
import { useAppStore } from '../store/useAppStore'
import { recipes, recipeById } from '../data/recipes'
import { sumMacros, planVsLog, fromISO, longDate, startsInLabel } from '../store/storeLogic'
import { ResetButton } from './ResetSheet'
import StartDateSheet from './StartDateSheet'

/* ── Plan — the source of truth, and the only screen that writes it ───
 *
 * Everything else in the app is a view of this: Today is one day of it,
 * the grocery list is one day's ingredients, Track pre-fills from it.
 * That is why the footer line is not decoration — it is the one place
 * the app tells you a change here reaches somewhere else.
 *
 * DAY CARDS ARE FLAT PANELS, NOT CARDS. `#141619` is opaque and does not
 * participate in the shell ramp; Card.jsx is translucent and does. Seven
 * translucent cards stacked down a screen would each read a different
 * lightness, which is right for one card and noise for a list. The
 * stat strip above them IS a Card, because there is one of it.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

/* The plan's own first and last dates, not "this Monday to Sunday": a
   plan can start on any day, and on a future one. */
function weekRange(dates = []) {
  if (!dates.length) return ''
  const f = iso => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(dates[0])} – ${f(dates[dates.length - 1])}`.toUpperCase()
}

function StatCell({ value, label, accent, style }) {
  return (
    <div style={{ padding: '14px 16px', ...style }}>
      <div style={{
        ...MONO, fontSize: 'var(--pq-size-stat)', fontWeight: 600, lineHeight: 1,
        color: accent ? 'var(--pq-accent)' : 'var(--pq-text)',
      }}>{value}</div>
      <div style={{
        ...MONO, fontSize: 'var(--pq-size-label)', color: 'var(--pq-text-3)',
        letterSpacing: 'var(--pq-track-label)', marginTop: 6,
      }}>{label}</div>
    </div>
  )
}

/* The picker. A sheet rather than a trip to the Recipes tab: choosing a
   meal for Thursday is a decision about Thursday, and leaving the screen
   loses the row you were filling. */
function RecipePicker({ dayLabel, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? recipes.filter(r => r.name.toLowerCase().includes(q)) : recipes
    return pool.slice(0, 60)
  }, [query])

  return (
    <Sheet open onClose={onClose} title={`Add a meal to ${dayLabel}`}>
      <div style={{
        flexShrink: 0, padding: '16px var(--pq-gutter) 12px',
        borderBottom: '1px solid var(--pq-rule-cell)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--pq-text)', letterSpacing: '-.01em' }}>
          Add a meal
        </div>
        <div style={{
          ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)',
          marginTop: 3, letterSpacing: 'var(--pq-track-chip)',
        }}>{dayLabel.toUpperCase()}</div>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search recipes"
          aria-label="Search recipes"
          style={{
            width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 12,
            padding: '11px 14px', borderRadius: 'var(--pq-r-button)',
            background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
            color: 'var(--pq-text)', fontSize: 'var(--pq-size-row)',
            fontFamily: 'var(--pq-sans)', outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {results.length === 0 && (
          <p style={{
            ...MONO, padding: '24px var(--pq-gutter)', margin: 0,
            fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)', textAlign: 'center',
          }}>NOTHING MATCHES “{query.trim().toUpperCase()}”</p>
        )}
        {results.map(r => (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '10px var(--pq-gutter)',
              background: 'none', border: 'none', borderBottom: CARD_ROW_RULE,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--pq-sans)',
            }}>
            <Thumb recipe={r} size={36} src={r.image} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 500,
                color: 'var(--pq-text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.name}</span>
              <span style={{
                ...MONO, display: 'block', fontSize: 'var(--pq-size-eyebrow)',
                color: 'var(--pq-text-3)', marginTop: 2,
              }}>{r.cal} KCAL · {r.protein}G</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/* Seven days stacked is a scroll; two or three abreast is a week you can
   see. Each day card is unchanged — flat panel, same header, same rows. */
const DAY_COLS = { tablet: 'repeat(2,minmax(0,1fr))', desktop: 'repeat(3,minmax(0,1fr))' }

export default function Plan({ surface = 'phone', onChange, onReset }) {
  const {
    weekPlan, planToday, assignMeal, removeMeal, shuffleWeekPlan,
    goals, logsByDay, groceryProgress, setGroceryDay,
    groceryWeekProgress: weekProg, setGroceryWeek,
    planDates, planStart, planUpcoming, logDate,
  } = useAppStore()
  const [choosingStart, setChoosingStart] = useState(false)

  /* THE PLAN SAYS WHAT THE OTHER SCREENS ARE DOING WITH IT. Each day
     card carries that day's grocery progress and marks the meals already
     logged, and the grocery line is a door: it opens the list ON that
     day. Today is passed as null so the list keeps calling it TODAY. */
  function openGroceryFor(dayIndex) {
    setGroceryDay(dayIndex === planToday ? null : dayIndex)
    onChange?.('grocery')
  }
  const [picking, setPicking] = useState(null)          // { dayIndex, label }
  const [sheetRecipe, setSheetRecipe] = useState(null)

  const dayTotals = weekPlan.map(d => sumMacros((d.ids || []).filter(Boolean), recipeById))
  const daysWithMeals = dayTotals.filter(t => t.calories > 0).length
  const weekKcal = dayTotals.reduce((t, d) => t + d.calories, 0)
  const weekProtein = dayTotals.reduce((t, d) => t + d.protein, 0)
  /* Averaged over the days that HAVE meals, not over seven. A half-planned
     week otherwise reads as though every day were half-sized. */
  const avgKcal = daysWithMeals ? Math.round(weekKcal / daysWithMeals) : 0
  const avgProtein = daysWithMeals ? Math.round(weekProtein / daysWithMeals) : 0

  return (
    <div>
      <ScreenHeader
        surface={surface}
        eyebrow={weekRange(planDates)}
        title="Week"
        actions={<>
          {onReset && <ResetButton onClick={onReset} />}
          <button
            onClick={shuffleWeekPlan}
            style={{
              flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
              borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
              background: 'var(--pq-thumb-fallback)',
              border: '1px solid var(--pq-rule-strong)',
              boxShadow: 'var(--pq-thumb-fallback-lip)',
              color: 'var(--pq-text-2)',
              ...MONO, fontSize: 12, fontWeight: 500, letterSpacing: 'var(--pq-track-chip)',
            }}>SHUFFLE</button>
        </>}
      />

      {/* THE START DATE. Plan ahead for a diet that begins next week:
          the days, the grocery list and Today all follow it. */}
      <button
        data-plan-start
        onClick={() => setChoosingStart(true)}
        aria-label={planUpcoming
          ? `Plan starts ${longDate(planStart)}. Change start date`
          : 'Set a start date'}
        style={{
          width: 'calc(100% - 2 * var(--pq-gutter))', margin: '16px var(--pq-gutter) 0',
          minHeight: 'var(--pq-tap-min)', padding: '0 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
          background: 'var(--pq-panel)',
          border: `1px solid ${planUpcoming ? 'var(--pq-accent)' : 'var(--pq-rule-soft)'}`,
          textAlign: 'left',
          ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 600,
          letterSpacing: 'var(--pq-track-label)',
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke={planUpcoming ? 'var(--pq-accent)' : 'var(--pq-text-3)'} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
        </svg>
        <span style={{ flex: 1, color: planUpcoming ? 'var(--pq-text)' : 'var(--pq-text-2)' }}>
          {planUpcoming
            ? `STARTS ${longDate(planStart).toUpperCase()}`
            : 'PLAN STARTS · THIS WEEK'}
        </span>
        <span style={{ color: planUpcoming ? 'var(--pq-accent)' : 'var(--pq-text-muted)' }}>
          {planUpcoming ? startsInLabel(planStart, logDate) : 'SET START DATE'}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--pq-text-3)' }}>›</span>
      </button>

      <Card style={{ margin: '16px var(--pq-gutter) 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <StatCell value={weekKcal.toLocaleString()} label="WEEK KCAL"
                    style={{ borderRight: CARD_CELL_RULE }} />
          <StatCell value={avgKcal.toLocaleString()} label="AVG / DAY"
                    style={{ borderRight: CARD_CELL_RULE }} />
          <StatCell value={`${avgProtein}g`} label="AVG PROTEIN" accent />
        </div>

        {/* THE WEEKLY SHOP, from the screen that decides it. One list
            for every meal on this page, opened straight into the week
            view. Absent while the week is empty: there is no list. */}
        {weekProg?.total > 0 && (
          <button
            data-plan-week-grocery
            onClick={() => { setGroceryWeek(true); onChange?.('grocery') }}
            aria-label={`Groceries for the whole week: ${weekProg.got} of ${weekProg.total} got`}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)',
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
              background: 'none', border: 'none', borderTop: CARD_CELL_RULE,
              cursor: 'pointer', textAlign: 'left',
              ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 600,
              letterSpacing: 'var(--pq-track-label)', color: 'var(--pq-text-2)',
            }}>
            <span style={{ flex: 1 }}>GROCERIES FOR THE WHOLE WEEK</span>
            <span style={{
              color: weekProg.got === weekProg.total
                ? 'var(--pq-accent)' : 'var(--pq-text-muted)',
            }}>
              {weekProg.got === weekProg.total
                ? `ALL ${weekProg.total} GOT`
                : `${weekProg.got} OF ${weekProg.total} GOT`}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </Card>

      <div style={DAY_COLS[surface] ? {
        padding: '20px var(--pq-gutter) 0',
        display: 'grid', gridTemplateColumns: DAY_COLS[surface],
        gap: surface === 'desktop' ? 16 : 12, alignItems: 'start',
      } : {
        padding: '20px var(--pq-gutter) 0',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {weekPlan.map((day, dayIndex) => {
          const isToday = dayIndex === planToday
          const totals = dayTotals[dayIndex]
          /* Same pairing Today and Track use, so a meal cannot read as
             eaten here and still be offered for logging there. */
          const eatenBySlot = new Map(
            planVsLog(day.ids || [], logsByDay?.[dayIndex] || [])
              .planned.filter(p => p.log).map(p => [p.slot, p.log]))
          const prog = groceryProgress?.[dayIndex] || { total: 0, got: 0 }
          const hasMeals = (day.ids || []).some(Boolean)
          return (
            <div key={day.day} style={{
              background: 'var(--pq-panel)',
              border: `1px solid ${isToday ? 'var(--pq-accent)' : 'var(--pq-rule-soft)'}`,
              borderRadius: 'var(--pq-r-card)', overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderBottom: CARD_ROW_RULE,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    ...MONO, fontSize: 12, fontWeight: 600,
                    letterSpacing: 'var(--pq-track-label)',
                    color: isToday ? 'var(--pq-accent)' : 'var(--pq-text-3)',
                  }}>{day.day.toUpperCase()}</span>
                  {planDates?.[dayIndex] && (
                    <span style={{ ...MONO, fontSize: 11, color: 'var(--pq-text-3)' }}>
                      {fromISO(planDates[dayIndex])
                        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                    </span>
                  )}
                  {planUpcoming && dayIndex === 0 && (
                    <span style={{
                      ...MONO, fontSize: 9, fontWeight: 600, color: 'var(--pq-accent)',
                      border: '1px solid var(--pq-accent)',
                      padding: '1px 6px', borderRadius: 999,
                      letterSpacing: 'var(--pq-track-label)',
                    }}>DAY 1</span>
                  )}
                  {isToday && (
                    <span style={{
                      ...MONO, fontSize: 9, fontWeight: 600,
                      color: 'var(--pq-on-accent-ink)', background: 'var(--pq-accent-grad)',
                      padding: '2px 6px', borderRadius: 999,
                      letterSpacing: 'var(--pq-track-label)',
                    }}>TODAY</span>
                  )}
                </div>
                <span style={{
                  ...MONO, fontSize: 12, color: 'var(--pq-text-muted)', whiteSpace: 'nowrap',
                }}>
                  {totals.calories
                    ? `${totals.calories} / ${goals.calories} KCAL · ${totals.protein}G`
                    : 'EMPTY'}
                </span>
              </div>

              {/* ALWAYS ONE "Add a meal" ROW. A day with every slot
                  taken used to have nowhere to add from; now a spare
                  row is drawn after the last meal, and adding through
                  it grows the day by one. */}
              {((day.ids || []).some(x => !x) ? (day.ids || []) : [...(day.ids || []), null])
                .map((id, slot) => {
                const r = id ? recipeById[id] : null
                if (!r) {
                  return (
                    <button
                      key={slot}
                      onClick={() => setPicking({ dayIndex, label: day.day })}
                      style={{
                        width: '100%', minHeight: 'var(--pq-tap-min)',
                        display: 'flex', alignItems: 'center', gap: 11,
                        padding: '12px 14px', background: 'none', border: 'none',
                        borderBottom: '1px solid var(--pq-rule-meal)',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                      }}>
                      <span style={{
                        width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                        border: 'var(--pq-rule-dashed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="var(--pq-text-3)" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14" /><path d="M12 5v14" />
                        </svg>
                      </span>
                      <span style={{
                        fontSize: 'var(--pq-size-body)', fontWeight: 500, color: 'var(--pq-text-3)',
                      }}>Add a meal</span>
                    </button>
                  )
                }
                const eaten = eatenBySlot.has(slot)
                return (
                  <div key={slot} data-eaten={eaten ? '' : undefined} style={{
                    display: 'flex', alignItems: 'center',
                    borderBottom: '1px solid var(--pq-rule-meal)',
                  }}>
                    <button
                      onClick={() => setSheetRecipe(r)}
                      style={{
                        flex: 1, minWidth: 0, minHeight: 'var(--pq-tap-min)',
                        display: 'flex', alignItems: 'center', gap: 11,
                        padding: '10px 0 10px 14px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'var(--pq-sans)',
                      }}>
                      <Thumb recipe={r} size={36} src={r.image} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 500,
                          color: 'var(--pq-text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{r.name}</span>
                        <span style={{
                          ...MONO, display: 'block', fontSize: 'var(--pq-size-eyebrow)',
                          color: 'var(--pq-text-3)', marginTop: 2,
                        }}>
                          {r.cal} KCAL · {r.protein}G · {r.carbs}C · {r.fat}F
                          {eaten && (
                            <span style={{ color: 'var(--pq-accent)', fontWeight: 600 }}>
                              {' '}· ✓ EATEN
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => removeMeal(dayIndex, slot)}
                      aria-label={`Remove ${r.name} from ${day.day}`}
                      style={{
                        flexShrink: 0, width: 'var(--pq-tap-min)', height: 56,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: 'var(--pq-text-3)',
                      }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}

              {/* WHAT THE GROCERY LIST IS DOING ABOUT THIS DAY, and the
                  way to it. Only on a day that has meals: an empty day
                  has no list to open. */}
              {hasMeals && (
                <button
                  data-plan-grocery
                  onClick={() => openGroceryFor(dayIndex)}
                  aria-label={`Groceries for ${day.day}: ${prog.got} of ${prog.total} got`}
                  style={{
                    width: '100%', minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                    letterSpacing: 'var(--pq-track-label)',
                    color: 'var(--pq-text-muted)',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                  <span style={{ flex: 1 }}>GROCERIES</span>
                  <span style={{
                    color: prog.total > 0 && prog.got === prog.total
                      ? 'var(--pq-accent)' : 'var(--pq-text-muted)',
                  }}>
                    {prog.total === 0 ? 'NOTHING TO BUY'
                      : prog.got === prog.total ? `ALL ${prog.total} GOT`
                        : `${prog.got} OF ${prog.total} GOT`}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* The one place the app says out loud that these screens are
          connected. It is true, and it is why there is no "add to list"
          anywhere in Grocery. */}
      <p style={{
        ...MONO, padding: '14px 20px 0', margin: 0,
        fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)', lineHeight: 1.6,
      }}>CHANGES HERE UPDATE THE GROCERY LIST AUTOMATICALLY</p>

      {picking && (
        <RecipePicker
          dayLabel={picking.label}
          onClose={() => setPicking(null)}
          onPick={id => { assignMeal(picking.dayIndex, id); setPicking(null) }}
        />
      )}
      <RecipeSheet recipe={sheetRecipe} onClose={() => setSheetRecipe(null)} />
      <StartDateSheet open={choosingStart} onClose={() => setChoosingStart(false)} />
    </div>
  )
}
