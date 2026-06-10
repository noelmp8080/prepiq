import { useEffect, useState } from 'react'
import { Heart, Clock, Users } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const FOOD_IMGS = [
  'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80',
  'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80',
  'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80',
  'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=800&q=80',
]

function getImg(id) { return FOOD_IMGS[(id - 1) % FOOD_IMGS.length] }

const DAILY_GOALS = { cal: 1800, protein: 180, carbs: 200, fat: 60 }

function generateDescription(recipe) {
  const t = recipe.tags
  const parts = []

  if (t.includes('high-protein'))   parts.push('A high-protein meal perfect for meal prep')
  else if (t.includes('under-400')) parts.push('A light, low-calorie meal')
  else                               parts.push('A delicious, satisfying meal')

  if      (t.includes('chicken'))   parts.push('featuring tender chicken')
  else if (t.includes('beef'))      parts.push('featuring seasoned beef')
  else if (t.includes('seafood'))   parts.push('featuring fresh seafood')

  if      (t.includes('pasta'))      parts.push('served with pasta')
  else if (t.includes('rice-bowls')) parts.push('served over rice')
  else if (t.includes('handheld'))   parts.push('wrapped and ready to go')

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
    <div style={{ height: '4px', background: '#E4E0F4', borderRadius: '3px', overflow: 'hidden' }}>
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
    setTimeout(onClose, 300)
  }

  function handleAddToday() {
    logMeal(recipe.id, 'Dinner')
    setAdded(true)
    setTimeout(handleClose, 900)
  }

  const sourceLabel = recipe.source === 'jalal' ? "Jalal's" : 'Meal Prep'
  const sourceColor = recipe.source === 'jalal' ? '#7B6EF5' : '#0DC8A0'
  const isFav = favorites.has(recipe.id)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      {/* Dark overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderRadius: '24px 24px 0 0',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}>
        {/* Drag handle */}
        <div
          onClick={handleClose}
          style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#E4E0F4' }} />
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* Hero image */}
          <div style={{ position: 'relative', marginTop: '12px' }}>
            <img
              src={getImg(recipe.id)}
              alt={recipe.name}
              style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(26,22,38,0.35) 0%,transparent 55%)' }} />
            <button
              onClick={() => toggleFavorite(recipe.id)}
              style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%',
                width: '36px', height: '36px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <Heart size={16} strokeWidth={2} color={isFav ? '#FF5C5C' : '#B4ADCA'} fill={isFav ? '#FF5C5C' : 'none'} />
            </button>
          </div>

          {/* Header */}
          <div style={{ padding: '20px 20px 16px' }}>
            <span style={{
              display: 'inline-block',
              background: sourceColor, color: '#fff',
              fontSize: '9px', fontWeight: 700,
              padding: '3px 8px', borderRadius: '6px',
              letterSpacing: '.06em', marginBottom: '8px',
            }}>
              {sourceLabel}
            </span>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#1A1626', letterSpacing: '-.03em', margin: '0 0 14px', lineHeight: 1.2 }}>
              {recipe.name}
            </h2>
            {/* Macro pills */}
            <div style={{ display: 'flex', gap: '7px' }}>
              {[
                { label: String(recipe.cal),      sub: 'cal',     bg: 'rgba(79,63,212,0.07)',  color: '#4F3FD4' },
                { label: `${recipe.protein}g`,    sub: 'protein', bg: 'rgba(79,63,212,0.07)',  color: '#4F3FD4' },
                { label: `${recipe.carbs}g`,      sub: 'carbs',   bg: 'rgba(13,200,160,0.09)', color: '#0DC8A0' },
                { label: `${recipe.fat}g`,        sub: 'fat',     bg: 'rgba(245,166,35,0.09)', color: '#F5A623' },
              ].map(m => (
                <div key={m.sub} style={{ flex: 1, background: m.bg, borderRadius: '12px', padding: '8px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: m.color, letterSpacing: '-.03em', lineHeight: 1 }}>{m.label}</div>
                  <div style={{ fontSize: '9px', color: '#B4ADCA', fontWeight: 600, marginTop: '2px' }}>{m.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* About */}
          <div style={{ padding: '0 20px 20px' }}>
            <p style={{ fontSize: '13px', color: '#7B728E', fontWeight: 500, lineHeight: 1.6, margin: '0 0 14px' }}>
              {generateDescription(recipe)}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'rgba(79,63,212,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={14} strokeWidth={2} color='#4F3FD4' />
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1A1626', lineHeight: 1.2 }}>{prepTime(recipe.cal)}</div>
                  <div style={{ fontSize: '10px', color: '#B4ADCA', fontWeight: 500 }}>Prep time</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'rgba(13,200,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={14} strokeWidth={2} color='#0DC8A0' />
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1A1626', lineHeight: 1.2 }}>4 servings</div>
                  <div style={{ fontSize: '10px', color: '#B4ADCA', fontWeight: 500 }}>Serves</div>
                </div>
              </div>
            </div>
          </div>

          {/* Nutrition breakdown card */}
          <div style={{ margin: '0 16px 28px', background: 'rgba(79,63,212,0.03)', border: '1px solid rgba(79,63,212,0.08)', borderRadius: '20px', padding: '18px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#B4ADCA', letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Nutrition per serving
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Calories', value: recipe.cal,     unit: '',  goal: DAILY_GOALS.cal,     color: '#4F3FD4', dotBg: 'rgba(79,63,212,0.12)'  },
                { label: 'Protein',  value: recipe.protein, unit: 'g', goal: DAILY_GOALS.protein, color: '#4F3FD4', dotBg: 'rgba(79,63,212,0.12)'  },
                { label: 'Carbs',    value: recipe.carbs,   unit: 'g', goal: DAILY_GOALS.carbs,   color: '#0DC8A0', dotBg: 'rgba(13,200,160,0.12)' },
                { label: 'Fat',      value: recipe.fat,     unit: 'g', goal: DAILY_GOALS.fat,     color: '#F5A623', dotBg: 'rgba(245,166,35,0.12)' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '7px', background: row.dotBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: row.color }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#3D3650' }}>{row.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: row.color, fontFamily: 'DM Mono, monospace' }}>{row.value}{row.unit}</span>
                      <span style={{ fontSize: '10px', color: '#B4ADCA', fontWeight: 500 }}>/ {row.goal}{row.unit}</span>
                    </div>
                  </div>
                  <MacroBar val={row.value} goal={row.goal} color={row.color} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons — outside scroll area, above safe-area */}
        <div style={{
          flexShrink: 0,
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          background: '#fff',
          borderTop: '1px solid rgba(26,22,38,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <button
            onClick={handleAddToday}
            style={{
              width: '100%', padding: '15px', borderRadius: '16px', border: 'none',
              cursor: 'pointer', fontSize: '15px', fontWeight: 700,
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
              width: '100%', padding: '13px', borderRadius: '16px',
              border: '1.5px solid #0DC8A0', background: '#fff',
              cursor: 'pointer', fontSize: '14px', fontWeight: 700,
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
