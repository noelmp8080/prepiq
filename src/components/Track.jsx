import { useState } from 'react'
import Card, { CARD_ROW_RULE, EmptyBlock } from './Card'
import RecipeSheet from './RecipeSheet'
import { useAppStore } from '../store/useAppStore'
import { recipeById } from '../data/recipes'
import { planVsLog, pct } from '../store/storeLogic'

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

const COLS = { tablet: '300px 1fr', desktop: '360px 1fr' }

export default function Track({ onChange, surface = 'phone' }) {
  const cols = COLS[surface]
  const {
    weekPlan, planToday, mealLog, goals, consumed,
    logMeal, removeLoggedMeal,
  } = useAppStore()

  const [sheetRecipe, setSheetRecipe] = useState(null)

  const day = weekPlan[planToday]
  const { planned } = planVsLog(day?.ids || [], mealLog)
  const uneaten = planned.filter(p => !p.log)

  const left = goals.calories - consumed.calories

  return (
    <div>
      <div style={{
        padding: '24px 20px 0', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{
            ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
            color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-eyebrow)',
            marginBottom: 6,
          }}>{dateEyebrow()}</div>
          <h1 style={{
            margin: 0, fontSize: 'var(--pq-size-title)', fontWeight: 700,
            letterSpacing: 'var(--pq-tight-title)', lineHeight: 1, color: 'var(--pq-text)',
          }}>Track</h1>
        </div>
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
      </div>

      <div style={cols ? {
        display: 'grid', gridTemplateColumns: cols,
        gap: surface === 'desktop' ? 26 : 20,
        alignItems: 'start', padding: '0 var(--pq-gutter)',
      } : undefined}>
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
      </Card>

      <div>
      {/* ── Planned, not yet logged ─────────────────────────────── */}
      {uneaten.length > 0 && (
        <div style={{ padding: cols ? '20px 0 0' : '24px var(--pq-gutter) 0' }}>
          <div style={EYEBROW}>PLANNED · ONE TAP TO LOG</div>
          <Card>
            {uneaten.map(({ recipeId, slot }) => {
              const r = recipeById[recipeId]
              if (!r) return null
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
