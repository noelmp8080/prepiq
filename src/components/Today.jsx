import { useState } from 'react'
import Card, { CARD_ROW_RULE, CARD_CELL_RULE, EmptyBlock } from './Card'
import Logo from './Logo'
import Thumb from './Thumb'
import Settings from './Settings'
import RecipeSheet from './RecipeSheet'
import { useAppStore } from '../store/useAppStore'
import { recipeById } from '../data/recipes'
import { planVsLog, sumMacros, pct } from '../store/storeLogic'

/* ── Today — a VIEW of the plan, not a screen with its own state ──────
 *
 * This is where the connected model becomes visible. Today holds
 * nothing: it reads `weekPlan[planToday]`, pairs those meals against the
 * log, and renders. Change a meal on Plan and this changes on the next
 * render, with nothing to sync and nothing to press.
 *
 * The version this replaces read only `mealLog` — it never mentioned
 * `weekPlan` at all, which is why the block-B chain walk could not be
 * completed and was carried forward into this block.
 *
 * THE MACRO CARD IS TWO CELLS, NOT FOUR. The README describes a 2x2 grid
 * with four progress bars; the prototype markup has KCAL and PROTEIN as
 * cells and carbs/fat as a summary line beneath. Ruled toward the markup
 * — the fourth such ruling, and the reasoning is in DEVIATIONS.md. Carbs
 * and fat are still on screen; they are simply not given a bar, which is
 * the honest hierarchy for a meal-prep app where protein is the number
 * you steer by.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

const EYEBROW = {
  ...MONO, fontSize: 'var(--pq-size-eyebrow)', fontWeight: 500,
  color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-section)',
}

function dateEyebrow(date = new Date()) {
  const day = date.toLocaleDateString('en-US', { weekday: 'short' })
  const rest = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day} · ${rest}`.toUpperCase()
}

/* One macro cell: mono label, big mono value against its goal, and a bar.
   The bar's track is the app's inset well token rather than the
   markup's one-off rgba(0,0,0,0.42) — same recessed channel, defined
   once. Its 3px height is the markup's. */
function MacroCell({ label, value, goal, suffix = '', accent, fill, style }) {
  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{
        ...MONO, fontSize: 'var(--pq-size-label)', fontWeight: 500,
        color: 'var(--pq-text-muted)', letterSpacing: 'var(--pq-track-eyebrow)',
        marginBottom: 8,
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 10 }}>
        <span style={{
          ...MONO, fontSize: 'var(--pq-size-stat-lg)', fontWeight: 600, lineHeight: 1,
          color: accent ? 'var(--pq-accent)' : 'var(--pq-text)',
        }}>{value}{suffix}</span>
        <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-3)' }}>
          / {goal}{suffix}
        </span>
      </div>
      <div style={{
        height: 3, borderRadius: 2, overflow: 'hidden',
        background: 'var(--pq-track-bg)', boxShadow: 'var(--pq-track-shadow)',
      }}>
        <div style={{
          height: '100%', width: `${pct(value, goal)}%`, borderRadius: 2,
          background: fill, transition: 'width .3s',
        }} />
      </div>
    </div>
  )
}

export default function Today({ onChange }) {
  const {
    weekPlan, planToday, mealLog, goals, consumed,
    logMeal, removeLoggedMeal,
  } = useAppStore()

  const [showSettings, setShowSettings] = useState(false)
  const [sheetRecipe, setSheetRecipe] = useState(null)

  const day = weekPlan[planToday]
  const { planned, extras } = planVsLog(day?.ids || [], mealLog)
  const plannedTotals = sumMacros(planned.map(p => p.recipeId), recipeById)

  const remaining = goals.calories - consumed.calories

  return (
    <div>
      {/* ── Logo lockup ─────────────────────────────────────────── */}
      <div style={{ padding: '18px 20px 0' }}>
        <Logo size={30} />
      </div>

      {/* ── Date, title, settings ───────────────────────────────── */}
      <div style={{
        padding: '14px 20px 0', display: 'flex',
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
            letterSpacing: 'var(--pq-tight-title)', lineHeight: 1,
            color: 'var(--pq-text)',
          }}>Today</h1>
        </div>
        {/* The tile is the design's 40px; the target around it is the
            handoff's own 44px floor. */}
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          style={{
            width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
          <span style={{
            width: 40, height: 40, borderRadius: 'var(--pq-r-button)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--pq-thumb-fallback)',
            border: '1px solid var(--pq-rule-strong)',
            boxShadow: 'var(--pq-thumb-fallback-lip)',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="var(--pq-text-2)" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
        </button>
      </div>

      {/* ── Macro card ──────────────────────────────────────────── */}
      <Card style={{ margin: '20px var(--pq-gutter) 0' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          borderBottom: CARD_CELL_RULE,
        }}>
          <MacroCell
            label="KCAL" value={consumed.calories} goal={goals.calories}
            accent fill="var(--pq-accent-bar)"
            style={{ borderRight: CARD_CELL_RULE }}
          />
          <MacroCell
            label="PROTEIN" value={consumed.protein} goal={goals.protein}
            suffix="g" fill="var(--pq-text)"
          />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
        }}>
          <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-muted)' }}>
            {remaining >= 0 ? `${remaining} LEFT` : `${Math.abs(remaining)} OVER`}
          </span>
          <span style={{ ...MONO, fontSize: 12, color: 'var(--pq-text-3)' }}>
            C {consumed.carbs}g · F {consumed.fat}g
          </span>
        </div>
      </Card>

      {/* ── Planned today ───────────────────────────────────────── */}
      <div style={{ padding: '26px var(--pq-gutter) 0' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <span style={EYEBROW}>PLANNED TODAY</span>
          <span style={{ ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)' }}>
            {planned.length
              ? `${planned.filter(p => p.log).length}/${planned.length} · ${plannedTotals.calories} KCAL`
              : ''}
          </span>
        </div>

        {planned.length === 0 ? (
          <EmptyBlock
            as="button"
            onClick={() => onChange?.('plan')}
            style={{ padding: 24, width: '100%', background: 'none', cursor: 'pointer' }}
          >
            <p style={{
              margin: '0 0 4px', fontSize: 'var(--pq-size-row)', fontWeight: 500,
              color: 'var(--pq-text-muted)',
            }}>Nothing planned for today</p>
            <p style={{ ...MONO, margin: 0, fontSize: 12, color: 'var(--pq-text-3)' }}>
              TAP TO OPEN THE WEEK PLAN
            </p>
          </EmptyBlock>
        ) : (
          <Card>
            {planned.map(({ recipeId, slot, log }) => {
              const r = recipeById[recipeId]
              if (!r) return null
              const done = !!log
              return (
                <div key={`${slot}-${recipeId}`} style={{
                  display: 'flex', alignItems: 'stretch', borderBottom: CARD_ROW_RULE,
                }}>
                  {/* The row opens the sheet; the button logs. Two
                      targets, because "tap to read" and "tap to record"
                      are different intentions and the second is not
                      undoable by tapping again. */}
                  <button
                    onClick={() => setSheetRecipe(r)}
                    style={{
                      flex: 1, minWidth: 0, minHeight: 'var(--pq-tap-min)',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0 12px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'var(--pq-sans)',
                      opacity: done ? 0.55 : 1, transition: 'opacity var(--pq-t-paint)',
                    }}>
                    <Thumb recipe={r} size={48} src={r.image} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 'var(--pq-size-meal)', fontWeight: 600,
                        color: 'var(--pq-text)', letterSpacing: '-.01em', lineHeight: 1.25,
                        textDecoration: done ? 'line-through' : 'none',
                      }}>{r.name}</span>
                      <span style={{
                        ...MONO, display: 'block', fontSize: 12,
                        color: 'var(--pq-text-muted)', marginTop: 3,
                      }}>{r.cal} KCAL · {r.protein}G PROTEIN</span>
                    </span>
                  </button>

                  <button
                    onClick={() => done ? removeLoggedMeal(log.id) : logMeal(r.id, 'planned')}
                    aria-label={done ? `Unlog ${r.name}` : `Log ${r.name}`}
                    style={{
                      flexShrink: 0, width: 86, minHeight: 'var(--pq-tap-min)',
                      margin: '12px 12px 12px 8px', borderRadius: 9, cursor: 'pointer',
                      ...MONO, fontSize: 11, fontWeight: 600, letterSpacing: 'var(--pq-track-chip)',
                      background: done ? 'transparent' : 'var(--pq-accent-grad)',
                      boxShadow: done ? 'none' : 'var(--pq-accent-raise)',
                      border: done ? '1px solid var(--pq-rule-soft)' : 'none',
                      color: done ? 'var(--pq-text-3)' : 'var(--pq-on-accent-ink)',
                    }}>{done ? 'LOGGED' : 'ATE IT'}</button>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      {/* ── Also logged ─────────────────────────────────────────────
          Only when the log holds something the plan did not. */}
      {extras.length > 0 && (
        <div style={{ padding: '24px var(--pq-gutter) 0' }}>
          <div style={{ ...EYEBROW, marginBottom: 10 }}>ALSO LOGGED</div>
          <Card>
            {extras.map(entry => {
              const r = recipeById[entry.recipeId]
              return (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 12, borderBottom: CARD_ROW_RULE,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--pq-size-row)', fontWeight: 600, color: 'var(--pq-text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{r?.name || 'Removed recipe'}</div>
                    <div style={{
                      ...MONO, fontSize: 'var(--pq-size-eyebrow)',
                      color: 'var(--pq-text-muted)', marginTop: 2,
                    }}>{r ? `${r.protein}G PROTEIN` : ''} {entry.time || ''}</div>
                  </div>
                  <span style={{
                    ...MONO, fontSize: 13, color: 'var(--pq-accent)', flexShrink: 0,
                  }}>{r?.cal ?? 0}</span>
                  <button
                    onClick={() => removeLoggedMeal(entry.id)}
                    aria-label={`Remove ${r?.name || 'entry'}`}
                    style={{
                      width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--pq-text-faint)',
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </Card>
        </div>
      )}

      {/* Anything eaten that was never planned goes through Track, which
          is the screen built for choosing a recipe. */}
      <div style={{ padding: '20px var(--pq-gutter) 0' }}>
        <button
          onClick={() => onChange?.('track')}
          style={{
            width: '100%', minHeight: 'var(--pq-tap-min)',
            borderRadius: 'var(--pq-r-button)', background: 'transparent',
            border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
            color: 'var(--pq-text-2)', fontSize: 'var(--pq-size-body)',
            fontWeight: 500, fontFamily: 'var(--pq-sans)',
          }}>+ Log something else</button>
      </div>

      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
      <RecipeSheet recipe={sheetRecipe} onClose={() => setSheetRecipe(null)} />
    </div>
  )
}
