import { useState } from 'react'
import { AppStoreProvider, useAppStore } from './store/useAppStore'
import { ThemeProvider } from './store/useTheme'
import BottomNav from './components/BottomNav'
import Today    from './components/Today'
import Plan     from './components/Plan'
import Recipes  from './components/Recipes'
import Grocery  from './components/Grocery'
import Track    from './components/Track'
import Auth     from './components/Auth'

function AppInner() {
  const { user } = useAppStore()
  const [tab,      setTab]      = useState('today')
  const [skipAuth, setSkipAuth] = useState(() => !!sessionStorage.getItem('skipAuth'))

  if (user === undefined) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:'40px', height:'40px', borderRadius:'50%', border:'3px solid var(--bg2)', borderTopColor:'#4F3FD4', animation:'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!user && !skipAuth) {
    return (
      <Auth onSkip={() => {
        sessionStorage.setItem('skipAuth', '1')
        setSkipAuth(true)
      }} />
    )
  }

  return (
    <>
      {tab === 'today'   && <Today   onChange={setTab} />}
      {tab === 'plan'    && <Plan />}
      {tab === 'recipes' && <Recipes />}
      {tab === 'grocery' && <Grocery />}
      {tab === 'track'   && <Track />}
      <BottomNav active={tab} onChange={setTab} />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppStoreProvider>
        <AppInner />
      </AppStoreProvider>
    </ThemeProvider>
  )
}
