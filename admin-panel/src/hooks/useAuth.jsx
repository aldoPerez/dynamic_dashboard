import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      if (data.session?.user) loadProfile(data.session.user.id)
      else setLoading(false)
    })
    const { data: l } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => l.subscription.unsubscribe()
  }, [])

  async function loadProfile(id) {
    const { data } = await supabase.from('admin_users').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }
  async function signOut() { await supabase.auth.signOut() }

  const canWrite    = ['admin','superadmin'].includes(profile?.role)
  const isSuperAdmin = profile?.role === 'superadmin'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, canWrite, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
