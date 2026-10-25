import { getOptionalUser, getProfile } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken, createClient } from '@/lib/supabase/server'
import type { PreferencesResponse, UpdatePreferencesRequest } from '@/lib/mobile/contracts'

/**
 * The two email switches. The digest's delivery hour is not offered: the
 * scheduled send runs once a day whatever it says (finding 3.4, Phase 3).
 */
async function signedIn() {
  if (!(await bearerToken())) return null
  return getOptionalUser()
}

export async function GET() {
  const user = await signedIn()
  if (!user) return json({ error: 'unauthenticated' }, 401)
  const profile = await getProfile()
  const body: PreferencesResponse = {
    emailNotifications: profile?.email_notifications ?? true,
    followThroughEmail: profile?.follow_through_email ?? true,
  }
  return json(body)
}

export async function PATCH(request: Request) {
  const user = await signedIn()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const body = await readJson<UpdatePreferencesRequest>(request)
  const patch: { email_notifications?: boolean; follow_through_email?: boolean } = {}
  if (typeof body?.emailNotifications === 'boolean')
    patch.email_notifications = body.emailNotifications
  if (typeof body?.followThroughEmail === 'boolean')
    patch.follow_through_email = body.followThroughEmail
  if (Object.keys(patch).length === 0) return json({ error: 'Nothing to change.' }, 400)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('email_notifications, follow_through_email')
    .maybeSingle()
  if (error || !data) return json({ error: 'Those preferences could not be saved.' }, 502)

  const result: PreferencesResponse = {
    emailNotifications: data.email_notifications,
    followThroughEmail: data.follow_through_email,
  }
  return json(result)
}
