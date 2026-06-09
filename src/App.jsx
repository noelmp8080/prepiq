import { useState } from 'react'
import BottomNav from './components/BottomNav'
import Today     from './components/Today'
import Plan      from './components/Plan'
import Recipes   from './components/Recipes'
import Track     from './components/Track'

function Grocery() {
  return (
    <div style={{ paddingBottom:'88px' }}>
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 28px' }}>
        <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', marginBottom:'4px' }}>Grocery List</h1>
        <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500 }}>Auto-generated from your plan</p>
      </div>
      <div style={{ padding:'32px 16px', textAlign:'center' }}>
        <p style={{ fontSize:'14px', color:'#B4ADCA', fontWeight:500 }}>Coming soon</p>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('today')
  return (
    <>
      {tab === 'today'   && <Today />}
      {tab === 'plan'    && <Plan />}
      {tab === 'recipes' && <Recipes />}
      {tab === 'grocery' && <Grocery />}
      {tab === 'track'   && <Track />}
      <BottomNav active={tab} onChange={setTab} />
    </>
  )
}
