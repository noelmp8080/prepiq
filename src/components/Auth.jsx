import { useState } from 'react'
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
    width: '100%', padding: '14px 16px', borderRadius: '14px',
    border: '1.5px solid var(--border-c)', outline: 'none',
    fontSize: '15px', color: 'var(--ink)', background: 'var(--surface2)',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Gradient header */}
      <div style={{ background: 'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding: '56px 24px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
          🥗
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-.05em', margin: 0 }}>PrepIQ</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500, margin: 0 }}>Smart meal prep, tracked.</p>
      </div>

      {/* Card */}
      <div style={{ flex: 1, padding: '0 20px 32px', marginTop: '-24px', position: 'relative', zIndex: 10 }}>
        <div style={{ background: 'var(--card)', borderRadius: '24px', padding: '28px 24px', boxShadow: '0 4px 32px rgba(79,63,212,0.13)' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '14px', padding: '4px', marginBottom: '24px' }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '10px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif',
                background: mode === m ? 'var(--card)' : 'transparent',
                color:      mode === m ? '#4F3FD4'     : 'var(--ink4)',
                boxShadow:  mode === m ? '0 1px 6px rgba(79,63,212,0.12)' : 'none',
                transition: 'all .15s',
              }}>
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
            />

            {error && (
              <div style={{ fontSize: '12px', color: '#C53030', fontWeight: 500, padding: '10px 14px', background: 'rgba(197,48,48,0.07)', borderRadius: '10px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '15px', borderRadius: '16px', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif',
                background: loading ? '#C4B5FD' : '#4F3FD4', color: '#fff',
                boxShadow: '0 4px 16px rgba(79,63,212,0.35)', marginTop: '4px',
                transition: 'opacity .15s',
              }}
            >
              {loading ? 'Please wait…' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <button
            onClick={onSkip}
            style={{
              display: 'block', width: '100%', marginTop: '20px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--ink4)',
              fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'center', padding: '8px 0',
            }}
          >
            Continue without account →
          </button>
        </div>
      </div>
    </div>
  )
}
