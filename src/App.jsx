import { useState, useEffect } from 'react'
import { AppStoreProvider, useAppStore } from './store/useAppStore'
import { ThemeProvider } from './store/useTheme'
import { useSurface, isWide } from './store/useSurface'
import { railIsExpanded } from './store/storeLogic'
import BottomNav from './components/BottomNav'
import Rail      from './components/Rail'
import Shell     from './components/Shell'
import Today    from './components/Today'
import Plan     from './components/Plan'
import Recipes  from './components/Recipes'
import Grocery  from './components/Grocery'
import Track    from './components/Track'
import Settings from './components/Settings'
import Auth     from './components/Auth'

function AppInner() {
  const {
    user, bootScope, cloudEnabled, groceryUnchecked, railStored, setRailExpanded,
  } = useAppStore()
  const surface = useSurface()
  const wide = isWide(surface)
  const [tab,      setTab]      = useState('today')
  const [skipAuth, setSkipAuth] = useState(() => !!sessionStorage.getItem('skipAuth'))
  const [phoneSettings, setPhoneSettings] = useState(false)

  /* EVERY HOOK BEFORE EVERY EARLY RETURN.
   *
   * This effect sat below the spinner and Auth returns when block E added
   * it, which is a rules-of-hooks violation with a real symptom: a
   * first-time visitor renders the spinner (five hooks), auth resolves,
   * the next render reaches the effect (six hooks), and React throws
   * "Rendered more hooks than during the previous render" — a white
   * screen for exactly the people who have never used the app. It went
   * unnoticed because no test rendered <App/> across that transition
   * until the local-only work did.
   *
   * Narrowing off a destination the phone does not have: the pane
   * becomes the sheet in place rather than closing. */
  useEffect(() => {
    if (!wide && tab === 'goals') { setTab('today'); setPhoneSettings(true) }
  }, [wide, tab])

  /* THE GATE IS AUTH-ONLY NOW.
     Data is read off the device at construction, so nothing here is
     waiting for a fetch — the only open question is whether to show the
     app or the Auth screen. And when the device already knows whose
     scope it booted into, that answer is known too: render, and let auth
     confirm it. A returning user gets their list with the radio off. */
  /* Local only never reaches this: the store resolves `user` to null on
     the first render, so there is no pending question to spin on. */
  if (user === undefined && !bootScope) {
    return (
      <div style={{ minHeight:'100dvh', background:'var(--pq-page)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:'40px', height:'40px', borderRadius:'50%', border:'3px solid rgba(255,255,255,0.14)', borderTopColor:'var(--pq-accent)', animation:'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* No cloud means no account to sign in to, so there is nothing for the
     Auth screen to do — showing it would be offering a control that
     cannot succeed. Settings says which mode this is. */
  if (!user && !skipAuth && cloudEnabled) {
    return (
      <Auth onSkip={() => {
        sessionStorage.setItem('skipAuth', '1')
        setSkipAuth(true)
      }} />
    )
  }

  const railExpanded = railIsExpanded(railStored, surface)

  /* GOALS IS A DESTINATION ON WIDE AND A SHEET ON PHONE, and it is the
     SAME MOUNTED COMPONENT either way. App owns whether it is open, so
     Settings never unmounts and a half-typed goal survives the window
     being narrowed from pane to sheet. Rendering it inside the wide
     branch would have thrown the draft away on a resize. */
  const settingsOpen = wide ? tab === 'goals' : phoneSettings

  return (
    <Shell
      wide={wide}
      rail={wide ? (
        <Rail
          active={tab}
          onChange={setTab}
          expanded={railExpanded}
          onToggle={setRailExpanded}
          badges={{ grocery: groceryUnchecked }}
        />
      ) : null}
      nav={wide ? null : (
        <BottomNav active={tab} onChange={setTab}
                   badges={{ grocery: groceryUnchecked > 0 }} />
      )}
    >
      {tab === 'today'   && <Today   onChange={setTab} surface={surface}
                                     onOpenSettings={() => setPhoneSettings(true)} />}
      {tab === 'plan'    && <Plan    surface={surface} />}
      {tab === 'recipes' && <Recipes surface={surface} />}
      {tab === 'grocery' && <Grocery onChange={setTab} surface={surface} />}
      {tab === 'track'   && <Track   onChange={setTab} surface={surface} />}
      <Settings
        open={settingsOpen}
        inline={wide}
        onClose={() => { setPhoneSettings(false); if (wide) setTab('today') }}
      />
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
