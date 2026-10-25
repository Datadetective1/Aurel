import { getOptionalUser, getProfile } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken, createClient } from '@/lib/supabase/server'
import { resolveFace } from '@/lib/conversations/avatars'
import { updateProfile } from '@/app/(app)/settings/actions'
import type {
  MeResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '@/lib/mobile/contracts'

async function signedIn() {
  if (!(await bearerToken())) return null
  return getOptionalUser()
}

/** Who the token belongs to. Answers before onboarding too, so the app can say so. */
export async function GET() {
  const user = await signedIn()
  if (!user) return json({ error: 'unauthenticated' }, 401)
  const profile = await getProfile()
  const photo = profile ? await resolveFace(await createClient(), profile) : null
  const body: MeResponse = {
    id: user.id,
    name: profile?.preferred_name || profile?.full_name || 'You',
    timeZone: profile?.timezone ?? 'UTC',
    onboarded: Boolean(profile?.onboarding_completed_at),
    profile: profile
      ? {
          fullName: profile.full_name ?? '',
          preferredName: profile.preferred_name,
          jobTitle: profile.job_title,
          company: profile.company,
          pronouns: profile.pronouns,
          timezone: profile.timezone,
          photo,
        }
      : undefined,
  }
  return json(body)
}

/** The Account screen's profile form: Settings › Profile on the web, same validation. */
export async function PATCH(request: Request) {
  const user = await signedIn()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const body = await readJson<UpdateProfileRequest>(request)
  if (!body)
    return json<UpdateProfileResponse>({ ok: false, error: 'That request could not be read.' }, 400)

  const form = new FormData()
  form.set('fullName', String(body.fullName ?? ''))
  for (const key of ['preferredName', 'jobTitle', 'company', 'pronouns', 'timezone'] as const) {
    if (body[key]) form.set(key, String(body[key]))
  }
  const result = await updateProfile({}, form)
  if (result.error || result.fieldErrors) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<UpdateProfileResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'Check those details.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 502,
    )
  }
  return json<UpdateProfileResponse>({ ok: true })
}
