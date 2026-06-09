import { recipeById } from '../data/recipes'

const PLAN = [
  { day:'Mon', short:'M', ids:[1,  2]   },
  { day:'Tue', short:'T', ids:[3,  4]   },
  { day:'Wed', short:'W', ids:[5,  6]   },
  { day:'Thu', short:'T', ids:[7,  8]   },
  { day:'Fri', short:'F', ids:[9,  10]  },
  { day:'Sat', short:'S', ids:[11, null]},
  { day:'Sun', short:'S', ids:[12, null]},
]
const TODAY_IDX = 4 // Friday

const MEAL_LABELS = ['Breakfast / Lunch', 'Dinner']

export default function Plan() {
  const totalCal = day =>
    day.ids.filter(Boolean).reduce((s, id) => s + (recipeById[id]?.cal || 0), 0)

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
        <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', marginBottom:'4px' }}>Weekly Plan</h1>
        <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500 }}>June 2 – 8, 2025</p>

        {/* Day strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'6px', marginTop:'20px' }}>
          {PLAN.map((d, i) => {
            const isToday = i === TODAY_IDX
            return (
              <div key={d.day} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                <span style={{ fontSize:'9px', fontWeight:700, color: isToday ? '#C4B5FD' : 'rgba(255,255,255,0.4)', letterSpacing:'.08em', textTransform:'uppercase' }}>{d.short}</span>
                <div style={{
                  width:'32px', height:'32px', borderRadius:'50%',
                  background: isToday ? '#4F3FD4' : 'rgba(255,255,255,0.08)',
                  border: isToday ? '2px solid #C4B5FD' : '2px solid transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <span style={{ fontSize:'13px', fontWeight:800, color: isToday ? '#fff' : 'rgba(255,255,255,0.6)' }}>{2 + i}</span>
                </div>
                <span style={{ fontSize:'8px', fontWeight:600, color:'rgba(255,255,255,0.35)' }}>{totalCal(d)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day cards */}
      <div style={{ padding:'16px' }}>
        {PLAN.map((d, i) => {
          const isToday = i === TODAY_IDX
          return (
            <div key={d.day} style={{ marginBottom:'12px', background:'#fff', borderRadius:'20px', overflow:'hidden', boxShadow: isToday ? '0 4px 20px rgba(79,63,212,0.15)' : '0 2px 8px rgba(79,63,212,0.05)', border: isToday ? '2px solid rgba(79,63,212,0.25)' : '2px solid transparent' }}>
              {/* Day header */}
              <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(26,22,38,0.05)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ width:'32px', height:'32px', borderRadius:'10px', background: isToday ? '#4F3FD4' : '#F0EEF8', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'13px', fontWeight:800, color: isToday ? '#fff' : '#7B728E' }}>{2 + i}</span>
                  </div>
                  <div>
                    <span style={{ fontSize:'14px', fontWeight:700, color:'#1A1626' }}>{d.day}</span>
                    {isToday && <span style={{ marginLeft:'6px', fontSize:'9px', fontWeight:700, color:'#4F3FD4', background:'rgba(79,63,212,0.1)', padding:'2px 6px', borderRadius:'5px', letterSpacing:'.08em' }}>TODAY</span>}
                  </div>
                </div>
                <span style={{ fontSize:'12px', fontWeight:800, color: isToday ? '#4F3FD4' : '#7B728E', fontFamily:'DM Mono, monospace' }}>{totalCal(d)} cal</span>
              </div>

              {/* Meals */}
              <div style={{ padding:'10px 16px 12px', display:'flex', flexDirection:'column', gap:'8px' }}>
                {d.ids.map((id, j) => {
                  const recipe = id ? recipeById[id] : null
                  if (!recipe) return (
                    <div key={j} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'rgba(240,238,248,0.6)', borderRadius:'12px', border:'1.5px dashed rgba(79,63,212,0.15)' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#E4E0F4', flexShrink:0 }} />
                      <span style={{ fontSize:'12px', color:'#C4B5FD', fontWeight:500 }}>{MEAL_LABELS[j]} — empty</span>
                    </div>
                  )
                  return (
                    <div key={j} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'rgba(240,238,248,0.5)', borderRadius:'12px' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: j === 0 ? '#4F3FD4' : '#0DC8A0', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:'12px', fontWeight:700, color:'#1A1626', letterSpacing:'-.01em', marginBottom:'2px' }}>{recipe.name}</p>
                        <p style={{ fontSize:'10px', color:'#B4ADCA', fontWeight:500 }}>{recipe.protein}g protein · {recipe.cal} cal</p>
                      </div>
                      <span style={{ fontSize:'13px', fontWeight:800, color:'#7B728E', fontFamily:'DM Mono, monospace' }}>{recipe.cal}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
