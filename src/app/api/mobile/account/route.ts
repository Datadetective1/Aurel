import { getOptionalUser, getProfile } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken } from '@/lib/supabase/server'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import { PLANS } from '@/lib/billing/plans'
import { hasFullAccess } from '@/lib/billing/access'
import { deleteCurrentAccount } from '@/lib/account/deletion.server'
import { mobileCaptureLimits } from '@/lib/capture/limits'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import type {
  AccountResponse,
  DeleteAccountRequest,
  DeleteAccountResponse,
} from '@/lib/mobile/contracts'

/**
 * The app's Account screen: who is signed in, the plan and where it is
 * managed, the legal pages, and deletion.
 *
 * Bearer only, and deliberately NOT behind the onboarding gate the other
 * mobile routes use: someone who signed up in the app and never finished
 * onboarding must still be able to delete their account from inside it.
 */
async function context() {
  if (!(await bearerToken())) return null
  return getOptionalUser()
}

export async function GET() {
  const user = await context()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const [profile, entitlements] = await Promise.all([getProfile(), getEntitlements()])
  const paid = entitlements.plan !== 'free'
  const limit = entitlements.quotas.transcription_seconds
  const remainingSeconds =
    limit === null || limit === undefined
      ? null
      : Math.max(
          0,
          limit - (await usageInPeriod('transcription_seconds', entitlements.periodStart)),
        )

  const body: AccountResponse = {
    email: user.email ?? null,
    name: profile?.preferred_name || profile?.full_name || 'You',
    planLabel: paid
      ? PLANS[entitlements.plan].name
      : hasFullAccess(entitlements.tier)
        ? 'Full access'
        : PLANS.free.name,
    billing:
      entitlements.provider === 'apple'
        ? 'apple'
        : entitlements.provider === 'stripe'
          ? 'web'
          : entitlements.provider === 'manual'
            ? 'included'
            : 'none',
    legal: {
      privacyUrl: absoluteUrl('/privacy'),
      termsUrl: absoluteUrl('/terms'),
      supportEmail: brand.email.support,
    },
    capture: { ...mobileCaptureLimits(features.captureStorage), remainingSeconds },
    sampleData: { loaded: Boolean(profile?.demo_seeded_at) },
  }
  return json(body)
}

export async function DELETE(request: Request) {
  const user = await context()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const body = await readJson<DeleteAccountRequest>(request)
  if (
    !body ||
    String(body.confirmation ?? '')
      .trim()
      .toLowerCase() !== 'delete'
  ) {
    const response: DeleteAccountResponse = {
      deleted: false,
      stage: 'confirmation',
      error: 'Type DELETE to confirm.',
    }
    return json(response, 400)
  }

  const result = await deleteCurrentAccount({
    via: 'ios',
    appleAcknowledged: body.appleAcknowledged === true,
  })
  if (!result.ok) {
    const response: DeleteAccountResponse = {
      deleted: false,
      stage: result.stage,
      error: result.message,
    }
    return json(response, result.stage === 'apple_acknowledgement' ? 409 : 502)
  }

  const response: DeleteAccountResponse = { deleted: true }
  return json(response)
}
