import { useState, useRef, useEffect } from 'react'
import Sheet from './Sheet'
import Thumb from './Thumb'
import PhotoViewer from './PhotoViewer'
import DayChips from './DayChips'
import { useAppStore } from '../store/useAppStore'
import GuidesSheet from './GuidesSheet'
import { getRecipeDetails } from '../data/recipeDetails'
import { storageGuide } from '../data/recipeExtras'

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
  /* A batch protein is cooked once for the week: the book's number is
     how many portions the tray makes, not servings of one meal. */
  if (details?.batch) parts.push('BATCH PROTEIN')
  /* Only when the book actually gives one — see above. */
  if (details?.servings) parts.push(details.batch ? `MAKES ${details.servings}` : `${details.servings} SERV`)
  return parts.join(' · ')
}

/* A row of the "serve it with" and cook's-notes lists. */
function Bullet({ children }) {
  return (
    <li style={{
      display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0',
      fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-2)', lineHeight: 1.5,
    }}>
      <span aria-hidden="true" style={{
        width: 5, height: 5, borderRadius: '50%', background: 'var(--pq-accent)',
        flexShrink: 0, position: 'relative', top: -2,
      }} />
      <span style={{ flex: 1 }}>{children}</span>
    </li>
  )
}
const LIST = { listStyle: 'none', margin: 0, padding: 0 }

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
  width: 36, height: 36, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--pq-thumb-fallback)',
  boxShadow: 'var(--pq-thumb-fallback-lip)',
}

/* ── Swipe to the next recipe ─────────────────────────────────────────
 *
 * When the screen that opened the sheet passes the list it opened it
 * from (`list` + `onNavigate`), a sideways swipe moves through that list
 * without closing the sheet: swipe LEFT for the next recipe, RIGHT for
 * the previous one — the direction a page turns. Recipes passes its
 * current filtered, searched list, so the order is the order on screen.
 * Screens that pass nothing get the sheet exactly as before.
 *
 * WHY IT DOES NOT FIGHT THE SCROLL. The sheet body scrolls vertically.
 * The first 10px of movement decide the gesture: mostly sideways and
 * it is a swipe, otherwise it is left entirely to the browser. The
 * panel is `touch-action: pan-y`, so the browser keeps vertical
 * scrolling and hands sideways movement to this code.
 *
 * A SWIPE IS NEVER ALSO A TAP. A swipe that starts on a day chip would
 * otherwise end in a click on that chip and put the meal on a day. Once
 * a gesture is judged sideways, the click that follows it is swallowed.
 *
 * At either end of the list the panel drags with resistance and springs
 * back, so the edge is felt rather than silently ignored. The arrows in
 * the position row do the same job for a mouse, and so do the ← and →
 * keys. */
const SWIPE_COMMIT = 60     /* px of sideways travel that turns the page */
const SWIPE_DECIDE = 10     /* px before the gesture is judged */

export default function RecipeSheet({ recipe, onClose, list, onNavigate }) {
  const {
    favorites, toggleFavorite, logMeal, weekPlan, planToday, assignMeal, unassignMeal,
  } = useAppStore()

  const [photoOpen, setPhotoOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  /* Which recipe the with-sauce switch is on for — by id, so the next
     recipe opens on the book's headline (without-sauce) numbers. */
  const [sauceFor, setSauceFor] = useState(null)
  /* Which recipe's photo failed to load — by id, so moving to the next
     recipe gives it a fresh chance without resetting state in an effect. */
  const [failedPhotoId, setFailedPhotoId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [enterFrom, setEnterFrom] = useState(null)   // 'next' | 'prev' | null
  const touch = useRef(null)
  const swallowClick = useRef(false)

  const index = recipe && list ? list.findIndex(r => r.id === recipe.id) : -1
  const canNav = index >= 0 && typeof onNavigate === 'function' && list.length > 1
  const prev = canNav && index > 0 ? list[index - 1] : null
  const next = canNav && index < list.length - 1 ? list[index + 1] : null

  const go = (target, from) => {
    if (!target) return
    setDragX(0)
    setPhotoOpen(false)
    setEnterFrom(from)
    onNavigate(target)
  }

  /* Keyboard: ← → move through the list. Not while typing, and not
     while the photo is open (the photo is its own layer). */
  useEffect(() => {
    if (!canNav || photoOpen) return
    const onKey = e => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      if (e.key === 'ArrowRight' && next) go(next, 'next')
      if (e.key === 'ArrowLeft' && prev) go(prev, 'prev')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!recipe) return null
  const photoFailed = failedPhotoId === recipe.id

  const onTouchStart = e => {
    swallowClick.current = false
    if (!canNav || e.touches.length !== 1) { touch.current = null; return }
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, axis: null, dx: 0 }
  }
  const onTouchMove = e => {
    const g = touch.current
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y
    if (!g.axis) {
      if (Math.abs(dx) < SWIPE_DECIDE && Math.abs(dy) < SWIPE_DECIDE) return
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'
    }
    if (g.axis !== 'x') return
    if (!dragging) setDragging(true)
    g.dx = dx
    /* Past the end of the list: resistance, then spring back. */
    const blocked = (dx < 0 && !next) || (dx > 0 && !prev)
    setDragX(blocked ? dx * 0.25 : dx)
  }
  const onTouchEnd = () => {
    const g = touch.current
    touch.current = null
    if (!g || g.axis !== 'x') return
    setDragging(false)
    swallowClick.current = true
    if (g.dx <= -SWIPE_COMMIT && next) go(next, 'next')
    else if (g.dx >= SWIPE_COMMIT && prev) go(prev, 'prev')
    else setDragX(0)
  }
  const onClickCapture = e => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.stopPropagation()
    e.preventDefault()
  }

  /* Which days already hold this recipe — the lit chips. */
  const onDays = weekPlan
    .map((d, i) => ((d.ids || []).includes(recipe.id) ? i : -1))
    .filter(i => i >= 0)

  const details = getRecipeDetails(recipe)
  const ingredients = details?.ingredients || []
  const groups = details?.groups || null
  const steps = details?.steps || []
  const itemCount = groups
    ? groups.reduce((n, g) => n + g.items.length, 0)
    : ingredients.filter(l => !isHeading(l)).length
  const faved = favorites.has(recipe.id)

  const withSauce = details?.withSauce && sauceFor === recipe.id
  const m = withSauce ? details.withSauce : recipe
  const macros = [
    { val: m.cal,           label: 'KCAL',    accent: true },
    { val: `${m.protein}g`, label: 'PROTEIN' },
    { val: `${m.carbs}g`,   label: 'CARBS' },
    { val: `${m.fat}g`,     label: 'FAT' },
  ]

  return (
      <Sheet open onClose={onClose} title={recipe.name}>
        <div
          key={recipe.id}
          data-recipe-swipe
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onClickCapture={onClickCapture}
          style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            touchAction: canNav ? 'pan-y' : undefined,
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            opacity: dragX ? Math.max(0.4, 1 - Math.abs(dragX) / 500) : undefined,
            transition: dragging ? 'none' : 'transform .2s ease-out, opacity .2s ease-out',
            animation: enterFrom
              ? `pq-recipe-in-${enterFrom} .24s cubic-bezier(.2,1,.32,1) both` : undefined,
          }}
        >
        <style>{`
          @keyframes pq-recipe-in-next { from { transform: translateX(48px); opacity: 0 } }
          @keyframes pq-recipe-in-prev { from { transform: translateX(-48px); opacity: 0 } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes pq-recipe-in-next { from { opacity: 0 } }
            @keyframes pq-recipe-in-prev { from { opacity: 0 } }
          }
        `}</style>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px var(--pq-gutter) 12px',
          borderBottom: '1px solid var(--pq-rule-cell)',
        }}>
          {/* TAP THE DISH FOR THE FULL PHOTO. Only when there is one —
              the initials tile is not a photo and opens nothing. The
              probe below learns whether the file loads; Thumb catches
              its own failure but does not report it. */}
          {recipe.image && !photoFailed ? (
            <button
              data-photo-open
              onClick={() => setPhotoOpen(true)}
              aria-label={`View larger photo of ${recipe.name}`}
              style={{
                flexShrink: 0, minHeight: 'var(--pq-tap-min)',
                padding: 0, border: 'none', background: 'none',
                cursor: 'zoom-in', borderRadius: 16, display: 'block',
              }}
            >
              <Thumb recipe={recipe} size={56} src={recipe.image} />
              <img src={recipe.image} alt="" hidden onError={() => setFailedPhotoId(recipe.id)} />
            </button>
          ) : (
            <Thumb recipe={recipe} size={56} src={recipe.image} />
          )}
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

        {/* ── Position in the list ───────────────────────────────────
            Says that there IS a next recipe, and where this one sits.
            Without it a swipe is a gesture you would only find by
            accident. The arrows are the same move for a mouse. */}
        {canNav && (
          <div data-recipe-position style={{
            flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 calc(var(--pq-gutter) - 10px)',
            borderBottom: '1px solid var(--pq-rule-cell)',
          }}>
            <button
              data-recipe-prev
              onClick={() => go(prev, 'prev')}
              disabled={!prev}
              aria-label={prev ? `Previous recipe: ${prev.name}` : 'No previous recipe'}
              style={{ ...ICON_BUTTON, opacity: prev ? 1 : 0.3, cursor: prev ? 'pointer' : 'default' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span style={{
              fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
              color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-label)',
            }}>{index + 1} OF {list.length} · SWIPE FOR MORE</span>
            <button
              data-recipe-next
              onClick={() => go(next, 'next')}
              disabled={!next}
              aria-label={next ? `Next recipe: ${next.name}` : 'No next recipe'}
              style={{ ...ICON_BUTTON, opacity: next ? 1 : 0.3, cursor: next ? 'pointer' : 'default' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        }}>
          {/* The line the book prints under the title. */}
          {details?.intro && (
            <p data-recipe-intro style={{
              margin: 0, padding: '14px var(--pq-gutter)',
              fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-2)', lineHeight: 1.55,
              borderBottom: '1px solid var(--pq-rule-cell)',
            }}>{details.intro}</p>
          )}

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

          {/* With or without the sauce. The book prints both for its
              batch proteins; the headline number is without. */}
          {details?.withSauce && (
            <div data-sauce-switch style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '8px var(--pq-gutter)', borderBottom: '1px solid var(--pq-rule-cell)',
            }}>
              <span style={MONO_LABEL}>PER SERVING</span>
              <div role="group" aria-label="Macros with or without sauce" style={{
                display: 'flex', padding: 3, gap: 2, borderRadius: 999,
                background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
              }}>
                {[['WITHOUT SAUCE', false], ['WITH SAUCE', true]].map(([label, on]) => {
                  const active = !!withSauce === on
                  return (
                    <button key={label} aria-pressed={active}
                      onClick={() => setSauceFor(on ? recipe.id : null)}
                      style={{
                        minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
                        border: 'none',
                        background: active ? 'var(--pq-accent-grad)' : 'transparent',
                        color: active ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                        fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-label)',
                        fontWeight: 600, letterSpacing: '.04em',
                      }}>{label}</button>
                  )
                })}
              </div>
            </div>
          )}

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
            <div style={{ ...MONO_LABEL, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>INGREDIENTS</span>
              {itemCount > 0 && <span>{itemCount} ITEMS</span>}
            </div>

            {!groups && ingredients.length === 0 && (
              <p style={{
                fontSize: 'var(--pq-size-body)', color: 'var(--pq-text-3)',
                fontStyle: 'italic', margin: '0 0 4px',
              }}>Ingredients coming soon</p>
            )}

            {/* The book's own groups, where they have been read in. */}
            {groups && groups.map(g => (
              <div key={g.title} data-ingredient-group>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '10px 0 4px',
                  fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
                  fontWeight: 600, color: 'var(--pq-text-muted)',
                  letterSpacing: 'var(--pq-track-chip)',
                }}>
                  <span>{g.title.toUpperCase()}</span>
                  <span style={{ color: 'var(--pq-text-3)' }}>{g.items.length}</span>
                </div>
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

            {!groups && ingredients.map((line, i) => isHeading(line) ? (
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
                {steps.map(({ title, text }, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, fontFamily: 'var(--pq-mono)',
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--pq-accent)', paddingTop: 2,
                    }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {title && (
                        <div style={{
                          fontSize: 'var(--pq-size-row)', fontWeight: 600,
                          color: 'var(--pq-text)', marginBottom: 2,
                        }}>{title}</div>
                      )}
                      <p style={{
                        margin: 0, fontSize: 13.5, fontWeight: 400,
                        color: 'var(--pq-text-2)', lineHeight: 1.6,
                      }}>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── Cook's notes — the book's tip box, after the steps. */}
          {details?.notes && (
            <div data-cooks-notes style={{ padding: '0 var(--pq-gutter) 20px' }}>
              <div style={{ ...MONO_LABEL, marginBottom: 8 }}>COOK'S NOTES</div>
              <div style={{
                background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
                borderRadius: 14, padding: '8px 14px',
              }}>
                <ul style={LIST}>{details.notes.map(n => <Bullet key={n}>{n}</Bullet>)}</ul>
              </div>
            </div>
          )}

          {/* ── Serve it with — meal ideas and sauce pairings. */}
          {details?.serveWith && (
            <div data-serve-with style={{ padding: '0 var(--pq-gutter) 20px' }}>
              <div style={{ ...MONO_LABEL, marginBottom: 8 }}>SERVE IT WITH</div>
              {[['Meal ideas', details.serveWith.meals], ['Sauce pairings', details.serveWith.sauces]]
                .filter(([, list]) => list?.length)
                .map(([h, list]) => (
                  <div key={h} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 'var(--pq-size-row)', fontWeight: 600, color: 'var(--pq-text)',
                      margin: '4px 0 2px',
                    }}>{h}</div>
                    <ul style={LIST}>{list.map(t => <Bullet key={t}>{t}</Bullet>)}</ul>
                  </div>
                ))}
            </div>
          )}

          {/* ── Batch proteins link to how to keep them for the week. */}
          {details?.batch && (
            <div style={{ padding: '0 var(--pq-gutter) 24px' }}>
              <button data-open-storage onClick={() => setGuideOpen(true)} style={{
                width: '100%', minHeight: 'var(--pq-tap-min)',
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: 'var(--pq-panel)', border: '1px solid var(--pq-rule-soft)',
                borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--pq-sans)',
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 'var(--pq-size-row)', fontWeight: 600,
                    color: 'var(--pq-text)',
                  }}>{storageGuide.title}</span>
                  <span style={{
                    display: 'block', fontSize: 12, color: 'var(--pq-text-3)', marginTop: 2,
                  }}>Fridge {storageGuide.facts[0].value} · freezer {storageGuide.facts[1].value}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  stroke="var(--pq-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Actions ────────────────────────────────────────────────
            THE DAYS ARE THE BUTTON. This used to be ADD TO PLAN, which
            opened a second sheet with a day list — two more taps and a
            wait, and every day that already held two meals was greyed
            out as FULL. Now: tap WED and it is on Wednesday. The chip
            lights, the sheet stays open so you can see it landed, and
            tapping the lit chip takes it off again. */}
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
        </div>

        {guideOpen && (
          <GuidesSheet initial="storage" onClose={() => setGuideOpen(false)} />
        )}

        {photoOpen && (
          <PhotoViewer
            src={recipe.image}
            alt={recipe.name}
            onClose={() => setPhotoOpen(false)}
          />
        )}
      </Sheet>
  )
}
