import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const PRESETS = {
  cut:      { calories: 1500, protein: 150, carbs: 150, fat: 50 },
  maintain: { calories: 1800, protein: 180, carbs: 200, fat: 60 },
  bulk:     { calories: 2200, protein: 220, carbs: 250, fat: 70 },
}

const FIELDS = [
  { label: 'Calories', unit: 'kcal',  key: 'calories' },
  { label: 'Protein',  unit: 'grams', key: 'protein' },
  { label: 'Carbs',    unit: 'grams', key: 'carbs' },
  { label: 'Fat',      unit: 'grams', key: 'fat' },
]

export default function Settings({ open, onClose }) {
  const { goals, updateGoals } = useAppStore()
  const [form, setForm] = useState({ ...goals })

  useEffect(() => {
    if (open) setForm({ ...goals })
  }, [open])

  function applyPreset(key) {
    setForm({ ...PRESETS[key] })
  }

  function save() {
    updateGoals({
      calories: Number(form.calories),
      protein:  Number(form.protein),
      carbs:    Number(form.carbs),
      fat:      Number(form.fat),
    })
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(26,22,38,0.55)', zIndex:300 }}
      />

      {/* Sheet */}
      <div style={{
        position:'fixed', left:0, right:0, bottom:0,
        zIndex:301,
        background:'var(--card)',
        borderRadius:'24px 24px 0 0',
        padding:'24px 20px 40px',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px' }}>
          <div>
            <p style={{ fontSize:'20px', fontWeight:800, color:'var(--ink)', letterSpacing:'-.03em', margin:'0 0 4px' }}>Daily Goals</p>
            <p style={{ fontSize:'12px', color:'var(--ink3)', fontWeight:500, margin:0 }}>Set your personal nutrition targets</p>
          </div>
          <button
            onClick={onClose}
            style={{ background:'var(--bg)', border:'none', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
          >
            <X size={16} strokeWidth={2.5} color='var(--ink3)' />
          </button>
        </div>

        {/* Input rows */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'24px' }}>
          {FIELDS.map(f => (
            <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:600, color:'var(--ink)', marginBottom:'2px' }}>{f.label}</div>
                <div style={{ fontSize:'11px', color:'var(--ink3)', fontWeight:500 }}>{f.unit}</div>
              </div>
              <input
                type="number"
                value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={{
                  background:'var(--surface2)',
                  border:'1px solid var(--border-c)',
                  borderRadius:'10px',
                  padding:'8px 12px',
                  fontSize:'16px',
                  fontWeight:700,
                  color:'var(--ink)',
                  width:'100px',
                  textAlign:'center',
                  fontFamily:'DM Mono, monospace',
                  outline:'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* Presets */}
        <p style={{ fontSize:'11px', fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 10px' }}>Quick presets</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'20px' }}>
          {[
            { label:'Cut',      sub:'1500 cal', key:'cut' },
            { label:'Maintain', sub:'1800 cal', key:'maintain' },
            { label:'Bulk',     sub:'2200 cal', key:'bulk' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              style={{
                padding:'10px 8px',
                borderRadius:'12px',
                border:'1.5px solid var(--border-c)',
                background:'var(--surface2)',
                cursor:'pointer',
                fontFamily:'Plus Jakarta Sans, sans-serif',
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                gap:'2px',
              }}
            >
              <span style={{ fontSize:'12px', fontWeight:700, color:'var(--ink)' }}>{p.label}</span>
              <span style={{ fontSize:'10px', fontWeight:500, color:'var(--ink3)' }}>{p.sub}</span>
            </button>
          ))}
        </div>

        {/* Save */}
        <button
          onClick={save}
          style={{
            width:'100%',
            padding:'16px',
            borderRadius:'16px',
            border:'none',
            background:'linear-gradient(135deg,#4F3FD4,#7B6EF5)',
            color:'#fff',
            fontSize:'15px',
            fontWeight:700,
            cursor:'pointer',
            fontFamily:'Plus Jakarta Sans, sans-serif',
            boxShadow:'0 4px 16px rgba(79,63,212,0.35)',
          }}
        >
          Save Goals
        </button>
      </div>
    </>
  )
}
