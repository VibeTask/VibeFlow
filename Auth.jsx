import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account, then sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#fdfdfc', color: '#1a1a1a',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, button { font-family: 'IBM Plex Sans', -apple-system, sans-serif; }
      `}</style>

      <div style={{ width: 320, padding: '0 20px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>
          TaskFlow
        </h1>
        <p style={{ fontSize: 13.5, color: '#b0aca6', marginBottom: 32 }}>
          {isSignUp ? 'Create an account' : 'Sign in to continue'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email"
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 8,
              border: '1px solid #e0ddd8', fontSize: 14, outline: 'none',
              background: '#fff', marginBottom: 10,
            }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required minLength={6}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 8,
              border: '1px solid #e0ddd8', fontSize: 14, outline: 'none',
              background: '#fff', marginBottom: 16,
            }}
          />

          {error && (
            <p style={{ fontSize: 12.5, color: '#c4453a', marginBottom: 12 }}>{error}</p>
          )}
          {message && (
            <p style={{ fontSize: 12.5, color: '#5a8a50', marginBottom: 12 }}>{message}</p>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: '#1a1a1a', color: '#fdfdfc', fontSize: 14, fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
              marginBottom: 16,
            }}>
            {loading ? '...' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: '#b0aca6', fontSize: 13, cursor: 'pointer',
          }}>
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  )
}
