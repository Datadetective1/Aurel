import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { bearerToken, createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type Profile = Database['public']['Tables']['profiles']['Row']

/**
 * Authorization helpers.
 *
 * Every page, server action and route handler that touches user data calls one
 * of these first. Middleware already gates routes, but middleware can be
 * bypassed by any direct invocation of a server action — so authorization is
 * re-established here, at the point of use, every time.
 *
 * getUser() (not getSession()) is used throughout: it revalidates the JWT with
 * the auth server rather than trusting the cookie.
 */

/**
 * The authenticated user, or null.
 * Cached per-request so a page that checks auth in several places pays for one
 * round trip rather than five.
 */
export const getOptionalUser = cache(async () => {
  const supabase = await createClient()
  // On a bearer route the session is the token itself, verified here against
  // the auth server exactly as a cookie session is.
  const token = await bearerToken()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token ?? undefined)
  if (error || !user) return null
  return user
})

/** The authenticated user, or a redirect to sign-in. */
export async function requireUser() {
  const user = await getOptionalUser()
  if (!user) redirect('/sign-in')
  return user
}

/** The authenticated user's profile, creating nothing — the signup trigger owns that. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getOptionalUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return data
})

/**
 * Guard for the signed-in app: requires a user AND a completed onboarding.
 * Sends half-onboarded users back to where they left off instead of dropping
 * them into an app with no profile.
 */
export async function requireOnboardedUser() {
  const user = await requireUser()
  const profile = await getProfile()

  if (!profile?.onboarding_completed_at) {
    redirect('/onboarding')
  }

  return { user, profile }
}

export { safeRedirectPath } from './safe-redirect'
