
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'

function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()

      if (mounted) {
        if (error) {
          console.error('Session error:', error.message)
        }

        setSession(data?.session ?? null)
        setLoading(false)
      }
    }

    checkSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
  }

  if (loading) return <p>Loading...</p>

  if (!session) return <Auth />

  return (
    <>
      <div style={{ textAlign: 'right', padding: '10px 5%' }}>
        <button onClick={logout}>Logout</button>
      </div>
      {children}
    </>
  )
}

export default AuthGate
