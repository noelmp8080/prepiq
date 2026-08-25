import { useState, useMemo } from 'react'
import Card, { CARD_ROW_RULE, CARD_CELL_RULE } from './Card'
import Sheet from './Sheet'
import Thumb from './Thumb'
import ScreenHeader from './ScreenHeader'
import RecipeSheet from './RecipeSheet'
import { useAppStore } from '../store/useAppStore'
import { recipes, recipeById } from '../data/recipes'
import { sumMacros } from '../store/storeLogic'

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

function weekRange(date = new Date()) {
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(monday)} – ${f(sunday)}`.toUpperCase()
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

export default function Plan({ surface = 'phone' }) {
  const { weekPlan, planToday, assignMeal, removeMeal, shuffleWeekPlan } = useAppStore()
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
        eyebrow={weekRange()}
        title="Week"
        actions={
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
        }
      />

      <Card style={{ margin: '20px var(--pq-gutter) 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <StatCell value={weekKcal.toLocaleString()} label="WEEK KCAL"
                    style={{ borderRight: CARD_CELL_RULE }} />
          <StatCell value={avgKcal.toLocaleString()} label="AVG / DAY"
                    style={{ borderRight: CARD_CELL_RULE }} />
          <StatCell value={`${avgProtein}g`} label="AVG PROTEIN" accent />
        </div>
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
                  {isToday && (
                    <span style={{
                      ...MONO, fontSize: 9, fontWeight: 600,
                      color: 'var(--pq-on-accent-ink)', background: 'var(--pq-accent-grad)',
                      padding: '2px 6px', borderRadius: 4,
                      letterSpacing: 'var(--pq-track-label)',
                    }}>TODAY</span>
                  )}
                </div>
                <span style={{
                  ...MONO, fontSize: 12, color: 'var(--pq-text-muted)', whiteSpace: 'nowrap',
                }}>
                  {totals.calories ? `${totals.calories} KCAL · ${totals.protein}G` : 'EMPTY'}
                </span>
              </div>

              {(day.ids || []).map((id, slot) => {
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
                        width: 36, height: 36, borderRadius: 7, flexShrink: 0,
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
                return (
                  <div key={slot} style={{
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
                        }}>{r.cal} KCAL · {r.protein}G · {r.carbs}C · {r.fat}F</span>
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
    </div>
  )
}
