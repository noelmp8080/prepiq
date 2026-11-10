import { useState } from 'react'
import Card, { CARD_ROW_RULE, EmptyBlock } from './Card'
import RecipeSheet from './RecipeSheet'
import ScreenHeader from './ScreenHeader'
import { useAppStore } from '../store/useAppStore'
import { recipeById } from '../data/recipes'
import { planVsLog, pct, sumMacros, sumLog } from '../store/storeLogic'
import { ResetButton } from './ResetSheet'

/* ── Track — what I actually ate ──────────────────────────────────────
 *
 * The other end of the same pairing Today draws. Today marks planned
 * meals already eaten; Track offers the ones that are not, under
 * `PLANNED · ONE TAP TO LOG`. Both call planVsLog, because two
 * implementations of "is this one logged?" is how Today ticks a meal
 * while Track still offers it — and the tap logs it twice.
 *
 * THE MACRO CARD IS NOT TODAY'S. The README says Track uses "the same
 * four-cell grid as Today"; the markup gives it a different treatment
 * entirely — a large kcal readout over a 4px bar, then three stacked
 * label/value rows with 3px bars. Ruled toward the markup. It is also
 * the better fit: Track is where you look at how the day went, so the
 * number gets the room.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

const EYEBROW = {
  ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
  color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-section)',
  marginBottom: 10,
}

function dateEyebrow(date = new Date()) {
  const day = date.toLocaleDateString('en-US', { weekday: 'short' })
  const rest = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day} · ${rest}`.toUpperCase()
}

function Bar({ value, goal, height, fill }) {
  return (
    <div style={{
      height, borderRadius: 2, overflow: 'hidden',
      background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
    }}>
      <div style={{
        height: '100%', width: `${pct(value, goal)}%`, borderRadius: 2,
        background: fill, transition: 'width .3s',
      }} />
    </div>
  )
}

const COLS = { tablet: '300px minmax(0,1fr)', desktop: '360px minmax(0,1fr)' }

const LINK = {
  flex: 1, minHeight: 'var(--pq-tap-min)', padding: '0 12px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
  letterSpacing: 'var(--pq-track-label)', color: 'var(--pq-text-muted)',
}

/* ── THE WEEK, PLANNED AGAINST EATEN ──────────────────────────────────
 *
 * Track used to know about one day. It read today's plan and today's
 * log and nothing else, so it could not say how the week was going and
 * nothing on it led anywhere but the recipe list — which is why it read
 * as a screen on its own.
 *
 * One column per plan day. A day that has happened shows what was
 * LOGGED, filled in the accent; a day still to come shows what is
 * PLANNED, as a dim fill, because that is the only number it has. Both
 * are drawn against the same daily target, so a tall dim bar on Thursday
 * is the plan telling you Thursday is over target before you eat it.
 *
 * The two doors under it go to the screens the numbers come from.
 */
function WeekCard({
  weekPlan, planToday, logsByDay, goals, groceryUnchecked, onChange, onOpenGrocery, style,
}) {
  const days = weekPlan.map((d, i) => {
    /* Rounded: a few recipes carry half-calories, and "6,727.5 PLANNED"
       is precision the cookbook does not have. */
    const planned = Math.round(sumMacros((d.ids || []).filter(Boolean), recipeById).calories)
    const logged = Math.round(sumLog(logsByDay?.[i] || [], recipeById).calories)
    const future = i > planToday
    return { label: d.day, planned, logged, future, today: i === planToday,
             shown: future ? planned : logged }
  })
  const weekLogged = days.reduce((n, d) => n + d.logged, 0)
  const weekPlanned = days.reduce((n, d) => n + d.planned, 0)

  return (
    <Card data-track-week style={{ padding: '14px 12px 0', ...style }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '0 4px', marginBottom: 12,
      }}>
        <span style={{ ...EYEBROW, marginBottom: 0 }}>THIS WEEK</span>
        <span style={{ ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)' }}>
          {weekLogged.toLocaleString()} EATEN · {weekPlanned.toLocaleString()} PLANNED
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {days.map(d => (
          <div key={d.label} data-week-day
            aria-label={`${d.label}: ${d.logged} kcal eaten, ${d.planned} planned`}
            style={{
              flex: 1, minWidth: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            }}>
            <div style={{
              width: '100%', height: 44, borderRadius: 4, overflow: 'hidden',
              display: 'flex', alignItems: 'flex-end',
              background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
              outline: d.today ? '1px solid var(--pq-accent)' : 'none',
            }}>
              <div style={{
                width: '100%', height: `${pct(d.shown, goals.calories)}%`,
                background: d.future ? 'var(--pq-text-3)' : 'var(--pq-accent-bar)',
                opacity: d.future ? 0.45 : 1,
                transition: 'height .3s',
              }} />
            </div>
            <span style={{
              ...MONO, fontSize: 10, fontWeight: 600,
              color: d.today ? 'var(--pq-accent)' : 'var(--pq-text-3)',
              letterSpacing: 'var(--pq-track-label)',
            }}>{d.label.toUpperCase()}</span>
            <span style={{
              ...MONO, fontSize: 10,
              color: d.future ? 'var(--pq-text-3)' : 'var(--pq-text-2)',
            }}>{d.shown || '—'}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', borderTop: CARD_ROW_RULE, margin: '12px -12px 0',
      }}>
        <button data-track-to-plan onClick={() => onChange?.('plan')} style={LINK}>
          <span>WEEK PLAN</span><span aria-hidden="true">›</span>
        </button>
        <button data-track-to-grocery onClick={onOpenGrocery}
          style={{ ...LINK, borderLeft: CARD_ROW_RULE }}>
          <span>GROCERIES{groceryUnchecked > 0 ? ` · ${groceryUnchecked} LEFT TODAY` : ''}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </Card>
  )
}

export default function Track({ onChange, onReset, surface = 'phone' }) {
  const cols = COLS[surface]
  const {
    weekPlan, planToday, mealLog, goals, consumed,
    logMeal, removeLoggedMeal, logsByDay, groceryProgress, setGroceryDay,
  } = useAppStore()
  const todayProg = groceryProgress?.[planToday] || { total: 0, got: 0 }
  const todayGroceryLeft = todayProg.total - todayProg.got

  const [sheetRecipe, setSheetRecipe] = useState(null)

  const day = weekPlan[planToday]
  const { planned } = planVsLog(day?.ids || [], mealLog)
  /* Renderable, not merely planned — a retired recipe id renders nothing,
     and gating the Card on the unfiltered count draws an empty box. Same
     defect as Today's. */
  const uneaten = planned.filter(p => !p.log && recipeById[p.recipeId])

  const left = goals.calories - consumed.calories

  /* WHAT TODAY'S PLAN ADDS UP TO, against the same target the bar
     above it measures. The log says where you are; this says where the
     plan will leave you, which is the number you can still change. */
  const plannedToday = sumMacros(
    planned.filter(p => recipeById[p.recipeId]).map(p => p.recipeId), recipeById)
  const planGap = goals.calories - plannedToday.calories
  const nothingPlanned = plannedToday.calories === 0 && planned.length === 0

  return (
    <div>
      <ScreenHeader
        surface={surface}
        eyebrow={dateEyebrow()}
        title="Track"
        actions={<>
          {onReset && <ResetButton onClick={onReset} />}
          <button
            onClick={() => onChange?.('recipes')}
            style={{
              flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
              display: 'flex', alignItems: 'center', gap: 6,
              borderRadius: 'var(--pq-r-button)', border: 'none', cursor: 'pointer',
              background: 'var(--pq-accent-grad)', boxShadow: 'var(--pq-accent-raise)',
              color: 'var(--pq-on-accent-ink)',
              ...MONO, fontSize: 12, fontWeight: 600, letterSpacing: '.04em',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            LOG
          </button>
        </>}
      />

      <div style={cols ? {
        display: 'grid', gridTemplateColumns: cols,
        gap: surface === 'desktop' ? 26 : 20,
        alignItems: 'start', padding: '0 var(--pq-gutter)',
      } : undefined}>
      <div>
      {/* ── Macro card ──────────────────────────────────────────── */}
      <Card style={{ margin: cols ? '20px 0 0' : '20px var(--pq-gutter) 0', padding: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              ...MONO, fontSize: 30, fontWeight: 600, lineHeight: 1,
              color: 'var(--pq-accent)',
            }}>{consumed.calories}</span>
            <span style={{ ...MONO, fontSize: 13, color: 'var(--pq-text-3)' }}>
              / {goals.calories} kcal
            </span>
          </div>
          <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-muted)' }}>
            {left >= 0 ? `${left} LEFT` : `${Math.abs(left)} OVER`}
          </span>
        </div>
        <div style={{ marginBottom: 18 }}>
          <Bar value={consumed.calories} goal={goals.calories} height={4} fill="var(--pq-accent-bar)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'PROTEIN', value: consumed.protein, goal: goals.protein },
            { label: 'CARBS',   value: consumed.carbs,   goal: goals.carbs },
            { label: 'FAT',     value: consumed.fat,     goal: goals.fat },
          ].map(m => (
            <div key={m.label}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', marginBottom: 5,
              }}>
                <span style={{
                  ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
                  color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-label)',
                }}>{m.label}</span>
                <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-2)' }}>
                  {m.value}g / {m.goal}g
                </span>
              </div>
              <Bar value={m.value} goal={m.goal} height={3} fill="var(--pq-text)" />
            </div>
          ))}
        </div>

        {/* The plan, measured against the same target. */}
        {!nothingPlanned && (
          <div data-track-planned style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
            marginTop: 16, paddingTop: 12, borderTop: CARD_ROW_RULE,
            ...MONO, fontSize: 'var(--pq-size-eyebrow)',
            letterSpacing: 'var(--pq-track-label)',
          }}>
            <span style={{ color: 'var(--pq-text-muted)' }}>
              TODAY’S PLAN · {plannedToday.calories} KCAL · {plannedToday.protein}G
            </span>
            <span style={{ color: 'var(--pq-text-3)', whiteSpace: 'nowrap' }}>
              {planGap >= 0 ? `${planGap} UNDER` : `${Math.abs(planGap)} OVER`}
            </span>
          </div>
        )}
      </Card>

      <WeekCard
        weekPlan={weekPlan} planToday={planToday} logsByDay={logsByDay}
        goals={goals} onChange={onChange}
        /* TODAY'S, not the selected grocery day's. Track is about today,
           so its count is today's — and the door opens the list there. */
        groceryUnchecked={todayGroceryLeft}
        onOpenGrocery={() => { setGroceryDay(null); onChange?.('grocery') }}
        style={{ margin: cols ? '16px 0 0' : '16px var(--pq-gutter) 0' }}
      />
      </div>

      <div>
      {/* ── Nothing planned ─────────────────────────────────────────
          Said out loud, with the way to fix it. Track used to show
          nothing at all here, which looked like a screen that did not
          know the plan existed. */}
      {nothingPlanned && (
        <div style={{ padding: cols ? '20px 0 0' : '24px var(--pq-gutter) 0' }}>
          <div style={EYEBROW}>PLANNED</div>
          <EmptyBlock
            as="button"
            onClick={() => onChange?.('plan')}
            style={{ padding: 22, width: '100%', background: 'none', cursor: 'pointer' }}
          >
            <p style={{
              margin: '0 0 4px', fontSize: 'var(--pq-size-row)', fontWeight: 500,
              color: 'var(--pq-text-muted)',
            }}>Nothing planned for today</p>
            <p style={{ ...MONO, margin: 0, fontSize: 12, color: 'var(--pq-text-3)' }}>
              TAP TO OPEN THE WEEK PLAN
            </p>
          </EmptyBlock>
        </div>
      )}

      {/* ── Planned, not yet logged ─────────────────────────────── */}
      {uneaten.length > 0 && (
        <div style={{ padding: cols ? '20px 0 0' : '24px var(--pq-gutter) 0' }}>
          <div style={EYEBROW}>PLANNED · ONE TAP TO LOG</div>
          <Card>
            {uneaten.map(({ recipeId, slot }) => {
              const r = recipeById[recipeId]
              return (
                <button
                  key={`${slot}-${recipeId}`}
                  onClick={() => logMeal(r.id, 'planned')}
                  aria-label={`Log ${r.name}`}
                  style={{
                    width: '100%', minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                    background: 'none', border: 'none', borderBottom: CARD_ROW_RULE,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                  }}>
                  <span aria-hidden="true" style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    border: '1.5px dashed var(--pq-rule-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="var(--pq-text-muted)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="M12 5v14" />
                    </svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 600,
                      color: 'var(--pq-text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{r.name}</span>
                    <span style={{
                      ...MONO, display: 'block', fontSize: 'var(--pq-size-eyebrow)',
                      color: 'var(--pq-text-muted)', marginTop: 2,
                    }}>{r.protein}G PROTEIN · {r.carbs}C · {r.fat}F</span>
                  </span>
                  <span style={{
                    ...MONO, fontSize: 13, color: 'var(--pq-text-muted)', flexShrink: 0,
                  }}>{r.cal}</span>
                </button>
              )
            })}
          </Card>
        </div>
      )}

      {/* ── Logged ──────────────────────────────────────────────── */}
      <div style={{ padding: cols ? '24px 0 0' : '24px var(--pq-gutter) 0' }}>
        <div style={EYEBROW}>LOGGED</div>
        {mealLog.length === 0 ? (
          <EmptyBlock style={{ padding: 22 }}>
            <p style={{
              margin: 0, fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
            }}>Nothing logged yet today</p>
          </EmptyBlock>
        ) : (
          <Card>
            {mealLog.map(entry => {
              const r = recipeById[entry.recipeId]
              return (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 4px 12px 12px', borderBottom: CARD_ROW_RULE,
                }}>
                  <button
                    onClick={() => r && setSheetRecipe(r)}
                    style={{
                      flex: 1, minWidth: 0, minHeight: 'var(--pq-tap-min)',
                      display: 'block', textAlign: 'left',
                      background: 'none', border: 'none', padding: 0,
                      cursor: r ? 'pointer' : 'default', fontFamily: 'var(--pq-sans)',
                    }}>
                    <span style={{
                      display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 600,
                      color: 'var(--pq-text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{r?.name || 'Removed recipe'}</span>
                    <span style={{
                      ...MONO, display: 'block', fontSize: 'var(--pq-size-eyebrow)',
                      color: 'var(--pq-text-muted)', marginTop: 2,
                    }}>{r ? `${r.protein}G PROTEIN` : '—'}{entry.time ? ` · ${entry.time}` : ''}</span>
                  </button>
                  <span style={{
                    ...MONO, fontSize: 13, color: 'var(--pq-accent)', flexShrink: 0,
                  }}>{r?.cal ?? 0}</span>
                  <button
                    onClick={() => removeLoggedMeal(entry.id)}
                    aria-label={`Remove ${r?.name || 'entry'}`}
                    style={{
                      flexShrink: 0, width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)',
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
          </Card>
        )}
      </div>

      </div>
      </div>

      <RecipeSheet recipe={sheetRecipe} onClose={() => setSheetRecipe(null)} />
    </div>
  )
}
