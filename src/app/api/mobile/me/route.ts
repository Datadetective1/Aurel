import { getOptionalUser, getProfile } from '@/lib/auth'
import { json } from '@/lib/mobile/route'
import type { MeResponse } from '@/lib/mobile/contracts'

/** Who the token belongs to. Answers before onboarding too, so the app can say so. */
export async function GET() {
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)
  const profile = await getProfile()
  const body: MeResponse = {
    id: user.id,
    name: profile?.preferred_name || profile?.full_name || 'You',
    timeZone: profile?.timezone ?? 'UTC',
    onboarded: Boolean(profile?.onboarding_completed_at),
  }
  return json(body)
}
