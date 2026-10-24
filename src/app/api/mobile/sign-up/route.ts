import { json, readJson } from '@/lib/mobile/route'
import { signUpCore } from '@/app/(auth)/actions'
import type { SignUpRequest, SignUpResponse } from '@/lib/mobile/contracts'

/**
 * Create an account from the phone. No bearer token -- there is no account
 * yet -- and the same action as the web form: the same validation, the same
 * welcome email, the same confirmation link, and the same answer whether or
 * not the address already has an account, so this cannot be used to find out.
 *
 * The confirmation link opens the website, which finishes the sign-up; the
 * person then signs in on the phone.
 */
export async function POST(request: Request) {
  const body = await readJson<SignUpRequest>(request)
  if (!body)
    return json<SignUpResponse>({ ok: false, error: 'That request could not be read.' }, 400)

  const form = new FormData()
  form.set('fullName', String(body.fullName ?? ''))
  form.set('email', String(body.email ?? ''))
  form.set('password', String(body.password ?? ''))

  const result = await signUpCore(form)
  if (!result.ok) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<SignUpResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'We could not create that account.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 422,
    )
  }
  return json<SignUpResponse>({ ok: true, needsConfirmation: result.needsConfirmation }, 201)
}
