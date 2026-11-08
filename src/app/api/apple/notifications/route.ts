import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { verifyAppleJws } from '@/lib/billing/apple/jws'
import { processNotification } from '@/lib/billing/apple/process'
import { supabaseAppleStore } from '@/lib/billing/apple/store'

/**
 * APP STORE SERVER NOTIFICATIONS V2
 * =============================================================================
 * Apple POSTs { signedPayload } here for every subscription event: renewals,
 * billing problems and recovery, auto-renew switched off, expiry, refunds.
 * The payload is a JWS Apple signed; nothing is read until it verifies (see
 * lib/billing/apple/jws). lib/billing/apple/process owns the ledger, the
 * ordering and the account binding.
 *
 * Answers: 200 when applied, already applied, or not ours; 409 while another
 * delivery of the same notification is in flight; 500 on our own failure.
 * Apple retries anything that is not 200, so nothing is acknowledged that was
 * not durably handled. Set this URL as both the Production and the Sandbox
 * Server URL in App Store Connect (docs/STOREKIT.md).
 * =============================================================================
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!features.serviceRole) {
    logger.warn('apple.notification_unconfigured')
    return new Response('Not configured.', { status: 503 })
  }

  let signedPayload: unknown
  try {
    signedPayload = ((await request.json()) as { signedPayload?: unknown })?.signedPayload
  } catch {
    return new Response('Bad request.', { status: 400 })
  }

  try {
    const result = await processNotification(signedPayload, {
      store: supabaseAppleStore(),
      verify: (jws) => verifyAppleJws(jws),
    })
    const log = result.httpStatus >= 400 ? logger.warn : logger.info
    log('apple.notification', { outcome: result.outcome, reason: result.reason ?? null })
    return new Response(result.outcome, { status: result.httpStatus })
  } catch (error) {
    logger.error('apple.notification_failed', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    })
    return new Response('Failed.', { status: 500 })
  }
}
