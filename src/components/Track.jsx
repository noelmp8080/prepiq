import { recipeById } from '../data/recipes'

const LOGGED = [
  { recipeId:1,   slot:'Breakfast', time:'7:30am'  },
  { recipeId:43,  slot:'Lunch',     time:'12:30pm' },
  { recipeId:107, slot:'Snack',     time:'3:00pm'  },
]

const GOALS = { cal:1800, protein:180, carbs:200, fat:60 }

function Bar({ val, goal, color }) {
  const pct = Math.min(Math.round(val / goal * 100), 100)
  return (
    <div style={{ height:'8px', background:'#E4E0F4', borderRadius:'6px', overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:'6px', transition:'width .4s ease' }} />
    </div>
  )
}

export default function Track() {
  const meals = LOGGED.map(l => ({ ...l, recipe: recipeById[l.recipeId] }))
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

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
        <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', marginBottom:'4px' }}>Track</h1>
        <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500 }}>Tuesday, June 9</p>
      </div>

      <div style={{ padding:'0 16px', marginTop:'-12px', position:'relative', zIndex:10 }}>
        {/* Calorie card */}
        <div style={{ background:'#fff', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)', marginBottom:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div>
              <p style={{ fontSize:'12px', color:'#B4ADCA', fontWeight:600, marginBottom:'2px' }}>Calories</p>
              <div style={{ display:'flex', alignItems:'baseline', gap:'4px' }}>
                <span style={{ fontSize:'36px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.05em', lineHeight:1 }}>{total.cal}</span>
                <span style={{ fontSize:'14px', color:'#B4ADCA', fontWeight:500 }}>/ {GOALS.cal}</span>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:'11px', color:'#B4ADCA', fontWeight:500, marginBottom:'2px' }}>Remaining</p>
              <p style={{ fontSize:'22px', fontWeight:800, color:'#0DC8A0', letterSpacing:'-.04em' }}>{GOALS.cal - total.cal}</p>
            </div>
          </div>
          <Bar val={total.cal} goal={GOALS.cal} color='#4F3FD4' />
          <p style={{ fontSize:'11px', color:'#B4ADCA', fontWeight:500, marginTop:'6px', textAlign:'right' }}>{Math.round(total.cal/GOALS.cal*100)}% of daily goal</p>
        </div>

        {/* Macros */}
        <div style={{ background:'#fff', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)', marginBottom:'12px' }}>
          <p style={{ fontSize:'14px', fontWeight:800, color:'#1A1626', letterSpacing:'-.02em', marginBottom:'16px' }}>Macros</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
            {macros.map(m => (
              <div key={m.key}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                  <span style={{ fontSize:'12px', fontWeight:600, color:'#3D3650' }}>{m.label}</span>
                  <div style={{ display:'flex', alignItems:'baseline', gap:'3px' }}>
                    <span style={{ fontSize:'16px', fontWeight:800, color:m.color, fontFamily:'DM Mono, monospace' }}>{total[m.key]}</span>
                    <span style={{ fontSize:'11px', color:'#B4ADCA', fontWeight:500 }}>/ {GOALS[m.key]}{m.unit}</span>
                  </div>
                </div>
                <Bar val={total[m.key]} goal={GOALS[m.key]} color={m.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Logged meals */}
        <div style={{ background:'#fff', borderRadius:'24px', padding:'20px', boxShadow:'0 4px 24px rgba(79,63,212,0.12)' }}>
          <p style={{ fontSize:'14px', fontWeight:800, color:'#1A1626', letterSpacing:'-.02em', marginBottom:'14px' }}>Logged today</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {meals.map((m, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', background:'#F8F7FD', borderRadius:'14px' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'12px', background:'rgba(79,63,212,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:'18px' }}>
                    {m.slot === 'Breakfast' ? '🍳' : m.slot === 'Lunch' ? '🥗' : '🍎'}
                  </span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' }}>
                    <p style={{ fontSize:'13px', fontWeight:700, color:'#1A1626', letterSpacing:'-.01em' }}>{m.recipe.name}</p>
                    <span style={{ fontSize:'14px', fontWeight:800, color:'#4F3FD4', fontFamily:'DM Mono, monospace' }}>{m.recipe.cal}</span>
                  </div>
                  <p style={{ fontSize:'10px', color:'#B4ADCA', fontWeight:500 }}>{m.slot} · {m.time} · {m.recipe.protein}g P · {m.recipe.carbs}g C · {m.recipe.fat}g F</p>
                </div>
              </div>
            ))}
            <div style={{ padding:'12px', background:'rgba(240,238,248,0.6)', borderRadius:'14px', border:'1.5px dashed rgba(79,63,212,0.15)', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
              <span style={{ fontSize:'12px', color:'#B4ADCA', fontWeight:500 }}>Dinner · not yet logged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
