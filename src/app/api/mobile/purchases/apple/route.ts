import { getOptionalUser } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken } from '@/lib/supabase/server'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { verifyAppleJws } from '@/lib/billing/apple/jws'
import { verifyPurchase } from '@/lib/billing/apple/process'
import { supabaseAppleStore } from '@/lib/billing/apple/store'
import type { ApplePurchaseRequest, ApplePurchaseResponse } from '@/lib/mobile/contracts'

/**
 * POST /api/mobile/purchases/apple
 *
 * The app sends the transaction StoreKit 2 returned (its JWS, signed by
 * Apple) right after a purchase or a restore. This verifies Apple's
 * signature, checks the transaction is Atturel's and is this account's, and
 * records it. The app finishes the transaction ONLY after a 200: until then
 * StoreKit keeps offering it on every launch, so a failure here is retried,
 * never lost.
 *
 * Bearer only, and not behind the onboarding gate: someone who paid must
 * always be able to have the payment recognised.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await bearerToken())) return json({ error: 'unauthenticated' }, 401)
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)
  if (!features.serviceRole) {
    logger.warn('apple.purchase_unconfigured')
    return json({ error: 'unavailable', code: 'unavailable' }, 503)
  }

  const body = await readJson<ApplePurchaseRequest>(request)
  try {
    const result = await verifyPurchase(
      { userId: user.id, signedTransaction: body?.signedTransaction },
      { store: supabaseAppleStore(), verify: (jws) => verifyAppleJws(jws) },
    )
    if (!result.ok) {
      logger.warn('apple.purchase_refused', { code: result.code })
      const response: ApplePurchaseResponse = { ok: false, code: result.code }
      return json(response, result.httpStatus)
    }
    logger.info('apple.purchase_recorded', { status: result.status })
    const response: ApplePurchaseResponse = {
      ok: true,
      status: result.status,
      expiresAt: result.expiresAt,
    }
    return json(response)
  } catch (error) {
    logger.error('apple.purchase_failed', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    })
    return json({ ok: false, code: 'busy' } satisfies ApplePurchaseResponse, 500)
  }
}
