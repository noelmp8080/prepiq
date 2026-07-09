import { useEffect, useState } from 'react'
import { Heart, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getIngredients } from '../data/ingredients'
import { getRecipeDetails } from '../data/recipeDetails'

// Per-recipe hero photos extracted from the source cookbooks (public/recipes/).
// Missing photo -> neutral placeholder, so a gap is visible rather than disguised.
const PLACEHOLDER = '/recipes/_placeholder.svg'
const getImg = recipe => recipe.image || PLACEHOLDER

const DAILY_GOALS = { cal: 1800, protein: 180, carbs: 200, fat: 60 }

const CATEGORY_COLORS = {
  protein:   '#4F3FD4',
  carbs:     '#F5A623',
  sauce:     '#0DC8A0',
  veg:       '#52D9A0',
  aromatics: '#9B8EC4',
  seasoning: 'var(--ink4)',
  garnish:   '#48CAE4',
}

function generateDescription(recipe) {
  const t = recipe.tags
  const parts = []
  if      (t.includes('high-protein'))   parts.push('A high-protein meal perfect for meal prep')
  else if (t.includes('under-400'))      parts.push('A light, low-calorie meal')
  else                                   parts.push('A delicious, satisfying meal')
  if      (t.includes('chicken'))        parts.push('featuring tender chicken')
  else if (t.includes('beef'))           parts.push('featuring seasoned beef')
  else if (t.includes('seafood'))        parts.push('featuring fresh seafood')
  if      (t.includes('pasta'))          parts.push('served with pasta')
  else if (t.includes('rice-bowls'))     parts.push('served over rice')
  else if (t.includes('handheld'))       parts.push('wrapped and ready to go')
  if (t.includes('low-fat') && parts.length < 3) parts.push('and kept low in fat')
  if (parts.length === 1) return parts[0] + '.'
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}.`
  return `${parts[0]}, ${parts[1]}, ${parts[2]}.`
}

function prepTime(cal) {
  if (cal < 400) return '20 mins'
  if (cal <= 500) return '25 mins'
  return '30 mins'
}

function MacroBar({ val, goal, color }) {
  const pct = Math.min(Math.round((val / goal) * 100) || 0, 100)
  return (
    <div style={{ height: '4px', background: 'var(--bg2)', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }} />
    </div>
  )
}

export default function RecipeSheet({ recipe, onClose }) {
  const { favorites, toggleFavorite, logMeal } = useAppStore()
  const [open,  setOpen]  = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 250)
  }

  function handleAddToday() {
    logMeal(recipe.id, 'Dinner')
    setAdded(true)
    setTimeout(handleClose, 900)
  }

  const sourceLabel  = recipe.source === 'jalal' ? "Jalal's" : 'Meal Prep'
  const sourceColor  = recipe.source === 'jalal' ? '#7B6EF5' : '#0DC8A0'
  const isFav        = favorites.has(recipe.id)

  const details      = getRecipeDetails(recipe)
  const fakeIngredients = details ? null : getIngredients(recipe)
  const servingsText = details?.servings
    ? `Makes ${details.servings} serving${details.servings !== 1 ? 's' : ''}`
    : 'Makes 4 servings'
  const servingsPill = details?.servings
    ? `👥 ${details.servings} serving${details.servings !== 1 ? 's' : ''}`
    : '👥 4 servings'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Dark overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: open ? 1 : 0,
          transition: 'opacity 250ms ease',
        }}
      />

      {/* Modal card */}
      <div style={{
        position: 'relative',
        width: 'calc(100% - 32px)',
        maxWidth: '420px',
        maxHeight: '85vh',
        background: 'var(--card)',
        borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'scale(1)' : 'scale(0.92)',
        opacity: open ? 1 : 0,
        transition: 'transform 250ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 250ms ease',
        zIndex: 1,
      }}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'var(--surface2)', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 2, flexShrink: 0,
          }}
        >
          <X size={15} strokeWidth={2.5} color='var(--ink3)' />
        </button>

        {/* Scrollable area */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          borderRadius: '24px 24px 0 0',
        }}>
          {/* Top section: 2-column layout */}
          <div style={{ padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            {/* Left: image */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={getImg(recipe)}
                alt={recipe.name}
                style={{ width: '120px', height: '120px', borderRadius: '16px', objectFit: 'cover', display: 'block' }}
              />
              <button
                onClick={() => toggleFavorite(recipe.id)}
                style={{
                  position: 'absolute', top: '7px', right: '7px',
                  background: 'rgba(255,255,255,0.92)', border: 'none',
                  borderRadius: '50%', width: '26px', height: '26px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
                }}
              >
                <Heart size={12} strokeWidth={2} color={isFav ? '#FF5C5C' : '#B4ADCA'} fill={isFav ? '#FF5C5C' : 'none'} />
              </button>
            </div>

            {/* Right: info column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0, paddingTop: '2px' }}>
              <span style={{
                display: 'inline-block', alignSelf: 'flex-start',
                background: sourceColor, color: '#fff',
                fontSize: '9px', fontWeight: 700,
                padding: '3px 7px', borderRadius: '5px',
                letterSpacing: '.06em',
              }}>
                {sourceLabel}
              </span>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.03em', margin: 0, lineHeight: 1.2, paddingRight: '28px' }}>
                {recipe.name}
              </h2>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--ink4)', fontWeight: 500 }}>
                <span>⏱ {prepTime(recipe.cal)}</span>
                <span>{servingsPill}</span>
              </div>
              {/* 4 macro pills */}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {[
                  { label: String(recipe.cal),   sub: 'cal', bg: 'rgba(79,63,212,0.08)',  color: '#4F3FD4' },
                  { label: `${recipe.protein}g`, sub: 'P',   bg: 'rgba(79,63,212,0.08)',  color: '#4F3FD4' },
                  { label: `${recipe.carbs}g`,   sub: 'C',   bg: 'rgba(13,200,160,0.09)', color: '#0DC8A0' },
                  { label: `${recipe.fat}g`,     sub: 'F',   bg: 'rgba(245,166,35,0.09)', color: '#F5A623' },
                ].map(m => (
                  <div key={m.sub} style={{ background: m.bg, borderRadius: '8px', padding: '4px 7px', display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: m.color, letterSpacing: '-.02em', lineHeight: 1 }}>{m.label}</span>
                    <span style={{ fontSize: '9px', color: 'var(--ink4)', fontWeight: 600 }}>{m.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-c)', margin: '0 20px' }} />

          {/* Nutrition section */}
          <div style={{ padding: '16px 20px 0' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink4)', letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Nutrition per serving
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Calories', value: recipe.cal,     unit: '',  goal: DAILY_GOALS.cal,     color: '#4F3FD4', dotBg: 'rgba(79,63,212,0.12)'  },
                { label: 'Protein',  value: recipe.protein, unit: 'g', goal: DAILY_GOALS.protein, color: '#4F3FD4', dotBg: 'rgba(79,63,212,0.12)'  },
                { label: 'Carbs',    value: recipe.carbs,   unit: 'g', goal: DAILY_GOALS.carbs,   color: '#0DC8A0', dotBg: 'rgba(13,200,160,0.12)' },
                { label: 'Fat',      value: recipe.fat,     unit: 'g', goal: DAILY_GOALS.fat,     color: '#F5A623', dotBg: 'rgba(245,166,35,0.12)' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: row.dotBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: row.color }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink2)' }}>{row.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: row.color, fontFamily: 'DM Mono, monospace' }}>{row.value}{row.unit}</span>
                      <span style={{ fontSize: '10px', color: 'var(--ink4)', fontWeight: 500 }}>/ {row.goal}{row.unit}</span>
                    </div>
                  </div>
                  <MacroBar val={row.value} goal={row.goal} color={row.color} />
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ padding: '16px 20px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
              {generateDescription(recipe)}
            </p>
          </div>

          {/* Ingredients */}
          <div style={{ padding: '20px 20px 0' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink4)', letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 3px' }}>
              Ingredients
            </p>
            <p style={{ fontSize: '11px', color: 'var(--ink4)', fontWeight: 500, margin: '0 0 12px' }}>
              {servingsText}
            </p>

            {details ? (
              /* Real ingredients: plain string array from the cookbook */
              <div style={{ background: 'var(--surface2)', borderRadius: '16px', overflow: 'hidden' }}>
                {details.ingredients.map((ing, i) => {
                  const isLabel = ing.startsWith('(') || ing.endsWith(')')
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px' }}>
                        {isLabel ? (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink4)', lineHeight: 1.3, fontStyle: 'italic', flex: 1 }}>
                            {ing}
                          </span>
                        ) : (
                          <>
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4F3FD4', flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3, flex: 1 }}>{ing}</span>
                          </>
                        )}
                      </div>
                      {i < details.ingredients.length - 1 && (
                        <div style={{ height: '1px', background: 'var(--border-c)', margin: '0 14px' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Generated ingredients fallback */
              <div style={{ background: 'var(--surface2)', borderRadius: '16px', overflow: 'hidden' }}>
                {fakeIngredients.map((ing, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: CATEGORY_COLORS[ing.category] || 'var(--ink4)', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3 }}>{ing.item}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--ink3)', fontFamily: 'DM Mono, monospace', flexShrink: 0, marginLeft: '10px', textAlign: 'right' }}>{ing.amount}</span>
                    </div>
                    {i < fakeIngredients.length - 1 && (
                      <div style={{ height: '1px', background: 'var(--border-c)', margin: '0 14px' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions — always rendered; placeholder shown when steps are missing */}
          <div style={{ padding: '20px 20px 28px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink4)', letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Instructions
            </p>
            {details && details.steps && details.steps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {details.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                      flexShrink: 0,
                      width: '22px', height: '22px', borderRadius: '8px',
                      background: 'rgba(79,63,212,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#4F3FD4', lineHeight: 1 }}>{i + 1}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 500, lineHeight: 1.6, margin: 0, flex: 1 }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic', margin: 0 }}>
                Instructions coming soon
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          flexShrink: 0,
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          background: 'var(--card)',
          borderTop: '1px solid var(--border-c)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          borderRadius: '0 0 24px 24px',
        }}>
          <button
            onClick={handleAddToday}
            style={{
              width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
              cursor: 'pointer', fontSize: '14px', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              background: added ? '#0DC8A0' : 'linear-gradient(135deg,#4F3FD4 0%,#7B6EF5 100%)',
              color: '#fff',
              boxShadow: added ? '0 4px 16px rgba(13,200,160,0.35)' : '0 4px 16px rgba(79,63,212,0.35)',
              transition: 'background .2s, box-shadow .2s',
            }}
          >
            {added ? '✓ Added to today!' : "Add to Today's Plan"}
          </button>
          <button
            onClick={handleClose}
            style={{
              width: '100%', padding: '12px', borderRadius: '14px',
              border: '1.5px solid #0DC8A0', background: 'transparent',
              cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#0DC8A0',
            }}
          >
            Add to Week Plan
          </button>
        </div>
      </div>
    </div>
  )
}
