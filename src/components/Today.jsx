import { Moon, ChevronRight, Plus } from 'lucide-react'
import { recipes, recipeById } from '../data/recipes'
import { useAppStore } from '../store/useAppStore'

const MEAL_IMGS = {
  1:   'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80',
  43:  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&q=80',
  107: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&q=80',
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80'

function CalRing({ consumed, goal }) {
  const r = 46, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(consumed / goal, 1))
  return (
    <svg width={108} height={108} viewBox="0 0 108 108">
      <circle cx={54} cy={54} r={r} fill="none" stroke="#E4E0F4" strokeWidth={10} />
      <circle cx={54} cy={54} r={r} fill="none" stroke="#4F3FD4" strokeWidth={10}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 54 54)" />
    </svg>
  )
}

const SLOT_EMOJI = { Breakfast:'🍳', Lunch:'🥗', Snack:'🍎', Dinner:'🍽️' }

export default function Today({ onChange }) {
  const { mealLog, goals } = useAppStore()

  const consumed = mealLog.reduce((s, m) => s + (recipeById[m.recipeId]?.cal || 0), 0)
  const protein  = mealLog.reduce((s, m) => s + (recipeById[m.recipeId]?.protein || 0), 0)
  const carbs    = mealLog.reduce((s, m) => s + (recipeById[m.recipeId]?.carbs || 0), 0)
  const fat      = mealLog.reduce((s, m) => s + (recipeById[m.recipeId]?.fat || 0), 0)
  const remaining = goals.calories - consumed

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#2D1B8C 0%,#4F3FD4 45%,#7B6EF5 100%)', padding:'28px 20px 32px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-40px', right:'-40px', width:'180px', height:'180px', borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative', zIndex:2 }}>
          <div>
            <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.6)', fontWeight:500, marginBottom:'4px' }}>Good morning</p>
            <h1 style={{ fontSize:'28px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', lineHeight:1.1, marginBottom:'4px' }}>{dateLabel}</h1>
            <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', fontWeight:500 }}>{consumed} of {goals.calories} cal today</p>
          </div>
          <div style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'16px', padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:'24px', fontWeight:800, color:'#C4B5FD' }}>{mealLog.length}</div>
            <div style={{ fontSize:'9px', fontWeight:700, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'.1em', marginTop:'2px' }}>Logged</div>
          </div>
        </div>
      </div>

      {/* Macro card */}
      <div style={{ padding:'0 16px', marginTop:'-20px', position:'relative', zIndex:10 }}>
        <div style={{ background:'#fff', borderRadius:'24px', overflow:'hidden', boxShadow:'0 4px 24px rgba(79,63,212,0.12)' }}>
          <div style={{ padding:'20px', display:'flex', alignItems:'center', gap:'18px' }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <CalRing consumed={consumed} goal={goals.calories} />
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:'20px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.04em', lineHeight:1 }}>{consumed}</span>
                <span style={{ fontSize:'10px', color:'#B4ADCA', marginTop:'2px', fontWeight:500 }}>of {goals.calories}</span>
              </div>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'11px' }}>
              {[
                { label:'Protein', val:`${protein}g`, pct:Math.round(protein/goals.protein*100), color:'#4F3FD4' },
                { label:'Carbs',   val:`${carbs}g`,   pct:Math.round(carbs/goals.carbs*100),     color:'#0DC8A0' },
                { label:'Fat',     val:`${fat}g`,     pct:Math.round(fat/goals.fat*100),          color:'#F5A623' },
              ].map(m => (
                <div key={m.label} style={{ display:'grid', gridTemplateColumns:'52px 1fr 40px', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'11px', color:'#7B728E', fontWeight:500 }}>{m.label}</span>
                  <div style={{ height:'5px', background:'#E4E0F4', borderRadius:'3px', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(m.pct||0,100)}%`, background:m.color, borderRadius:'3px' }} />
                  </div>
                  <span style={{ fontSize:'11px', color:'#3D3650', fontFamily:'DM Mono, monospace', textAlign:'right' }}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderTop:'1px solid rgba(26,22,38,0.06)' }}>
            {[
              { val:remaining < 0 ? 0 : remaining, label:'Cal left',  color:'#0DC8A0' },
              { val:mealLog.length,                 label:'Meals',     color:'#4F3FD4' },
              { val:`${protein}g`,                  label:'Protein',   color:'#F5A623' },
            ].map((s,i) => (
              <div key={i} style={{ padding:'13px 0', textAlign:'center', borderRight:i<2?'1px solid rgba(26,22,38,0.06)':undefined }}>
                <div style={{ fontSize:'18px', fontWeight:800, color:s.color, letterSpacing:'-.03em' }}>{s.val}</div>
                <div style={{ fontSize:'10px', color:'#B4ADCA', marginTop:'3px', fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Meals list */}
      <div style={{ padding:'22px 16px 0' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
          <h2 style={{ fontSize:'18px', fontWeight:800, letterSpacing:'-.03em', color:'#1A1626' }}>Today's meals</h2>
          <button onClick={() => onChange?.('track')} style={{ display:'flex', alignItems:'center', gap:'3px', background:'none', border:'none', cursor:'pointer', color:'#4F3FD4', fontSize:'12px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            + Log meal <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>

        {mealLog.length === 0 ? (
          <div style={{ background:'rgba(255,255,255,0.6)', border:'1.5px dashed rgba(79,63,212,0.2)', borderRadius:'20px', padding:'28px', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', cursor:'pointer' }} onClick={() => onChange?.('track')}>
            <Moon size={28} strokeWidth={1.5} color='#C4B5FD' />
            <p style={{ fontSize:'14px', fontWeight:600, color:'rgba(59,53,80,0.5)', margin:0 }}>Nothing logged yet</p>
            <p style={{ fontSize:'12px', color:'#B4ADCA', margin:0, fontWeight:500 }}>{remaining} cal remaining · tap to log a meal</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {mealLog.map((meal) => {
              const recipe = recipeById[meal.recipeId]
              if (!recipe) return null
              return (
                <div key={meal.id} style={{ background:'#fff', borderRadius:'20px', overflow:'hidden', cursor:'pointer', boxShadow:'0 2px 12px rgba(79,63,212,0.07)' }}>
                  <div style={{ position:'relative' }}>
                    <img src={MEAL_IMGS[meal.recipeId] || FALLBACK_IMG} alt={recipe.name} style={{ width:'100%', height:'140px', objectFit:'cover', display:'block' }} />
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(26,22,38,0.5) 0%,transparent 50%)' }} />
                  </div>
                  <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:'10px', fontWeight:700, color:'#7B728E', textTransform:'uppercase', letterSpacing:'.12em', marginBottom:'4px' }}>
                        {SLOT_EMOJI[meal.slot] || '🍽️'} {meal.slot} · {meal.time}
                      </div>
                      <p style={{ fontSize:'16px', fontWeight:700, color:'#1A1626', letterSpacing:'-.02em', marginBottom:'4px' }}>{recipe.name}</p>
                      <p style={{ fontSize:'11px', color:'#7B728E', fontWeight:500 }}>{recipe.protein}g pro · {recipe.carbs}g carbs · {recipe.fat}g fat</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'26px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.04em', lineHeight:1 }}>{recipe.cal}</div>
                      <div style={{ fontSize:'10px', color:'#B4ADCA', fontWeight:500, marginTop:'2px' }}>cal</div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Empty slot prompt */}
            <div style={{ background:'rgba(255,255,255,0.6)', border:'1.5px dashed rgba(79,63,212,0.2)', borderRadius:'20px', padding:'16px', display:'flex', alignItems:'center', gap:'14px', cursor:'pointer' }} onClick={() => onChange?.('track')}>
              <div style={{ width:'48px', height:'48px', borderRadius:'14px', background:'rgba(79,63,212,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Moon size={22} strokeWidth={2} color='#4F3FD4' />
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:'14px', fontWeight:600, color:'rgba(59,53,80,0.5)', marginBottom:'2px' }}>Log another meal</p>
                <p style={{ fontSize:'11px', color:'#B4ADCA', fontWeight:500 }}>{remaining < 0 ? 0 : remaining} cal remaining</p>
              </div>
              <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#4F3FD4', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => onChange?.('track')}>
                <Plus size={18} strokeWidth={2.5} color='#fff' />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
