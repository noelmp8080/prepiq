import { useState } from 'react'
import Sheet from './Sheet'
import Thumb from './Thumb'
import DayChips from './DayChips'
import GuidesSheet from './GuidesSheet'
import { useAppStore } from '../store/useAppStore'
import { getRecipeContent } from '../data/recipeContent'

/* ── The recipe sheet — the ONE detail surface ────────────────────────
 *
 * Reached identically from Today, Plan, Recipes and Track. There is no
 * second detail view anywhere in the app.
 *
 * NOTHING HERE IS GENERATED. Every string below is either from
 * `recipeContent.json` (printed in the books, extracted by
 * tools/extract-recipe-content.py), from the recipe catalog, or a fixed
 * label. A part the book does not print for a recipe — an intro, a tip,
 * a video, a yield — is simply absent: no empty box, no placeholder.
 *
 * Two things an earlier prototype did are deliberately not done, for the
 * same reason: it printed "MAKES 4 SERVINGS" for every recipe that has
 * no count (a number the cookbook does not give), and it computed a
 * prep time from the calorie count (arithmetic on an unrelated field
 * that reads as extracted data).
 *
 * ORDER, as agreed in the recipe-content mockups (2026-11-13):
 *   header · intro · macros (+ sauce switch) · ingredients by group ·
 *   steps · cook's notes · serve it with · storage guide · watch it made
 * and the day chips + I ATE THIS TODAY stay fixed at the bottom.
 */

const SOURCE = { jalal: "JALAL'S", mealprep: 'MEAL PREP' }

export function metaLine(recipe, content) {
  const parts = [SOURCE[recipe.source] || 'RECIPE']
  if (content?.batch) parts.push('BATCH PROTEIN')
  /* Only when the book actually gives one. */
  if (content?.makes) parts.push(content.makes)
  return parts.join(' · ')
}

const MONO_LABEL = {
  fontFamily: 'var(--pq-mono)',
  fontSize: 'var(--pq-size-label)',
  fontWeight: 600,
  color: 'var(--pq-text-3)',
  letterSpacing: 'var(--pq-track-section)',
}

const SECTION = { padding: '20px var(--pq-gutter) 0' }

const BOX = {
  background: 'var(--pq-page)', border: 'var(--pq-card-border)',
  borderRadius: 16,
}

const BODY_TEXT = {
  margin: 0, fontSize: 13.5, fontWeight: 400,
  color: 'var(--pq-text-2)', lineHeight: 1.55,
}

/* 36px is the drawn size; 44px is the floor for every button. The button
   is 44px and the tile it paints is 36px. */
const ICON_BUTTON = {
  width: 'var(--pq-tap-min)', height: 'var(--pq-tap-min)', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
}
const ICON_TILE = {
  width: 36, height: 36, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--pq-thumb-fallback)',
  boxShadow: 'var(--pq-thumb-fallback-lip)',
}

const VIDEO_LABELS = [['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram']]

function Label({ children, right }) {
  return (
    <div style={{
      ...MONO_LABEL, marginBottom: 8,
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <span>{children}</span>
      {right != null && <span style={{ fontWeight: 500, letterSpacing: 'var(--pq-track-caption)' }}>{right}</span>}
    </div>
  )
}

function Dotted({ items, dot = 'var(--pq-text-3)' }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((t, i) => (
        <li key={i} style={{ ...BODY_TEXT, position: 'relative', paddingLeft: 14 }}>
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, top: 8, width: 5, height: 5,
            borderRadius: '50%', background: dot,
          }} />
          {t}
        </li>
      ))}
    </ul>
  )
}

function Ruled({ items }) {
  return (
    <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
      {items.map((t, i) => (
        <li key={i} style={{
          ...BODY_TEXT, padding: '7px 0', borderBottom: '1px solid var(--pq-rule-meal)',
        }}>{t}</li>
      ))}
    </ul>
  )
}

export default function RecipeSheet({ recipe, onClose }) {
  const {
    favorites, toggleFavorite, logMeal, weekPlan, planToday, assignMeal, unassignMeal,
  } = useAppStore()
  /* The sauce switch and the guide belong to the recipe they were set
     on, so opening another recipe starts them over. */
  const [sauceFor, setSauceFor] = useState(null)
  const [guideFor, setGuideFor] = useState(null)

  if (!recipe) return null

  /* Which days already hold this recipe — the lit chips. */
  const onDays = weekPlan
    .map((d, i) => ((d.ids || []).includes(recipe.id) ? i : -1))
    .filter(i => i >= 0)

  const content = getRecipeContent(recipe)
  const groups = content?.groups || []
  const steps = content?.steps || []
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  /* A heading only where the book names the part. One unnamed group is
     a plain list, as before. */
  const named = groups.some(g => g.name)
  const faved = favorites.has(recipe.id)
  const withSauce = !!content?.withSauce && sauceFor === recipe.id
  const videos = VIDEO_LABELS.filter(([k]) => content?.videos?.[k])

  const m = withSauce
    ? content.withSauce
    : [recipe.cal, recipe.protein, recipe.carbs, recipe.fat]
  const macros = [
    { val: m[0],       label: 'KCAL',    accent: true },
    { val: `${m[1]}g`, label: 'PROTEIN' },
    { val: `${m[2]}g`, label: 'CARBS' },
    { val: `${m[3]}g`, label: 'FAT' },
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
            <div data-meta style={{
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
              color: 'var(--pq-text-muted)', marginTop: 4,
              letterSpacing: 'var(--pq-track-chip)',
            }}>{metaLine(recipe, content)}</div>
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
          {/* The book's intro line. It opens the body rather than sitting
              in the fixed header: some run to three lines, and the header
              never scrolls, so there it would eat the ingredient list on
              a small phone. */}
          {content?.intro && (
            <p data-intro style={{
              ...BODY_TEXT, padding: '12px var(--pq-gutter)',
              borderBottom: '1px solid var(--pq-rule-cell)',
            }}>{content.intro}</p>
          )}

          {/* Macro strip. The last cell keeps its right rule — the strip
              is flush to the sheet edge and the rule reads as the panel's
              own edge rather than a stray. */}
          <div style={{ borderBottom: '1px solid var(--pq-rule-cell)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
              {macros.map(x => (
                <div key={x.label} style={{
                  padding: '12px 14px', borderRight: '1px solid var(--pq-rule-row)',
                }}>
                  <div style={{
                    fontFamily: 'var(--pq-mono)', fontSize: 16, fontWeight: 600,
                    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    color: x.accent ? 'var(--pq-accent)' : 'var(--pq-text)',
                  }}>{x.val}</div>
                  <div style={{
                    fontFamily: 'var(--pq-mono)', fontSize: 9,
                    color: 'var(--pq-text-3)',
                    letterSpacing: 'var(--pq-track-label)', marginTop: 5,
                  }}>{x.label}</div>
                </div>
              ))}
            </div>

            {/* WITH OR WITHOUT SAUCE — only where the book prints both
                rows (8 batch proteins). The card's own macros are the
                book's "Without Sauce" row, so that is the default. */}
            {content?.withSauce && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 10, padding: '4px var(--pq-gutter) 8px',
                borderTop: '1px solid var(--pq-rule-row)',
              }}>
                <span style={MONO_LABEL}>PER SERVING</span>
                <div role="group" aria-label="Macros with or without sauce" style={{ display: 'flex' }}>
                  {[['WITHOUT SAUCE', false], ['WITH SAUCE', true]].map(([label, on]) => {
                    const pressed = withSauce === on
                    return (
                      <button key={label}
                        aria-pressed={pressed}
                        onClick={() => setSauceFor(on ? recipe.id : null)}
                        style={{
                          minHeight: 'var(--pq-tap-min)', padding: '0 2px',
                          display: 'flex', alignItems: 'center',
                          background: 'none', border: 'none', cursor: 'pointer',
                        }}>
                        <span style={{
                          padding: '6px 11px', borderRadius: 'var(--pq-r-chip)',
                          fontFamily: 'var(--pq-mono)', fontSize: 10.5, fontWeight: 600,
                          letterSpacing: 'var(--pq-track-label)', whiteSpace: 'nowrap',
                          background: pressed ? 'var(--pq-accent-grad)' : 'transparent',
                          color: pressed ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                          border: `1px solid ${pressed ? 'transparent' : 'var(--pq-rule-soft)'}`,
                        }}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Ingredients ─────────────────────────────────────────
              ONE LINE, AS THE BOOK WROTE IT, under the book's own part
              names ("Korean BBQ Beef", "Creamy Gochujang Sauce") so you
              can see which ingredients go into which part. The count per
              part helps when scanning a long list in a shop. */}
          <div style={{ padding: '16px var(--pq-gutter) 0' }}>
            <Label right={total ? `${total} ITEMS` : null}>INGREDIENTS</Label>

            {total === 0 && (
              <p style={{
                fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
                fontStyle: 'italic', margin: '0 0 4px',
              }}>Ingredients coming soon</p>
            )}

            {groups.map((g, gi) => (
              <div key={gi} data-ingredient-group>
                {named && g.name && (
                  <div style={{
                    padding: gi === 0 ? '2px 0 4px' : '14px 0 4px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
                    fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
                    fontWeight: 600, color: 'var(--pq-text)',
                    letterSpacing: 'var(--pq-track-chip)', textTransform: 'uppercase',
                  }}>
                    <span>{g.name}</span>
                    <span style={{ fontWeight: 500, color: 'var(--pq-text-3)', fontSize: 'var(--pq-size-label)' }}>
                      {g.items.length}
                    </span>
                  </div>
                )}
                {g.items.map((line, i) => (
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
            ))}
          </div>

          {/* ── Steps ──────────────────────────────────────────────
              A title above a step only where the book prints one (the
              batch proteins: "Marinate the chicken", "Rest & store"). */}
          <div style={{ padding: '22px var(--pq-gutter) 0' }}>
            <Label>INSTRUCTIONS</Label>
            {steps.length === 0 ? (
              <p style={{
                fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
                fontStyle: 'italic', margin: 0,
              }}>Instructions coming soon</p>
            ) : (
              <ol style={{
                listStyle: 'none', margin: 0, padding: 0,
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, fontFamily: 'var(--pq-mono)',
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--pq-accent)', paddingTop: 2,
                    }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {s.title && (
                        <div data-step-title style={{
                          fontFamily: 'var(--pq-mono)', fontSize: 12, fontWeight: 600,
                          color: 'var(--pq-text)', letterSpacing: 'var(--pq-track-caption)',
                          textTransform: 'uppercase', marginBottom: 3, paddingTop: 1,
                        }}>{s.title}</div>
                      )}
                      <p style={{
                        margin: 0, fontSize: 13.5, fontWeight: 400,
                        color: 'var(--pq-text-2)', lineHeight: 1.6,
                      }}>{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── Cook's notes ───────────────────────────────────────
              Jalal's black tip box and Meal Prep's "Important Cooking
              Notes" are the same kind of thing, so they look the same.
              After the steps: they read as advice on the whole recipe,
              and the book does not tie each note to a step. */}
          {content?.notes?.length > 0 && (
            <div data-notes style={SECTION}>
              <Label>COOK&apos;S NOTES</Label>
              <div style={{ ...BOX, padding: '14px 16px' }}>
                <Dotted items={content.notes} />
              </div>
            </div>
          )}

          {/* ── Serve it with (batch proteins) ───────────────────── */}
          {(content?.serve || content?.sauces) && (
            <div data-serve style={SECTION}>
              <Label>SERVE IT WITH</Label>
              {content.serve && (<>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pq-text)', margin: '2px 0 4px' }}>Meal ideas</div>
                <Ruled items={content.serve} />
              </>)}
              {content.sauces && (<>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pq-text)', margin: '2px 0 4px' }}>Sauce pairings</div>
                <Ruled items={content.sauces} />
              </>)}
            </div>
          )}

          {/* The book's storage guide is written for exactly these
              recipes, so each one links to it. */}
          {content?.batch && (
            <div style={{ padding: '8px var(--pq-gutter) 0' }}>
              <button
                data-storage-link
                onClick={() => setGuideFor(recipe.id)}
                style={{
                  ...BOX, width: '100%', minHeight: 56, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--pq-sans)',
                }}>
                <span style={{ ...ICON_TILE, color: 'var(--pq-text-3)', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9" />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--pq-text)' }}>
                    Storage, freezing &amp; reheating
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--pq-text-3)', marginTop: 2 }}>
                    Fridge 4-5 days · freezer 2-3 months
                  </span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Watch it made ──────────────────────────────────────
              The recipe page's own links. They open outside the app. */}
          {videos.length > 0 && (
            <div data-videos style={SECTION}>
              <Label>WATCH IT MADE</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                {videos.map(([k, label]) => (
                  <a key={k} href={content.videos[k]} target="_blank" rel="noopener noreferrer"
                    aria-label={`Watch on ${label} (opens outside the app)`}
                    style={{
                      flex: 1, minHeight: 'var(--pq-tap-min)', borderRadius: 'var(--pq-r-button)',
                      border: '1px solid var(--pq-rule-strong)', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      fontFamily: 'var(--pq-mono)', fontSize: 12, fontWeight: 600,
                      letterSpacing: 'var(--pq-track-chip)', color: 'var(--pq-text-2)',
                    }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 4v16l13-8z" />
                    </svg>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ height: 24 }} />
        </div>

        {/* ── Actions ────────────────────────────────────────────────
            THE DAYS ARE THE BUTTON. Tap WED and it is on Wednesday. The
            chip lights, the sheet stays open so you can see it landed,
            and tapping the lit chip takes it off again. */}
        <div style={{
          flexShrink: 0, padding: '12px var(--pq-gutter) 16px',
          borderTop: '1px solid var(--pq-rule-cell)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span style={MONO_LABEL}>ADD TO A DAY</span>
            <span data-sheet-added aria-live="polite" style={{
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
              color: 'var(--pq-accent)', letterSpacing: 'var(--pq-track-label)',
            }}>
              {onDays.length ? `ON ${onDays.map(i => weekPlan[i].day.toUpperCase()).join(' · ')}` : ''}
            </span>
          </div>
          <DayChips
            label={`Add ${recipe.name} to a day`}
            days={weekPlan}
            isOn={i => onDays.includes(i)}
            isToday={i => i === planToday}
            count={i => (weekPlan[i].ids || []).filter(Boolean).length}
            onPick={i => (onDays.includes(i)
              ? unassignMeal(i, recipe.id) : assignMeal(i, recipe.id))}
          />
          <button
            onClick={() => { logMeal(recipe.id, 'meal'); onClose?.() }}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)', padding: 14,
              borderRadius: 'var(--pq-r-button)', cursor: 'pointer',
              border: '1px solid var(--pq-rule-strong)', background: 'transparent',
              color: 'var(--pq-text-2)',
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-body)',
              fontWeight: 600, letterSpacing: '.04em',
            }}>I ATE THIS TODAY</button>
        </div>
      </Sheet>

      {/* The storage guide opens over the recipe and closes back to it. */}
      {guideFor === recipe.id && (
        <GuidesSheet initial="storage" onClose={() => setGuideFor(null)} />
      )}
    </>
  )
}
