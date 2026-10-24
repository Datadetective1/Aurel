import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { redeemInvitation } from '@/app/(app)/settings/access-actions'
import type { RedeemAccessRequest, RedeemAccessResponse } from '@/lib/mobile/contracts'

/**
 * Redeem a pilot invitation from the phone -- the web's Settings › Access
 * action, unchanged. The code is hashed before it reaches the database, and
 * the database function can only ever grant 'pilot'. Nothing is bought.
 */
export async function POST(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<RedeemAccessRequest>(request)
  const form = new FormData()
  form.set('code', String(body?.code ?? ''))

  const result = await redeemInvitation({}, form)
  if (!result.ok) {
    return json<RedeemAccessResponse>(
      { ok: false, error: result.error ?? 'That code could not be redeemed.' },
      400,
    )
  }
  return json<RedeemAccessResponse>({ ok: true, message: result.message ?? 'Full access is on.' })
}
