import { useState } from 'react'
import Sheet from './Sheet'
import Thumb from './Thumb'
import { useAppStore } from '../store/useAppStore'
import { getRecipeDetails } from '../data/recipeDetails'

/* ── The recipe sheet — the ONE detail surface ────────────────────────
 *
 * Reached identically from Today, Plan, Recipes and Track. There is no
 * second detail view anywhere in the app, which is why this is built
 * before the four screens that open it.
 *
 * NOTHING HERE IS GENERATED. The version this replaces built a
 * description out of the recipe's tags — "A high-protein meal perfect
 * for meal prep, featuring tender chicken" — text that appeared to come
 * from the cookbook and came from a lookup table. Every string below is
 * either from `recipe-details.json`, from the recipe catalog, or a
 * fixed label.
 *
 * TWO THINGS IN THE PROTOTYPE ARE DELIBERATELY NOT PORTED, for the same
 * reason:
 *
 *   `servings: details?.servings || 4` — 88 of 260 recipes have no
 *   servings value, and the prototype prints "MAKES 4 SERVINGS" for
 *   every one of them. That is a number the cookbook does not give.
 *
 *   `prepTime(r.cal)` — a preparation time computed from the calorie
 *   count. It reads as extracted data and is arithmetic on an unrelated
 *   field.
 *
 * Both are simply absent here. The meta line says what is known and
 * stops.
 */

const SOURCE = { jalal: "JALAL'S", mealprep: 'MEAL PREP' }

/* ── Which ingredient lines are section headings? ─────────────────────
 *
 * The extracted lists interleave two kinds of line: ingredients, and the
 * component headings the books use to split a recipe ("(4 Servings)
 * Crispy Chicken", then its ingredients, then "(2 Servings) Cheese
 * Sauce"). The prototype renders them differently and so does this.
 *
 * ITS RULE IS NOT PORTED, BECAUSE IT IS MEASURABLY WRONG.
 * `t.startsWith('(') || t.endsWith(')')` classifies 581 of 4,949 lines
 * as headings, and 407 of those are real ingredients that merely end in
 * a parenthetical — "60ml (2.1oz) Buffalo Hot Sauce (or hot sauce of
 * choice)" would render as a section heading. Seven out of ten hits
 * wrong, and the failure is invisible: the food is still on screen,
 * dressed as a label.
 *
 * The rule below is the YIELD FORM — a leading parenthetical holding a
 * number and a portion word. Measured across all 4,949 lines:
 *
 *     matches                  107   all genuine headings
 *     never carries a quantity    0   no "(4 Servings) 200g ..." exists
 *     appears mid-line            0   so anchoring at the start is free
 *
 * The eight leading-paren lines it does NOT take are five `(Optional)`
 * ingredients and three parenthetical notes. Leaving those as ingredient
 * rows is the safe direction: a note shown as an ingredient is odd, an
 * ingredient shown as a heading is food you stop seeing.
 *
 * Unbalanced-paren lines are left as ingredients too. There are 22, and
 * they are extraction damage of both kinds at once — "(for 3- 4 Crispy
 * Chicken" is half a heading, "300g 10.6oz) Raw Chicken Breast" is a
 * whole ingredient missing a bracket. Too few and too mixed to rule on.
 */
const YIELD_HEADING = /^\(\s*\d+\s*(?:[-–]\s*\d+\s*)?[A-Za-z][A-Za-z ]*\)/

export const isHeading = line => YIELD_HEADING.test(String(line || ''))

export function metaLine(recipe, details) {
  const parts = [SOURCE[recipe.source] || 'RECIPE']
  /* Only when the book actually gives one — see above. */
  if (details?.servings) parts.push(`${details.servings} SERV`)
  return parts.join(' · ')
}

const MONO_LABEL = {
  fontFamily: 'var(--pq-mono)',
  fontSize: 'var(--pq-size-label)',
  fontWeight: 600,
  color: 'var(--pq-text-3)',
  letterSpacing: 'var(--pq-track-section)',
}

/* 36px is the drawn size in the prototype; 44px is the floor the handoff
   sets for every button. Both are honoured — the button is 44px and the
   tile it paints is 36px, so the target is never smaller than a thumb
   even where the design wants a small control. */
const ICON_BUTTON = {
  width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
}
const ICON_TILE = {
  width: 36, height: 36, borderRadius: 9,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--pq-thumb-fallback)',
  boxShadow: 'var(--pq-thumb-fallback-lip)',
}

export default function RecipeSheet({ recipe, onClose }) {
  const { favorites, toggleFavorite, logMeal, weekPlan, assignMeal } = useAppStore()
  const [picking, setPicking] = useState(false)

  if (!recipe) return null

  const details = getRecipeDetails(recipe)
  const ingredients = details?.ingredients || []
  const steps = details?.steps || []
  const faved = favorites.has(recipe.id)

  const macros = [
    { val: recipe.cal,           label: 'KCAL',    accent: true },
    { val: `${recipe.protein}g`, label: 'PROTEIN' },
    { val: `${recipe.carbs}g`,   label: 'CARBS' },
    { val: `${recipe.fat}g`,     label: 'FAT' },
  ]

  return (
    <>
      <Sheet open onClose={onClose} title={recipe.name}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px var(--pq-gutter) 12px',
          borderBottom: '1px solid var(--pq-rule-cell)',
        }}>
          <Thumb recipe={recipe} size={56} src={recipe.image} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--pq-size-sheet)', fontWeight: 700,
              color: 'var(--pq-text)', letterSpacing: '-.01em', lineHeight: 1.25,
            }}>{recipe.name}</div>
            <div style={{
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
              color: 'var(--pq-text-muted)', marginTop: 4,
              letterSpacing: 'var(--pq-track-chip)',
            }}>{metaLine(recipe, details)}</div>
          </div>

          <button
            onClick={() => toggleFavorite(recipe.id)}
            aria-label={faved ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={faved}
            style={ICON_BUTTON}
          >
            <svg width="16" height="16" viewBox="0 0 24 24"
              fill={faved ? 'var(--pq-accent)' : 'none'}
              stroke={faved ? 'var(--pq-accent)' : 'var(--pq-text-3)'}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </button>

          <button onClick={onClose} aria-label="Close" style={ICON_BUTTON}>
            <span style={ICON_TILE}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="var(--pq-text-muted)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </span>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        }}>
          {/* Macro strip. The last cell keeps its right rule, as in the
              prototype — the strip is flush to the sheet edge and the
              rule reads as the panel's own edge rather than a stray. */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
            borderBottom: '1px solid var(--pq-rule-cell)',
          }}>
            {macros.map(m => (
              <div key={m.label} style={{
                padding: '12px 14px', borderRight: '1px solid var(--pq-rule-row)',
              }}>
                <div style={{
                  fontFamily: 'var(--pq-mono)', fontSize: 16, fontWeight: 600,
                  lineHeight: 1,
                  color: m.accent ? 'var(--pq-accent)' : 'var(--pq-text)',
                }}>{m.val}</div>
                <div style={{
                  fontFamily: 'var(--pq-mono)', fontSize: 9,
                  color: 'var(--pq-text-3)',
                  letterSpacing: 'var(--pq-track-label)', marginTop: 5,
                }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* ── Ingredients ─────────────────────────────────────────
              ONE LINE, AS THE BOOK WROTE IT. The README describes a name
              column and a mono quantity column; the prototype renders
              the whole line and so does this. Splitting would mean
              parsing 4,949 free-text lines into two fields, and the
              block-B pipeline needed five stages and a named exclusion
              list to do that safely — while a single slash rule still
              turned "Light/Fat Free Evaporated Milk" into "light". The
              quantity is already in the line; it does not need moving to
              be read. */}
          <div style={{ padding: '16px var(--pq-gutter) 0' }}>
            <div style={{ ...MONO_LABEL, marginBottom: 8 }}>INGREDIENTS</div>

            {ingredients.length === 0 && (
              <p style={{
                fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
                fontStyle: 'italic', margin: '0 0 4px',
              }}>Ingredients coming soon</p>
            )}

            {ingredients.map((line, i) => isHeading(line) ? (
              <div key={i} style={{
                padding: '10px 0 4px',
                fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
                fontWeight: 600, color: 'var(--pq-text-muted)',
                letterSpacing: 'var(--pq-track-chip)',
              }}>{line}</div>
            ) : (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '9px 0', borderBottom: '1px solid var(--pq-rule-meal)',
              }}>
                <span aria-hidden="true" style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--pq-accent)',
                  flexShrink: 0, position: 'relative', top: -2,
                }} />
                <span style={{
                  flex: 1, fontSize: 'var(--pq-size-row)', fontWeight: 400,
                  color: 'var(--pq-text-2)', lineHeight: 1.4,
                }}>{line}</span>
              </div>
            ))}
          </div>

          {/* ── Steps ──────────────────────────────────────────────── */}
          <div style={{ padding: '20px var(--pq-gutter) 24px' }}>
            <div style={{ ...MONO_LABEL, marginBottom: 10 }}>INSTRUCTIONS</div>
            {steps.length === 0 ? (
              <p style={{
                fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
                fontStyle: 'italic', margin: 0,
              }}>Instructions coming soon</p>
            ) : (
              <ol style={{
                listStyle: 'none', margin: 0, padding: 0,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {steps.map((text, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, fontFamily: 'var(--pq-mono)',
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--pq-accent)', paddingTop: 2,
                    }}>{String(i + 1).padStart(2, '0')}</span>
                    <p style={{
                      flex: 1, margin: 0, fontSize: 13.5, fontWeight: 400,
                      color: 'var(--pq-text-2)', lineHeight: 1.6,
                    }}>{text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, display: 'flex', gap: 8,
          padding: '12px var(--pq-gutter) 16px',
          borderTop: '1px solid var(--pq-rule-cell)',
        }}>
          <button
            onClick={() => { logMeal(recipe.id, 'meal'); onClose?.() }}
            style={{
              flex: 1, minHeight: 'var(--pq-tap-min)', padding: 14,
              borderRadius: 'var(--pq-r-button)', border: 'none', cursor: 'pointer',
              background: 'var(--pq-accent-grad)',
              boxShadow: 'var(--pq-accent-raise)',
              color: 'var(--pq-on-accent-ink)',
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-body)',
              fontWeight: 600, letterSpacing: '.04em',
            }}>ATE THIS</button>
          <button
            onClick={() => setPicking(true)}
            style={{
              flex: 1, minHeight: 'var(--pq-tap-min)', padding: 14,
              borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
              border: '1px solid var(--pq-rule-strong)', background: 'transparent',
              color: 'var(--pq-text-2)',
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-body)',
              fontWeight: 600, letterSpacing: '.04em',
            }}>ADD TO PLAN</button>
        </div>
      </Sheet>

      {/* A second sheet rather than a slot inside this one: the day list
          is a separate decision, and replacing the sheet's body would
          lose the recipe you were reading. Stacks over it, as in the
          prototype. */}
      {picking && (
        <Sheet open onClose={() => setPicking(false)} title="Add to plan">
          <div style={{
            flexShrink: 0, padding: '16px var(--pq-gutter) 12px',
            borderBottom: '1px solid var(--pq-rule-cell)',
          }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: 'var(--pq-text)',
              letterSpacing: '-.01em',
            }}>Add to plan</div>
            <div style={{
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
              color: 'var(--pq-text-3)', marginTop: 3,
              letterSpacing: 'var(--pq-track-chip)',
            }}>{recipe.name.toUpperCase()}</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px var(--pq-gutter)' }}>
            {weekPlan.map((day, i) => {
              const full = (day.ids || []).every(Boolean)
              return (
                <button
                  key={day.day}
                  onClick={() => { assignMeal(i, recipe.id); setPicking(false); onClose?.() }}
                  disabled={full}
                  style={{
                    width: '100%', minHeight: 'var(--pq-tap-min)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, marginBottom: 6, padding: '11px 14px',
                    borderRadius: 'var(--pq-r-button)',
                    border: '1px solid var(--pq-rule-soft)',
                    background: 'var(--pq-panel)',
                    cursor: full ? 'default' : 'pointer',
                    opacity: full ? 0.45 : 1,
                    fontFamily: 'var(--pq-mono)',
                  }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--pq-text)',
                    letterSpacing: 'var(--pq-track-label)',
                  }}>{day.day.toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: 'var(--pq-text-3)' }}>
                    {full ? 'FULL' : `${(day.ids || []).filter(Boolean).length}/${(day.ids || []).length} PLANNED`}
                  </span>
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </>
  )
}
