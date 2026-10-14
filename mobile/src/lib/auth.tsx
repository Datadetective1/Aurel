import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { config } from './config'

/**
 * One identity system: the web's Supabase auth. The app signs in with the
 * same email and password, holds the session in the Keychain, and hands the
 * access token to Atturel's routes. There is no separate mobile account.
 */

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; session: Session | null }

const AuthContext = React.createContext<{
  state: AuthState
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}>({
  state: { status: 'loading' },
  signIn: async () => null,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(
    config.previewData ? { status: 'signed_in', session: null } : { status: 'loading' },
  )

  React.useEffect(() => {
    if (config.previewData) return
    void supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: 'signed_in', session: data.session } : { status: 'signed_out' })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out' })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = React.useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) return null
    // Supabase's wording is technical; say what the person can do about it.
    if (/invalid login/i.test(error.message)) return 'That email and password do not match an account.'
    if (/email not confirmed/i.test(error.message)) return 'Confirm your email first — the link is in your inbox.'
    if (/network|fetch/i.test(error.message)) return 'You appear to be offline.'
    return 'Sign-in did not work. Try again.'
  }, [])

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return <AuthContext.Provider value={{ state, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return React.useContext(AuthContext)
}
