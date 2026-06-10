import { useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import { recipes, recipeById } from '../data/recipes'
import { useAppStore } from '../store/useAppStore'

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const SLOT_EMOJI = { Breakfast:'🍳', Lunch:'🥗', Dinner:'🍽️', Snack:'🍎' }

function Bar({ val, goal, color }) {
  const pct = Math.min(Math.round((val / goal) * 100) || 0, 100)
  return (
    <div style={{ height:'8px', background:'var(--bg2)', borderRadius:'6px', overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:'6px', transition:'width .4s ease' }} />
    </div>
  )
}

function LogMealModal({ onClose }) {
  const { logMeal } = useAppStore()
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(null)
  const [slot,     setSlot]     = useState('Breakfast')

  const filtered = query
    ? recipes.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
    : recipes

  function confirm() {
    if (!selected) return
    logMeal(selected.id, slot)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(26,22,38,0.55)', zIndex:200 }} />

      {/* Sheet */}
      <div style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:201, background:'var(--card)', borderRadius:'24px 24px 0 0', maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border-c)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontSize:'16px', fontWeight:800, color:'var(--ink)', letterSpacing:'-.02em', margin:0 }}>
            {selected ? `${selected.name}` : 'Choose a recipe'}
          </p>
          <button onClick={onClose} style={{ background:'var(--bg)', border:'none', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={16} strokeWidth={2.5} color='var(--ink3)' />
          </button>
        </div>

        {!selected ? (
          <>
            {/* Search */}
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-c)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--surface2)', borderRadius:'14px', padding:'10px 14px' }}>
                <Search size={15} strokeWidth={2} color='var(--ink4)' />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search 220 recipes…"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:'14px', color:'var(--ink)', fontFamily:'Plus Jakarta Sans, sans-serif' }}
                />
              </div>
            </div>

            {/* Recipe list */}
            <div style={{ overflowY:'auto', flex:1, WebkitOverflowScrolling:'touch' }}>
              {filtered.slice(0, 60).map(r => (
                <button key={r.id} onClick={() => setSelected(r)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid var(--border-c)', fontFamily:'Plus Jakarta Sans, sans-serif', textAlign:'left' }}>
                  <div>
                    <p style={{ fontSize:'13px', fontWeight:700, color:'var(--ink)', margin:'0 0 2px', letterSpacing:'-.01em' }}>{r.name}</p>
                    <p style={{ fontSize:'10px', color:'var(--ink4)', margin:0, fontWeight:500 }}>{r.protein}g P · {r.carbs}g C · {r.fat}g F</p>
                  </div>
                  <span style={{ fontSize:'15px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.03em', flexShrink:0, marginLeft:'12px' }}>{r.cal} cal</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
            {/* Macro summary */}
            <div style={{ background:'var(--surface2)', borderRadius:'16px', padding:'16px', display:'flex', justifyContent:'space-around' }}>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:'20px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.04em', margin:0 }}>{selected.cal}</p>
                <p style={{ fontSize:'10px', color:'var(--ink4)', fontWeight:500, margin:'2px 0 0' }}>cal</p>
              </div>
              {[{l:'Protein',v:selected.protein,c:'#4F3FD4'},{l:'Carbs',v:selected.carbs,c:'#0DC8A0'},{l:'Fat',v:selected.fat,c:'#F5A623'}].map(m => (
                <div key={m.l} style={{ textAlign:'center' }}>
                  <p style={{ fontSize:'20px', fontWeight:800, color:m.c, letterSpacing:'-.04em', margin:0 }}>{m.v}g</p>
                  <p style={{ fontSize:'10px', color:'var(--ink4)', fontWeight:500, margin:'2px 0 0' }}>{m.l}</p>
                </div>
              ))}
            </div>

            {/* Slot picker */}
            <div>
              <p style={{ fontSize:'12px', fontWeight:700, color:'var(--ink3)', marginBottom:'10px', letterSpacing:'.04em', textTransform:'uppercase' }}>Meal slot</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
                {SLOTS.map(s => (
                  <button key={s} onClick={() => setSlot(s)} style={{
                    padding:'10px 4px', borderRadius:'12px', border:'none', cursor:'pointer',
                    fontSize:'11px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif',
                    background: slot === s ? '#4F3FD4' : 'var(--bg)',
                    color:      slot === s ? '#fff'    : 'var(--ink3)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:'3px',
                  }}>
                    <span style={{ fontSize:'16px' }}>{SLOT_EMOJI[s]}</span>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setSelected(null)} style={{ flex:1, padding:'14px', borderRadius:'14px', border:'1.5px solid var(--border-c)', background:'var(--card)', cursor:'pointer', fontSize:'13px', fontWeight:700, color:'var(--ink3)', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
                Back
              </button>
              <button onClick={confirm} style={{ flex:2, padding:'14px', borderRadius:'14px', border:'none', background:'#4F3FD4', cursor:'pointer', fontSize:'14px', fontWeight:700, color:'#fff', fontFamily:'Plus Jakarta Sans, sans-serif', boxShadow:'0 4px 14px rgba(79,63,212,0.35)' }}>
                Log {slot}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function Track() {
  const { mealLog, goals, removeLoggedMeal } = useAppStore()
  const [showModal, setShowModal] = useState(false)

  const meals = mealLog.map(l => ({ ...l, recipe: recipeById[l.recipeId] })).filter(m => m.recipe)
  const total = {
    cal:     meals.reduce((s,m) => s + m.recipe.cal,     0),
    protein: meals.reduce((s,m) => s + m.recipe.protein, 0),
    carbs:   meals.reduce((s,m) => s + m.recipe.carbs,   0),
    fat:     meals.reduce((s,m) => s + m.recipe.fat,     0),
  }

  const macros = [
    { label:'Protein', key:'protein', color:'#4F3FD4', unit:'g' },
    { label:'Carbs',   key:'carbs',   color:'#0DC8A0', unit:'g' },
    { label:'Fat',     key:'fat',     color:'#F5A623', unit:'g' },
  ]

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })

  return (
    <>
      <div style={{ paddingBottom:'88px' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
          <p style={{ textAlign:'center', fontSize:'28px', fontWeight:800, letterSpacing:'-.04em', lineHeight:1, marginBottom:'16px', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <span style={{ color:'#fff' }}>Prep</span><span style={{ color:'#C4B5FD' }}>IQ</span>
          </p>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', marginBottom:'4px' }}>Track</h1>
              <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500 }}>{today}</p>
            </div>
            <button onClick={() => setShowModal(true)} style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(255,255,255,0.15)', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:'14px', padding:'9px 14px', cursor:'pointer', color:'#fff', fontSize:'12px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
              <Plus size={14} strokeWidth={2.5} />
              Log meal
            </button>
          </div>
        </div>

        <div style={{ padding:'0 16px', marginTop:'-12px', position:'relative', zIndex:10 }}>
          {/* Calorie card */}
          <div style={{ background:'var(--card)', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)', marginBottom:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
              <div>
                <p style={{ fontSize:'12px', color:'var(--ink4)', fontWeight:600, marginBottom:'2px' }}>Calories</p>
                <div style={{ display:'flex', alignItems:'baseline', gap:'4px' }}>
                  <span style={{ fontSize:'36px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.05em', lineHeight:1 }}>{total.cal}</span>
                  <span style={{ fontSize:'14px', color:'var(--ink4)', fontWeight:500 }}>/ {goals.calories}</span>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:'11px', color:'var(--ink4)', fontWeight:500, marginBottom:'2px' }}>Remaining</p>
                <p style={{ fontSize:'22px', fontWeight:800, color:'#0DC8A0', letterSpacing:'-.04em' }}>{Math.max(0, goals.calories - total.cal)}</p>
              </div>
            </div>
            <Bar val={total.cal} goal={goals.calories} color='#4F3FD4' />
            <p style={{ fontSize:'11px', color:'var(--ink4)', fontWeight:500, marginTop:'6px', textAlign:'right' }}>
              {goals.calories > 0 ? Math.round(total.cal / goals.calories * 100) : 0}% of daily goal
            </p>
          </div>

          {/* Macros */}
          <div style={{ background:'var(--card)', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)', marginBottom:'12px' }}>
            <p style={{ fontSize:'14px', fontWeight:800, color:'var(--ink)', letterSpacing:'-.02em', marginBottom:'16px' }}>Macros</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {macros.map(m => (
                <div key={m.key}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                    <span style={{ fontSize:'12px', fontWeight:600, color:'var(--ink2)' }}>{m.label}</span>
                    <div style={{ display:'flex', alignItems:'baseline', gap:'3px' }}>
                      <span style={{ fontSize:'16px', fontWeight:800, color:m.color, fontFamily:'DM Mono, monospace' }}>{total[m.key]}</span>
                      <span style={{ fontSize:'11px', color:'var(--ink4)', fontWeight:500 }}>/ {goals[m.key]}{m.unit}</span>
                    </div>
                  </div>
                  <Bar val={total[m.key]} goal={goals[m.key]} color={m.color} />
                </div>
              ))}
            </div>
          </div>

          {/* Logged meals */}
          <div style={{ background:'var(--card)', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
              <p style={{ fontSize:'14px', fontWeight:800, color:'var(--ink)', letterSpacing:'-.02em', margin:0 }}>Logged today</p>
              <button onClick={() => setShowModal(true)} style={{ display:'flex', alignItems:'center', gap:'4px', background:'rgba(79,63,212,0.08)', border:'none', borderRadius:'10px', padding:'6px 10px', cursor:'pointer', color:'#4F3FD4', fontSize:'11px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
                <Plus size={12} strokeWidth={2.5} /> Add
              </button>
            </div>

            {meals.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0' }}>
                <p style={{ fontSize:'13px', color:'var(--ink4)', fontWeight:500 }}>Nothing logged yet today</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {meals.map((m) => (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', background:'var(--surface2)', borderRadius:'14px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'12px', background:'rgba(79,63,212,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'18px' }}>
                      {SLOT_EMOJI[m.slot] || '🍽️'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' }}>
                        <p style={{ fontSize:'13px', fontWeight:700, color:'var(--ink)', letterSpacing:'-.01em', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.recipe.name}</p>
                        <span style={{ fontSize:'14px', fontWeight:800, color:'#4F3FD4', fontFamily:'DM Mono, monospace', flexShrink:0, marginLeft:'8px' }}>{m.recipe.cal}</span>
                      </div>
                      <p style={{ fontSize:'10px', color:'var(--ink4)', fontWeight:500, margin:0 }}>{m.slot} · {m.time} · {m.recipe.protein}g P · {m.recipe.carbs}g C · {m.recipe.fat}g F</p>
                    </div>
                    <button onClick={() => removeLoggedMeal(m.id)} style={{ background:'rgba(229,62,62,0.08)', border:'none', borderRadius:'50%', width:'28px', height:'28px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <X size={13} strokeWidth={2.5} color='#E53E3E' />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && <LogMealModal onClose={() => setShowModal(false)} />}
    </>
  )
}
