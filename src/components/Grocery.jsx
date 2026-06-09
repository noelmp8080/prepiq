import { CheckSquare, Square, Trash2 } from 'lucide-react'
import { recipeById } from '../data/recipes'
import { useAppStore } from '../store/useAppStore'

// Build grocery items from the week plan's recipes
function buildGroceryItems(weekPlan) {
  const seen = new Set()
  const items = []
  for (const day of weekPlan) {
    for (const id of day.ids) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      const r = recipeById[id]
      if (r) items.push({ id: `recipe_${id}`, label: r.name, cal: r.cal, protein: r.protein, source: r.source })
    }
  }
  return items
}

export default function Grocery() {
  const { weekPlan, groceryChecks, toggleGroceryItem, checkAllGrocery, clearGrocery } = useAppStore()

  const items  = buildGroceryItems(weekPlan)
  const allIds = items.map(i => i.id)
  const done   = items.filter(i => groceryChecks.has(i.id)).length
  const pct    = items.length ? Math.round(done / items.length * 100) : 0

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', margin:'0 0 4px' }}>Grocery List</h1>
            <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500, margin:0 }}>From your weekly plan · {done}/{items.length} checked</p>
          </div>
          <button onClick={clearGrocery} style={{ display:'flex', alignItems:'center', gap:'5px', background:'rgba(255,255,255,0.1)', border:'1.5px solid rgba(255,255,255,0.15)', borderRadius:'12px', padding:'8px 12px', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'11px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <Trash2 size={12} strokeWidth={2.5} /> Clear
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height:'6px', background:'rgba(255,255,255,0.15)', borderRadius:'4px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'#0DC8A0', borderRadius:'4px', transition:'width .4s ease' }} />
        </div>
      </div>

      <div style={{ padding:'16px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 20px' }}>
            <p style={{ fontSize:'14px', color:'#B4ADCA', fontWeight:500 }}>No items — set up your weekly plan first.</p>
          </div>
        ) : (
          <>
            {/* Check all */}
            <button
              onClick={() => done === items.length ? clearGrocery() : checkAllGrocery(allIds)}
              style={{ width:'100%', padding:'13px', borderRadius:'16px', border:'1.5px solid rgba(79,63,212,0.2)', background:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:700, color:'#4F3FD4', fontFamily:'Plus Jakarta Sans, sans-serif', marginBottom:'12px' }}
            >
              {done === items.length ? 'Uncheck all' : `Check all (${items.length - done} remaining)`}
            </button>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {items.map(item => {
                const checked = groceryChecks.has(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleGroceryItem(item.id)}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', background:'#fff', borderRadius:'16px', border:'none', cursor:'pointer', textAlign:'left', boxShadow:'0 1px 6px rgba(79,63,212,0.06)', fontFamily:'Plus Jakarta Sans, sans-serif', opacity: checked ? 0.55 : 1, transition:'opacity .15s' }}
                  >
                    {checked
                      ? <CheckSquare size={20} strokeWidth={2} color='#0DC8A0' />
                      : <Square      size={20} strokeWidth={2} color='#C4B5FD'  />
                    }
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:'13px', fontWeight:700, color:'#1A1626', margin:'0 0 2px', textDecoration: checked ? 'line-through' : 'none' }}>{item.label}</p>
                      <p style={{ fontSize:'10px', color:'#B4ADCA', fontWeight:500, margin:0 }}>{item.cal} cal · {item.protein}g protein · {item.source === 'jalal' ? "Jalal's" : 'Meal Prep'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
