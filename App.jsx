import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'
import TaskFlow from './TaskFlow.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Sans', sans-serif", color: '#b0aca6' }}>
      Loading...
    </div>
  )

  if (!session) return <Auth />

  return <TaskFlow session={session} />
}
