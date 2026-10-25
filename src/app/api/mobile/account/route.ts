import { getOptionalUser, getProfile } from '@/lib/auth'
import { json, readJson } from '@/lib/mobile/route'
import { bearerToken, createClient } from '@/lib/supabase/server'
import { getEntitlements, usageInPeriod } from '@/lib/billing/entitlements'
import { hasFullAccess } from '@/lib/billing/access'
import { planSummary } from '@/lib/billing/plan-summary'
import { deleteCurrentAccount } from '@/lib/account/deletion.server'
import { mobileCaptureLimits } from '@/lib/capture/limits'
import { absoluteUrl, brand } from '@/lib/brand'
import { features } from '@/lib/env'
import { CALENDAR_COLUMNS, mobileCalendarConnection } from '@/lib/mobile/calendar'
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

  const [profile, entitlements, { data: calendars }] = await Promise.all([
    getProfile(),
    getEntitlements(),
    // Read-only status; never the tokens.
    (await createClient())
      .from('integration_accounts')
      .select(CALENDAR_COLUMNS)
      .eq('user_id', user.id),
  ])
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
    // The same words as the website's Plan page; plan and access only, no
    // purchase or payment link (owner decision 3).
    planLabel: planSummary({
      plan: entitlements.plan,
      fullAccess: hasFullAccess(entitlements.tier),
      trial: entitlements.trial ?? null,
      subscription: null,
      trialOffered: false,
      canSubscribe: false,
      timeZone: profile?.timezone ?? 'UTC',
    }).shortLabel,
    billing:
      entitlements.provider === 'apple'
        ? 'apple'
        : entitlements.provider === 'stripe'
          ? 'web'
          : entitlements.provider === 'trial'
            ? 'trial'
            : entitlements.provider === 'manual'
              ? 'included'
              : 'none',
    trial: entitlements.trial ?? null,
    legal: {
      privacyUrl: absoluteUrl('/privacy'),
      termsUrl: absoluteUrl('/terms'),
      supportEmail: brand.email.support,
    },
    capture: { ...mobileCaptureLimits(features.captureStorage), remainingSeconds },
    sampleData: { loaded: Boolean(profile?.demo_seeded_at) },
    calendar: {
      connections: (calendars ?? []).map((row) =>
        mobileCalendarConnection(row, {
          planAllows: entitlements.capabilities.calendarIntegration,
          timeZone: profile?.timezone ?? 'UTC',
        }),
      ),
      manageUrl: absoluteUrl('/settings/capabilities'),
    },
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
