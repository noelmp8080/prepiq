import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

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
      const msg = err.code === 'auth/invalid-credential'    ? 'Incorrect email or password.'
                : err.code === 'auth/email-already-in-use'  ? 'Email already in use.'
                : err.code === 'auth/weak-password'          ? 'Password must be at least 6 characters.'
                : err.code === 'auth/invalid-email'          ? 'Invalid email address.'
                : err.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: '14px',
    border: '1.5px solid rgba(79,63,212,0.15)', outline: 'none',
    fontSize: '15px', color: '#1A1626', background: '#F8F7FD',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0EEF8', display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ background: '#fff', borderRadius: '24px', padding: '28px 24px', boxShadow: '0 4px 32px rgba(79,63,212,0.13)' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#F0EEF8', borderRadius: '14px', padding: '4px', marginBottom: '24px' }}>
            {['signin','signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '10px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif',
                background: mode === m ? '#fff' : 'transparent',
                color:      mode === m ? '#4F3FD4' : '#B4ADCA',
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
              <p style={{ fontSize: '13px', color: '#E53E3E', fontWeight: 500, margin: '0 0 4px', padding: '10px 14px', background: 'rgba(229,62,62,0.07)', borderRadius: '10px' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '15px', borderRadius: '16px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
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
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#B4ADCA',
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
