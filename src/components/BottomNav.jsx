import { Home, Calendar, ChefHat, ShoppingCart, BarChart3 } from 'lucide-react'

const tabs = [
  { id:'today', label:'Today', Icon:Home },
  { id:'plan', label:'Plan', Icon:Calendar },
  { id:'recipes', label:'Recipes', Icon:ChefHat },
  { id:'grocery', label:'Grocery', Icon:ShoppingCart, notify:true },
  { id:'track', label:'Track', Icon:BarChart3 },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav style={{
      position:'fixed', bottom:0, left:0, right:0,
      background:'var(--bg)',
      backdropFilter:'blur(20px)',
      borderTop:'1px solid rgba(79,63,212,0.08)',
      display:'flex', justifyContent:'space-around',
      height:'68px', zIndex:100,
      paddingBottom:'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(({ id, label, Icon, notify }) => {
        const isActive = active === id
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:'3px', flex:1, border:'none',
            background:'none', cursor:'pointer', position:'relative',
            padding:'6px 0', fontFamily:'Plus Jakarta Sans, sans-serif',
          }}>
            {notify && !isActive && (
              <span style={{ position:'absolute', top:'8px', right:'calc(50% - 16px)', width:'7px', height:'7px', borderRadius:'50%', background:'#FF5C5C', border:'2px solid var(--bg)' }} />
            )}
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#4F3FD4' : 'var(--ink4)'} />
            <span style={{ fontSize:'9px', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: isActive ? '#4F3FD4' : 'var(--ink4)' }}>
              {label}
            </span>
            {isActive && <span style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:'20px', height:'3px', background:'#4F3FD4', borderRadius:'2px 2px 0 0' }} />}
          </button>
        )
      })}
    </nav>
  )
}
