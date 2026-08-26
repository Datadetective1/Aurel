'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ownership } from '@/lib/workspace'
import { calendarProvider } from '@/lib/calendar'
import type { CalendarProviderId } from '@/lib/calendar'
import { decryptSecret } from '@/lib/crypto'
import { MIN_SYNC_INTERVAL_MS, syncCalendar } from '@/lib/calendar/sync'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { brand } from '@/lib/brand'

/**
 * Calendar actions.
 *
 * Read-only throughout: sync pulls, disconnect forgets, prepare materialises an
 * Atturel meeting from an event we already hold. Nothing writes to a provider.
 */

export interface CalendarActionState {
  ok?: boolean
  message?: string
  error?: string
}

/** Pull the next fourteen days. Safe to press repeatedly. */
export async function syncCalendarNow(provider: CalendarProviderId): Promise<CalendarActionState> {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: integration } = await supabase
    .from('integration_accounts')
    .select('id, last_sync_attempt_at')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .maybeSingle()

  if (!integration) return { error: 'That calendar is not connected.' }

  // Our own rate limit, ahead of the provider's. A user leaning on the button
  // should not be the reason a tenant gets throttled.
  const lastAttempt = integration.last_sync_attempt_at
    ? new Date(integration.last_sync_attempt_at).getTime()
    : 0
  if (Date.now() - lastAttempt < MIN_SYNC_INTERVAL_MS) {
    return { ok: true, message: 'Already up to date. Try again in a minute.' }
  }

  const outcome = await syncCalendar(supabase, user.id, integration.id, {
    ownerEmail: user.email ?? null,
  })

  if (!outcome.ok) {
    await track('calendar_sync_failed', { provider, reason: outcome.reason ?? 'error' })
    const message =
      outcome.reason === 'admin_consent_required'
        ? `Your organization requires administrator approval before ${brand.name} can read this calendar.`
        : outcome.reason === 'needs_reconnect'
          ? 'That calendar connection needs attention. Reconnect to keep syncing.'
          : outcome.reason === 'rate_limited'
            ? 'The calendar provider is rate limiting us. Try again shortly.'
            : 'The calendar provider could not be reached. Nothing was changed.'
    return { error: message }
  }

  // Counts only. Never a title, a name or an email.
  await track('calendar_sync_completed', {
    provider,
    imported: outcome.imported,
    updated: outcome.updated,
    cancelled: outcome.cancelled,
  })
  if (outcome.imported > 0) {
    await track('calendar_event_imported', { provider, count: outcome.imported })
  }
  if (outcome.attendeesMatched > 0) {
    await track('calendar_attendee_matched', { count: outcome.attendeesMatched })
  }
  if (outcome.attendeesUnmatched > 0) {
    await track('calendar_attendee_unmatched', { count: outcome.attendeesUnmatched })
  }

  revalidatePath('/today')
  revalidatePath('/settings/capabilities')

  const total = outcome.imported + outcome.updated
  return {
    ok: true,
    message:
      total === 0
        ? 'No new meetings in the next two weeks.'
        : `${total} meeting${total === 1 ? '' : 's'} up to date.`,
  }
}

/**
 * Disconnect.
 *
 * Deletes our copy of the tokens first and asks the provider to revoke second,
 * because the order matters: if revocation fails we must still have forgotten
 * the credentials. Synced events go too — they are a mirror of a calendar we no
 * longer have permission to read, and keeping them would be holding onto
 * someone's schedule after they withdrew access.
 */
export async function disconnectCalendar(
  provider: CalendarProviderId,
): Promise<CalendarActionState> {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: integration } = await supabase
    .from('integration_accounts')
    .select('id, access_token_encrypted, refresh_token_encrypted')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .maybeSingle()

  if (!integration) return { ok: true, message: 'Already disconnected.' }

  const accessToken = decryptSecret(integration.access_token_encrypted)
  const refreshToken = decryptSecret(integration.refresh_token_encrypted)

  await supabase
    .from('external_calendar_events')
    .delete()
    .eq('user_id', user.id)
    .eq('integration_id', integration.id)

  const { error } = await supabase
    .from('integration_accounts')
    .delete()
    .eq('id', integration.id)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('calendar.disconnect_failed', { provider, code: error.code })
    return { error: 'We could not disconnect that calendar. Try again.' }
  }

  // Best effort, and deliberately after the delete.
  if (accessToken) {
    await calendarProvider(provider).revoke({ refreshToken, accessToken })
  }

  await track('calendar_disconnected', { provider })
  revalidatePath('/today')
  revalidatePath('/settings/capabilities')
  return { ok: true, message: 'Calendar disconnected.' }
}

/**
 * Turn a synced event into an Atturel meeting and open Prepare.
 *
 * Idempotent by the link already on the row: pressing Prepare twice opens the
 * same meeting rather than making a second one. Attendees that matched a Person
 * are attached; unmatched ones are deliberately not invented as People — that
 * stays a decision for the user.
 */
export async function prepareFromEvent(eventId: string): Promise<never | CalendarActionState> {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()
  const own = await ownership()

  const { data: event } = await supabase
    .from('external_calendar_events')
    .select('id, title, starts_at, ends_at, meeting_id, attendees, is_private, status')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!event) return { error: 'That meeting could not be found.' }

  if (event.meeting_id) {
    await track('calendar_prepare_started', { existing: true })
    redirect(`/meetings/${event.meeting_id}/brief`)
  }

  const durationMinutes =
    event.ends_at && event.starts_at
      ? Math.max(
          5,
          Math.round(
            (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60_000,
          ),
        )
      : null

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      ...own,
      // A private event keeps its time and its people, never its subject.
      title: event.title ?? 'Meeting',
      scheduled_at: event.starts_at,
      duration_minutes: durationMinutes,
      external_event_id: event.id,
      external_provider: 'calendar',
    })
    .select('id')
    .single()

  if (error || !meeting) {
    logger.warn('calendar.meeting_create_failed', { code: error?.code })
    return { error: 'We could not prepare that meeting. Try again.' }
  }

  const attendees = (event.attendees ?? []) as { personId?: string | null }[]
  const personIds = [...new Set(attendees.map((a) => a.personId).filter(Boolean))] as string[]

  if (personIds.length > 0) {
    await supabase.from('meeting_attendees').insert(
      personIds.map((personId) => ({
        ...own,
        meeting_id: meeting.id,
        person_id: personId,
      })),
    )
  }

  await supabase
    .from('external_calendar_events')
    .update({ meeting_id: meeting.id })
    .eq('id', event.id)
    .eq('user_id', user.id)

  await track('calendar_prepare_started', {
    existing: false,
    attendeesAttached: personIds.length,
  })

  revalidatePath('/today')
  redirect(`/meetings/${meeting.id}/brief`)
}
