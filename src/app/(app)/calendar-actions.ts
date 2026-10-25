'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { checkCapability } from '@/lib/billing/entitlements'
import { ownership } from '@/lib/workspace'
import { calendarProvider } from '@/lib/calendar'
import type { CalendarProviderId } from '@/lib/calendar'
import { decryptSecret } from '@/lib/crypto'
import {
  claimSyncAttempt,
  syncCalendar,
  type PreviousAttempt,
  type SyncOutcome,
} from '@/lib/calendar/sync'
import type { CalendarSyncCode } from '@/lib/calendar/freshness'
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
  /** What Sync now came to, for the iPhone's route to answer with. */
  code?: CalendarSyncCode
}

/**
 * Inside the one-minute limit: say how the attempt holding it went, rather
 * than "already up to date" after one that failed.
 */
const RECENT: Record<PreviousAttempt, CalendarActionState> = {
  succeeded: {
    ok: true,
    code: 'recently_synced',
    message: 'Synced moments ago. Try again in a minute.',
  },
  failed: {
    code: 'recently_failed',
    error: 'The last attempt, moments ago, did not complete. Try again in a minute.',
  },
  in_progress: {
    ok: true,
    code: 'in_progress',
    message: 'A sync is already running. Check back in a moment.',
  },
  unknown: { code: 'error', error: 'The sync could not start. Try again in a minute.' },
}

/** Pull the next fourteen days. Safe to press repeatedly, from any device. */
export async function syncCalendarNow(provider: CalendarProviderId): Promise<CalendarActionState> {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: integration } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .maybeSingle()

  if (!integration) return { code: 'not_connected', error: 'That calendar is not connected.' }

  const capability = await checkCapability('calendarIntegration')
  if (!capability.allowed) return { code: 'plan_required', error: capability.message }

  // Our own rate limit, ahead of the provider's: one attempt a minute for each
  // connection, whether pressed on the website or the iPhone. A user leaning
  // on the button should not be the reason a tenant gets throttled.
  const claim = await claimSyncAttempt(supabase, integration.id)
  if (!claim.claimed) return RECENT[claim.previous]

  const outcome = await syncCalendar(supabase, user.id, integration.id, {
    ownerEmail: user.email ?? null,
  })

  if (!outcome.ok) {
    await track('calendar_sync_failed', { provider, reason: outcome.reason ?? 'error' })
    return failedSync(outcome.reason)
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
    code: 'synced',
    message:
      total === 0
        ? 'No new meetings in the next two weeks.'
        : `${total} meeting${total === 1 ? '' : 's'} up to date.`,
  }
}

/**
 * Only a grant the provider refused asks for a reconnect. Everything else
 * left the connection as it was and is worth trying again.
 */
function failedSync(reason: SyncOutcome['reason']): CalendarActionState {
  switch (reason) {
    case 'not_connected':
      return { code: 'not_connected', error: 'That calendar is not connected.' }
    case 'admin_consent_required':
      return {
        code: 'admin_consent_required',
        error: `Your organization requires administrator approval before ${brand.name} can read this calendar.`,
      }
    case 'needs_reconnect':
      return {
        code: 'needs_reconnect',
        error: 'Your calendar no longer accepts this connection. Reconnect to keep syncing.',
      }
    case 'rate_limited':
      return {
        code: 'rate_limited',
        error: 'The calendar provider is busy. Nothing was changed. Try again in a few minutes.',
      }
    case 'unavailable':
      return {
        code: 'unavailable',
        error:
          'The calendar provider could not be reached. Nothing was changed. Try again shortly.',
      }
    default:
      return {
        code: 'error',
        error: 'The sync did not complete. Nothing was changed. Try again shortly.',
      }
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
 *
 * Works in every state, plan or no plan: a connection that expired or failed
 * must still be removable without reconnecting it first (finding 8.6).
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
