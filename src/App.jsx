import { useState } from 'react'
import { AppStoreProvider, useAppStore } from './store/useAppStore'
import { ThemeProvider } from './store/useTheme'
import BottomNav from './components/BottomNav'
import Shell     from './components/Shell'
import Today    from './components/Today'
import Plan     from './components/Plan'
import Recipes  from './components/Recipes'
import Grocery  from './components/Grocery'
import Track    from './components/Track'
import Auth     from './components/Auth'
import SyncErrorBanner from './components/SyncErrorBanner'

function AppInner() {
  const { user } = useAppStore()
  const [tab,      setTab]      = useState('today')
  const [skipAuth, setSkipAuth] = useState(() => !!sessionStorage.getItem('skipAuth'))

  if (user === undefined) {
    return (
      <div style={{ minHeight:'100dvh', background:'var(--pq-page)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:'40px', height:'40px', borderRadius:'50%', border:'3px solid rgba(255,255,255,0.14)', borderTopColor:'var(--pq-accent)', animation:'spin 0.7s linear infinite' }} />
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
    <Shell
      nav={<BottomNav active={tab} onChange={setTab} />}
      /* App-wide: a failed cloud write can happen on any screen, and the
         writer that costs the most (the weekly plan) fails on Plan, not
         here. Kept against the design, which has no error state because
         it assumes no fetch - see DEVIATIONS.md. */
      overlay={<SyncErrorBanner />}
    >
      {tab === 'today'   && <Today   onChange={setTab} />}
      {tab === 'plan'    && <Plan />}
      {tab === 'recipes' && <Recipes />}
      {tab === 'grocery' && <Grocery />}
      {tab === 'track'   && <Track />}
    </Shell>
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
