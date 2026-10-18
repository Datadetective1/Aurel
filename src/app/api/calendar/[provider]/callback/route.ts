import { NextResponse, type NextRequest } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { checkCapability } from '@/lib/billing/entitlements'
import { createClient } from '@/lib/supabase/server'
import { calendarProvider, CALENDAR_PROVIDERS } from '@/lib/calendar'
import type { CalendarProviderId } from '@/lib/calendar'
import { encryptSecret } from '@/lib/crypto'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { absoluteUrl } from '@/lib/brand'
import { syncCalendar } from '@/lib/calendar/sync'
import { calendarReturnUrl, parseCalendarReturn } from '@/lib/calendar/return-path'
import { calendarRedirectUri, verifyState } from '../connect/route'

/**
 * Finish the OAuth dance and store the grant.
 *
 * Every outcome lands where the user started -- Today for the activation path,
 * Capabilities otherwise -- with a reason the UI can explain.
 * The one that matters most is `admin_consent_required`: a tenant that disables
 * user consent produces an error the user cannot resolve by trying again, and
 * telling them to retry would be a small cruelty.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params
  const origin = absoluteUrl('').replace(/\/$/, '')

  // Read before anything can fail, so even a refusal returns the user to where
  // they started. The state is verified, not trusted: an unsigned or tampered
  // one yields no payload and the default destination.
  const payload = verifyState(request.nextUrl.searchParams.get('state'))
  const returnTo = parseCalendarReturn(payload?.split(':')[3])
  const settings = (reason: string) => calendarReturnUrl(origin, returnTo, reason)

  if (!CALENDAR_PROVIDERS.includes(raw as CalendarProviderId)) {
    return NextResponse.redirect(settings('unknown_provider'))
  }
  const id = raw as CalendarProviderId

  const { searchParams } = request.nextUrl
  const error = searchParams.get('error')
  const description = searchParams.get('error_description') ?? ''

  if (error) {
    // Entra reports blocked user-consent as an error on the redirect rather
    // than at the token endpoint, so it has to be recognised here too.
    if (/AADSTS65001|AADSTS90094|consent_required|admin/i.test(`${error} ${description}`)) {
      await track('calendar_connect_failed', { provider: id, reason: 'admin_consent_required' })
      return NextResponse.redirect(settings('admin_consent_required'))
    }
    await track('calendar_connect_failed', { provider: id, reason: 'denied' })
    return NextResponse.redirect(settings('denied'))
  }

  const code = searchParams.get('code')

  if (!code || !payload) {
    await track('calendar_connect_failed', { provider: id, reason: 'invalid_callback' })
    return NextResponse.redirect(settings('invalid'))
  }

  const { user } = await requireOnboardedUser()
  const [statedProvider, statedUserId] = payload.split(':')

  // The grant must attach to the account that started the flow. Without this
  // check, a link could bind someone else's calendar to the signed-in user.
  if (statedProvider !== id || statedUserId !== user.id) {
    logger.warn('calendar.state_mismatch', { provider: id })
    await track('calendar_connect_failed', { provider: id, reason: 'state_mismatch' })
    return NextResponse.redirect(settings('invalid'))
  }

  // Checked again here: the consent link outlives the moment it was issued.
  if (!(await checkCapability('calendarIntegration')).allowed) {
    return NextResponse.redirect(`${origin}/settings/billing?upgrade=calendar`)
  }

  const provider = calendarProvider(id)
  const exchanged = await provider.exchangeCode({ code, redirectUri: calendarRedirectUri(id) })

  if (!exchanged.ok) {
    await track('calendar_connect_failed', { provider: id, reason: exchanged.reason })
    return NextResponse.redirect(
      settings(exchanged.reason === 'admin_consent_required' ? 'admin_consent_required' : 'failed'),
    )
  }

  // A grant with no refresh token expires in an hour and never recovers, which
  // would present as a calendar that mysteriously stops. Better to say so now.
  if (!exchanged.value.refreshToken) {
    logger.warn('calendar.no_refresh_token', { provider: id })
    await track('calendar_connect_failed', { provider: id, reason: 'no_refresh_token' })
    return NextResponse.redirect(settings('no_offline_access'))
  }

  const supabase = await createClient()

  // One connection per provider per user. Reconnecting replaces the grant
  // rather than accumulating dead rows beside it.
  const { data: saved, error: saveError } = await supabase
    .from('integration_accounts')
    .upsert(
      {
        user_id: user.id,
        provider: id,
        status: 'connected',
        external_account_email: exchanged.value.accountEmail,
        scopes: exchanged.value.scopes,
        access_token_encrypted: encryptSecret(exchanged.value.accessToken),
        refresh_token_encrypted: encryptSecret(exchanged.value.refreshToken),
        token_expires_at: exchanged.value.expiresAt,
        last_error: null,
        sync_cursor: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single()

  if (saveError || !saved) {
    logger.warn('calendar.save_failed', { provider: id, code: saveError.code })
    await track('calendar_connect_failed', { provider: id, reason: 'persist_failed' })
    return NextResponse.redirect(settings('failed'))
  }

  await track('calendar_connected', { provider: id })

  // The first sync, now. Nothing else pulls events until someone presses "Sync
  // now" in Settings, so without this a newly connected calendar showed no
  // meetings anywhere -- and the person who had just granted access was left to
  // wonder whether it had worked. Failure here is not failure to connect: the
  // grant is stored, and the next sync will retry.
  try {
    const outcome = await syncCalendar(supabase, user.id, saved.id, {
      ownerEmail: user.email ?? null,
    })
    if (outcome.ok) {
      await track('calendar_sync_completed', {
        provider: id,
        imported: outcome.imported,
        updated: outcome.updated,
        cancelled: outcome.cancelled,
      })
    } else {
      await track('calendar_sync_failed', { provider: id, reason: outcome.reason ?? 'error' })
    }
  } catch (error) {
    logger.warn('calendar.initial_sync_failed', {
      provider: id,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  return NextResponse.redirect(settings('connected'))
}
