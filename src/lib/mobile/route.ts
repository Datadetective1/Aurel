import 'server-only'
import type { User } from '@supabase/supabase-js'
import { getOptionalUser, getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type Profile = Database['public']['Tables']['profiles']['Row']

/**
 * The shared front door of every `/api/mobile/*` handler: a verified user, a
 * completed onboarding, JSON out, nothing cached. A request without a valid
 * bearer token gets a 401 JSON body -- never the redirect to /sign-in that a
 * page would issue, which a native client cannot follow usefully.
 */

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export async function mobileContext(): Promise<
  | {
      ok: true
      user: User
      profile: Profile
      supabase: Awaited<ReturnType<typeof createClient>>
      timeZone: string
    }
  | { ok: false; response: Response }
> {
  const user = await getOptionalUser()
  if (!user) return { ok: false, response: json({ error: 'unauthenticated' }, 401) }
  const profile = await getProfile()
  if (!profile) return { ok: false, response: json({ error: 'unauthenticated' }, 401) }
  if (!profile.onboarding_completed_at) {
    return { ok: false, response: json({ error: 'onboarding_required' }, 403) }
  }
  const supabase = await createClient()
  return { ok: true, user, profile, supabase, timeZone: profile.timezone ?? 'UTC' }
}

/** Read a JSON body, or null when it is not JSON. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
