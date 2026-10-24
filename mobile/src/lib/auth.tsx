import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import type { MeResponse } from '@atturel/web/lib/mobile/contracts'
import { supabase } from './supabase'
import { config } from './config'
import { api, ApiError } from './api'

/**
 * One identity system: the web's Supabase auth. The app signs in with the
 * same email and password, holds the session in the Keychain, and hands the
 * access token to Atturel's routes. There is no separate mobile account.
 *
 * After sign-in the app asks who the token belongs to (`/api/mobile/me`), so
 * an account that has not finished its one onboarding step is taken there
 * first instead of into screens that would only say "not set up yet".
 */

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | {
      status: 'signed_in'
      session: Session | null
      /** False only when the server said so; unknown (offline) counts as done. */
      onboarded: boolean
      /** The name given at sign-up, to start onboarding with. */
      suggestedName: string
    }

const AuthContext = React.createContext<{
  state: AuthState
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** Ask the server again whether onboarding is done. */
  refreshProfile: () => Promise<void>
}>({
  state: { status: 'loading' },
  signIn: async () => null,
  signOut: async () => {},
  refreshProfile: async () => {},
})

async function fetchOnboarded(): Promise<boolean> {
  try {
    const me = await api.get<MeResponse>('/api/mobile/me')
    return me.onboarded
  } catch (e) {
    // Offline or a server error is not "not onboarded": let the screens say
    // what is wrong. Only the server's own answer sends someone to setup.
    return !(e instanceof ApiError && e.failure.kind === 'onboarding_required')
  }
}

function nameFrom(session: Session | null): string {
  const meta = session?.user?.user_metadata as { full_name?: unknown } | undefined
  return typeof meta?.full_name === 'string' ? meta.full_name : ''
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(
    config.previewData ? { status: 'signed_in', session: null, onboarded: true, suggestedName: 'Amary' } : { status: 'loading' },
  )

  const settle = React.useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ status: 'signed_out' })
      return
    }
    const onboarded = await fetchOnboarded()
    setState({ status: 'signed_in', session, onboarded, suggestedName: nameFrom(session) })
  }, [])

  React.useEffect(() => {
    if (config.previewData) return
    void supabase.auth.getSession().then(({ data }) => settle(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // A token refresh is the same person; only a change of person re-asks.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return
      void settle(session)
    })
    return () => data.subscription.unsubscribe()
  }, [settle])

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

  const refreshProfile = React.useCallback(async () => {
    if (config.previewData) return
    const { data } = await supabase.auth.getSession()
    await settle(data.session)
  }, [settle])

  return (
    <AuthContext.Provider value={{ state, signIn, signOut, refreshProfile }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return React.useContext(AuthContext)
}
