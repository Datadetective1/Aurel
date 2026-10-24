import { getOptionalUser } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken } from '@/lib/supabase/server'
import { saveAboutCore } from '@/app/onboarding/actions'
import type { OnboardingRequest, OnboardingResponse } from '@/lib/mobile/contracts'

/**
 * The one required onboarding step, from the phone: who you are and your time
 * zone. The same action as the web's "About you" step, so it ends onboarding
 * the same way. Everything after it -- goals, the Interaction Profile -- is
 * optional tailoring that stays on the web.
 *
 * Bearer only, and not behind the onboarding gate the other routes use: this
 * is the route that lifts it.
 */
export async function POST(request: Request) {
  if (!(await bearerToken())) return json({ error: 'unauthenticated' }, 401)
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const body = await readJson<OnboardingRequest>(request)
  if (!body) {
    return json<OnboardingResponse>({ ok: false, error: 'That request could not be read.' }, 400)
  }

  const form = new FormData()
  form.set('fullName', String(body.fullName ?? ''))
  form.set('preferredName', String(body.preferredName ?? ''))
  form.set('jobTitle', String(body.jobTitle ?? ''))
  form.set('company', String(body.company ?? ''))
  form.set('timezone', String(body.timezone ?? ''))
  // The web form always sends these, empty when unanswered; the schema reads
  // an absent field as null and refuses it. The phone does not ask them.
  for (const field of ['jobFunction', 'seniority', 'pronouns']) form.set(field, '')

  const result = await saveAboutCore(form)
  if (!result.ok) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<OnboardingResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'We could not save that.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 502,
    )
  }
  return json<OnboardingResponse>({ ok: true })
}
