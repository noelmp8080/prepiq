import { useState } from 'react'
import Card from './Card'
import Logo from './Logo'
import { useAppStore } from '../store/useAppStore'

function friendlyError(err) {
  const code = err?.code || ''
  switch (code) {
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return `[${code}] The Firebase API key in .env is invalid or has been regenerated. Go to Firebase Console → Project Settings → General → Web apps and copy the current apiKey value into .env, then restart the dev server.`
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return `[${code}] Incorrect email or password.`
    case 'auth/email-already-in-use':
      return `[${code}] This email is already registered. Try signing in instead.`
    case 'auth/weak-password':
      return `[${code}] Password must be at least 6 characters.`
    case 'auth/invalid-email':
      return `[${code}] Invalid email address.`
    case 'auth/operation-not-allowed':
      return `[${code}] Email/Password sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → Email/Password and enable it.`
    case 'auth/unauthorized-domain':
      return `[${code}] This domain is not authorized. Go to Firebase Console → Authentication → Settings → Authorized domains and add localhost and your network IP.`
    case 'auth/network-request-failed':
      return `[${code}] Network error — check your internet connection.`
    case 'auth/too-many-requests':
      return `[${code}] Too many attempts. Please wait a few minutes and try again.`
    default:
      return code ? `[${code}] ${err.message}` : err.message
  }
}

export default function Auth({ onSkip }) {
  const { signIn, signUp } = useAppStore()
  const [mode,     setMode]     = useState('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
    } catch (err) {
      console.error('[Auth] Firebase error:', err.code, err.message)
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', minHeight: 'var(--pq-tap-min)', padding: '14px 16px',
    borderRadius: 'var(--pq-r-button)', outline: 'none',
    background: 'var(--pq-track-bg)',
    border: '1px solid var(--pq-rule-cell)',
    boxShadow: 'var(--pq-well-shadow)',
    fontSize: 'var(--pq-size-meal)', color: 'var(--pq-text)',
    fontFamily: 'var(--pq-sans)',
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--pq-page)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 'var(--pq-gutter)',
      color: 'var(--pq-text)', fontFamily: 'var(--pq-sans)',
    }}>
      {/* THE SHELL RAMP, ON THE ONE SCREEN OUTSIDE THE SHELL. Auth
          renders before App reaches <Shell>, so it paints the same fixed
          ramp itself rather than sitting on a flat page — otherwise the
          first thing anyone sees is the only screen that looks like a
          different app. */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, background: 'var(--pq-shell)', pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 380,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Logo size={34} caption="MEAL PREP" />
          <p style={{
            margin: 0, fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-eyebrow)',
            color: 'var(--pq-text-3)', letterSpacing: 'var(--pq-track-eyebrow)',
          }}>SMART MEAL PREP, TRACKED</p>
        </div>

        <Card style={{ padding: 22 }}>
          {/* Mode toggle */}
          <div style={{
            display: 'flex', gap: 4, padding: 4, marginBottom: 20,
            borderRadius: 'var(--pq-r-button)',
            background: 'var(--pq-well-bg)', boxShadow: 'var(--pq-well-shadow)',
          }}>
            {['signin', 'signup'].map(m => {
              const on = mode === m
              return (
                <button key={m} onClick={() => { setMode(m); setError('') }}
                  aria-pressed={on}
                  style={{
                    flex: 1, minHeight: 'var(--pq-tap-min)',
                    borderRadius: 'var(--pq-r-chip)', border: 'none', cursor: 'pointer',
                    background: on ? 'var(--pq-accent-grad)' : 'transparent',
                    boxShadow: on ? 'var(--pq-accent-raise)' : 'none',
                    color: on ? 'var(--pq-on-accent-ink)' : 'var(--pq-text-3)',
                    fontFamily: 'var(--pq-mono)', fontSize: 12, fontWeight: 600,
                    letterSpacing: 'var(--pq-track-chip)',
                  }}>
                  {m === 'signin' ? 'SIGN IN' : 'SIGN UP'}
                </button>
              )
            })}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email" placeholder="Email address" aria-label="Email address"
              value={email} onChange={e => setEmail(e.target.value)} required
              style={inputStyle}
            />
            <input
              type="password" placeholder="Password" aria-label="Password"
              value={password} onChange={e => setPassword(e.target.value)} required
              style={inputStyle}
            />

            {error && (
              <div role="alert" style={{
                fontSize: 12, fontWeight: 500, lineHeight: 1.5, wordBreak: 'break-word',
                padding: '10px 12px', borderRadius: 'var(--pq-r-button)',
                background: 'rgba(197,48,48,0.14)',
                border: '1px solid rgba(233,120,120,0.34)',
                color: '#F2C7C7',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', minHeight: 'var(--pq-tap-min)', padding: 15, marginTop: 4,
                borderRadius: 'var(--pq-r-button)', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                background: 'var(--pq-accent-grad)', boxShadow: 'var(--pq-accent-raise)',
                color: 'var(--pq-on-accent-ink)',
                fontFamily: 'var(--pq-mono)', fontSize: 'var(--pq-size-body)',
                fontWeight: 600, letterSpacing: '.04em',
                transition: 'opacity var(--pq-t-paint)',
              }}
            >
              {loading ? 'PLEASE WAIT…' : (mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT')}
            </button>
          </form>

          <button
            onClick={onSkip}
            style={{
              display: 'block', width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 16,
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center',
              color: 'var(--pq-text-3)',
              fontFamily: 'var(--pq-mono)', fontSize: 11, fontWeight: 500,
              letterSpacing: 'var(--pq-track-chip)',
            }}
          >
            CONTINUE WITHOUT AN ACCOUNT →
          </button>
        </Card>
      </div>
    </div>
  )
}
