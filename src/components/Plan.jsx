import { Shuffle } from 'lucide-react'
import { recipeById } from '../data/recipes'
import { useAppStore } from '../store/useAppStore'

const MEAL_LABELS = ['Meal 1', 'Meal 2']
const TODAY_NAME  = new Date().toLocaleDateString('en-US', { weekday:'short' })

const WEEK_START = (() => {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
})()

function formatDateRange() {
  const end = new Date(WEEK_START)
  end.setDate(end.getDate() + 6)
  const opts = { month:'short', day:'numeric' }
  return `${WEEK_START.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

export default function Plan() {
  const { weekPlan, shuffleWeekPlan } = useAppStore()

  function totalCal(day) {
    return day.ids.filter(Boolean).reduce((s, id) => s + (recipeById[id]?.cal || 0), 0)
  }

  function dayDate(i) {
    const d = new Date(WEEK_START)
    d.setDate(d.getDate() + i)
    return d.getDate()
  }

  function isToday(day) {
    return day.day.toLowerCase() === TODAY_NAME.toLowerCase()
  }

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
        <p style={{ textAlign:'center', display:'block', fontSize:'36px', fontWeight:800, letterSpacing:'-.04em', lineHeight:1, padding:'12px 0 8px', fontFamily:'Plus Jakarta Sans, sans-serif', margin:0 }}>
          <span style={{ color:'#fff' }}>Prep</span><span style={{ color:'#C4B5FD' }}>IQ</span>
        </p>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
          <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', margin:0 }}>Weekly Plan</h1>
          <button onClick={shuffleWeekPlan} style={{ display:'flex', alignItems:'center', gap:'5px', background:'rgba(255,255,255,0.12)', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:'12px', padding:'8px 12px', cursor:'pointer', color:'#fff', fontSize:'11px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <Shuffle size={13} strokeWidth={2.5} /> Shuffle
          </button>
        </div>
        <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500, marginBottom:'20px' }}>{formatDateRange()}</p>

        {/* Day strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'6px' }}>
          {weekPlan.map((d, i) => {
            const today = isToday(d)
            return (
              <div key={d.day} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                <span style={{ fontSize:'9px', fontWeight:700, color: today ? '#C4B5FD' : 'rgba(255,255,255,0.4)', letterSpacing:'.08em', textTransform:'uppercase' }}>{d.day[0]}</span>
                <div style={{
                  width:'32px', height:'32px', borderRadius:'50%',
                  background: today ? '#4F3FD4' : 'rgba(255,255,255,0.08)',
                  border: today ? '2px solid #C4B5FD' : '2px solid transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <span style={{ fontSize:'13px', fontWeight:800, color: today ? '#fff' : 'rgba(255,255,255,0.6)' }}>{dayDate(i)}</span>
                </div>
                <span style={{ fontSize:'8px', fontWeight:600, color:'rgba(255,255,255,0.35)' }}>{totalCal(d)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day cards */}
      <div style={{ padding:'16px' }}>
        {weekPlan.map((d, i) => {
          const today = isToday(d)
          return (
            <div key={d.day} style={{ marginBottom:'12px', background:'var(--card)', borderRadius:'20px', overflow:'hidden', boxShadow: today ? '0 4px 20px rgba(79,63,212,0.15)' : '0 2px 8px rgba(79,63,212,0.05)', border: today ? '2px solid rgba(79,63,212,0.25)' : '2px solid transparent' }}>
              <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border-c)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ width:'32px', height:'32px', borderRadius:'10px', background: today ? '#4F3FD4' : 'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:'13px', fontWeight:800, color: today ? '#fff' : 'var(--ink3)' }}>{dayDate(i)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize:'14px', fontWeight:700, color:'var(--ink)' }}>{d.day}</span>
                    {today && <span style={{ marginLeft:'6px', fontSize:'9px', fontWeight:700, color:'#4F3FD4', background:'rgba(79,63,212,0.1)', padding:'2px 6px', borderRadius:'5px', letterSpacing:'.08em' }}>TODAY</span>}
                  </div>
                </div>
                <span style={{ fontSize:'12px', fontWeight:800, color: today ? '#4F3FD4' : 'var(--ink3)', fontFamily:'DM Mono, monospace' }}>{totalCal(d)} cal</span>
              </div>

              <div style={{ padding:'10px 16px 12px', display:'flex', flexDirection:'column', gap:'8px' }}>
                {d.ids.map((id, j) => {
                  const recipe = id ? recipeById[id] : null
                  if (!recipe) return (
                    <div key={j} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--surface2)', borderRadius:'12px', border:'1.5px dashed rgba(79,63,212,0.15)' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--bg2)', flexShrink:0 }} />
                      <span style={{ fontSize:'12px', color:'var(--ink4)', fontWeight:500 }}>{MEAL_LABELS[j]} — empty</span>
                    </div>
                  )
                  return (
                    <div key={j} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--surface2)', borderRadius:'12px' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: j === 0 ? '#4F3FD4' : '#0DC8A0', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:'12px', fontWeight:700, color:'var(--ink)', letterSpacing:'-.01em', marginBottom:'2px' }}>{recipe.name}</p>
                        <p style={{ fontSize:'10px', color:'var(--ink4)', fontWeight:500 }}>{recipe.protein}g protein · {recipe.cal} cal</p>
                      </div>
                      <span style={{ fontSize:'13px', fontWeight:800, color:'var(--ink3)', fontFamily:'DM Mono, monospace' }}>{recipe.cal}</span>
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
