import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { logger } from '@/lib/logger'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { calendarProvider } from './index'
import type { CalendarProviderId, NormalizedAttendee, NormalizedEvent } from './provider'

type Client = SupabaseClient<Database>

/**
 * CALENDAR SYNC
 * =============================================================================
 * Read-only, idempotent, and bounded.
 *
 * Idempotence is enforced by a unique index on (integration_id, external_id),
 * not by this code remembering to check — so a double-click, a retry and a
 * concurrent cron all converge on one row rather than three meetings.
 *
 * The horizon is fourteen days. Preparation is a this-fortnight activity, and a
 * wider window costs provider quota to import events nobody will open.
 *
 * Nothing here writes to the provider. There is no code path from this file to
 * a mutation, and the provider interface offers none.
 * =============================================================================
 */

export const SYNC_HORIZON_DAYS = 14

/** Do not re-poll a provider more often than this on manual sync. */
export const MIN_SYNC_INTERVAL_MS = 60_000

export interface SyncOutcome {
  ok: boolean
  imported: number
  updated: number
  cancelled: number
  attendeesMatched: number
  attendeesUnmatched: number
  reason?: 'not_connected' | 'needs_reconnect' | 'admin_consent_required' | 'rate_limited' | 'unavailable' | 'error'
}

interface IntegrationRow {
  id: string
  provider: CalendarProviderId
  status: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  calendar_id: string | null
  sync_cursor: string | null
}

/**
 * A usable access token, refreshing when the stored one is spent.
 *
 * Refreshed sixty seconds early: a token that expires mid-request is a failure
 * the user sees, and a minute of slack costs nothing.
 *
 * Returns null when the grant is gone. The caller marks the connection as
 * needing attention rather than retrying — a revoked grant does not recover.
 */
async function usableAccessToken(
  supabase: Client,
  integration: IntegrationRow,
): Promise<{ token: string } | { token: null; reason: SyncOutcome['reason'] }> {
  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : 0
  const stillValid = expiresAt > Date.now() + 60_000

  if (stillValid) {
    const token = decryptSecret(integration.access_token_encrypted)
    if (token) return { token }
    // Decryption failed on a token that should be valid, which means the
    // encryption key changed. Reconnecting is the only remedy.
    return { token: null, reason: 'needs_reconnect' }
  }

  const refreshToken = decryptSecret(integration.refresh_token_encrypted)
  if (!refreshToken) return { token: null, reason: 'needs_reconnect' }

  const provider = calendarProvider(integration.provider)
  const refreshed = await provider.refresh({ refreshToken })

  if (!refreshed.ok) {
    const reason =
      refreshed.reason === 'admin_consent_required'
        ? 'admin_consent_required'
        : refreshed.reason === 'unavailable' || refreshed.reason === 'rate_limited'
          ? refreshed.reason
          : 'needs_reconnect'
    return { token: null, reason }
  }

  await supabase
    .from('integration_accounts')
    .update({
      access_token_encrypted: encryptSecret(refreshed.value.accessToken),
      // Providers do not always re-issue a refresh token. Overwriting with
      // undefined would throw away a working one.
      ...(refreshed.value.refreshToken
        ? { refresh_token_encrypted: encryptSecret(refreshed.value.refreshToken) }
        : {}),
      token_expires_at: refreshed.value.expiresAt,
      status: 'connected',
      last_error: null,
    })
    .eq('id', integration.id)

  return { token: refreshed.value.accessToken }
}

/**
 * Attendees that could be a Person: real humans, excluding the account owner.
 *
 * Rooms and equipment are filtered at normalization. The owner is filtered here
 * because "who is in the room" means the other people — putting the user into
 * their own relationship graph would be strange and would match nothing.
 */
export function candidateAttendees(
  attendees: NormalizedAttendee[],
  ownerEmail: string | null,
): NormalizedAttendee[] {
  const owner = ownerEmail?.toLowerCase() ?? null
  return attendees.filter(
    (a) => !a.isResource && a.email !== null && (owner === null || a.email !== owner),
  )
}

/**
 * Match attendees to existing People. Never creates one.
 *
 * Email is the only join used, and it is exact. A name match would be a guess,
 * and guessing wrong here means attributing someone's relationship history to a
 * stranger who happens to share their name — the exact failure identity
 * resolution exists to prevent. An attendee with no match stays unmatched and
 * the UI offers to add them, which is a decision for the user.
 */
export async function matchAttendees(
  supabase: Client,
  userId: string,
  attendees: NormalizedAttendee[],
): Promise<Map<string, string>> {
  const emails = attendees.map((a) => a.email).filter((e): e is string => Boolean(e))
  if (emails.length === 0) return new Map()

  const { data } = await supabase
    .from('people')
    .select('id, email')
    .eq('user_id', userId)
    .is('archived_at', null)
    .in('email', emails)

  const matches = new Map<string, string>()
  for (const person of data ?? []) {
    if (person.email) matches.set(person.email.toLowerCase(), person.id)
  }
  return matches
}

/** Equal moments, whatever text each side used to express them. */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const left = new Date(a).getTime()
  const right = new Date(b).getTime()
  return !Number.isNaN(left) && !Number.isNaN(right) && left === right
}

/**
 * Whether the stored attendee-to-Person resolution still matches the one we
 * just computed. Email plus personId only -- a display name changing in
 * somebody's address book is not a reason to rewrite the row.
 */
function sameMatches(stored: unknown, computed: { email: string | null; personId: string | null }[]): boolean {
  if (!Array.isArray(stored)) return false
  if (stored.length !== computed.length) return false

  const key = (a: { email: string | null; personId: string | null }) => `${a.email ?? ''}:${a.personId ?? ''}`
  const before = new Set(
    (stored as { email?: string | null; personId?: string | null }[]).map((a) =>
      key({ email: a.email ?? null, personId: a.personId ?? null }),
    ),
  )
  return computed.every((a) => before.has(key(a)))
}

/**
 * Persist one normalized event.
 *
 * Upsert on the unique index, so the second sync of an unchanged event is a
 * no-op write rather than a duplicate. A cancelled event is kept and marked,
 * not deleted: someone may have prepared for it, and silently removing it would
 * leave them wondering where their brief went.
 */
async function persistEvent(
  supabase: Client,
  input: {
    userId: string
    integrationId: string
    provider: CalendarProviderId
    event: NormalizedEvent
    matched: Map<string, string>
    ownerEmail: string | null
  },
): Promise<'imported' | 'updated' | 'cancelled' | 'skipped'> {
  const { event } = input

  // Attendees are stored with their match, so the UI does not re-query per
  // render. Emails are user data and stay in the row, never in a log.
  const attendees = candidateAttendees(event.attendees, input.ownerEmail).map((a) => ({
    email: a.email,
    displayName: a.displayName,
    response: a.response,
    isOrganizer: a.isOrganizer,
    personId: a.email ? (input.matched.get(a.email) ?? null) : null,
  }))

  const { data: existing } = await supabase
    .from('external_calendar_events')
    .select('id, provider_updated_at, status, attendees')
    .eq('integration_id', input.integrationId)
    .eq('external_id', event.externalId)
    .maybeSingle()

  // Skip an event that has not moved AND whose people we already resolved the
  // same way.
  //
  // Two things make this less obvious than it looks.
  //
  // The timestamps are compared as instants, not as strings. Postgres returns
  // '2026-08-27 02:00:53.016446+00' where Graph sent
  // '2026-08-27T02:00:53.0164460Z' -- the same moment, never the same text. As
  // a string comparison this branch could not fire even once, so every sync
  // rewrote every event.
  //
  // And the matches have to agree too. Repairing only the timestamp would have
  // introduced a worse bug than the one it fixed: a user adds someone to
  // Atturel, presses Sync now, and the attendee still reads as unknown, because
  // the event itself has not changed on Microsoft's side and never will just
  // because our end learned who somebody is.
  if (
    existing &&
    existing.status === event.status &&
    sameInstant(existing.provider_updated_at, event.providerUpdatedAt) &&
    sameMatches(existing.attendees, attendees)
  ) {
    return 'skipped'
  }

  const row = {
    user_id: input.userId,
    integration_id: input.integrationId,
    provider: input.provider,
    external_id: event.externalId,
    calendar_id: event.calendarId,
    title: event.title,
    description: event.description,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    time_zone: event.timeZone,
    is_all_day: event.isAllDay,
    location: event.location,
    meeting_url: event.meetingUrl,
    organizer_email: event.organizerEmail,
    attendees,
    recurrence_id: event.recurrenceId,
    is_recurring: event.isRecurring,
    status: event.status,
    is_private: event.isPrivate,
    provider_updated_at: event.providerUpdatedAt,
    synced_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('external_calendar_events')
    .upsert(row, { onConflict: 'integration_id,external_id' })

  if (error) {
    logger.warn('calendar.event_persist_failed', { code: error.code })
    return 'skipped'
  }

  if (event.status === 'cancelled') return 'cancelled'
  return existing ? 'updated' : 'imported'
}

/**
 * Sync one connected calendar.
 *
 * Never throws. A calendar that cannot be read is a connection needing
 * attention, not a broken page.
 */
export async function syncCalendar(
  supabase: Client,
  userId: string,
  integrationId: string,
  options: { ownerEmail?: string | null } = {},
): Promise<SyncOutcome> {
  const empty: SyncOutcome = {
    ok: false,
    imported: 0,
    updated: 0,
    cancelled: 0,
    attendeesMatched: 0,
    attendeesUnmatched: 0,
  }

  const { data: integration } = await supabase
    .from('integration_accounts')
    .select(
      'id, provider, status, access_token_encrypted, refresh_token_encrypted, token_expires_at, calendar_id, sync_cursor',
    )
    .eq('id', integrationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!integration) return { ...empty, reason: 'not_connected' }

  const row = integration as unknown as IntegrationRow
  const token = await usableAccessToken(supabase, row)

  if (token.token === null) {
    await supabase
      .from('integration_accounts')
      .update({
        status: token.reason === 'admin_consent_required' ? 'admin_consent_required' : 'expired',
        last_error: token.reason ?? 'error',
        last_sync_attempt_at: new Date().toISOString(),
      })
      .eq('id', integrationId)
    return { ...empty, reason: token.reason }
  }

  const provider = calendarProvider(row.provider)
  const from = new Date()
  const to = new Date(Date.now() + SYNC_HORIZON_DAYS * 86_400_000)

  const listed = await provider.listEvents({
    accessToken: token.token,
    from,
    to,
    calendarId: row.calendar_id,
    cursor: row.sync_cursor,
  })

  if (!listed.ok) {
    const status =
      listed.reason === 'admin_consent_required'
        ? 'admin_consent_required'
        : listed.reason === 'unauthorized'
          ? 'revoked'
          : 'error'

    await supabase
      .from('integration_accounts')
      .update({
        status,
        last_error: listed.reason,
        last_sync_attempt_at: new Date().toISOString(),
      })
      .eq('id', integrationId)

    return {
      ...empty,
      reason:
        listed.reason === 'unauthorized'
          ? 'needs_reconnect'
          : listed.reason === 'admin_consent_required'
            ? 'admin_consent_required'
            : listed.reason === 'rate_limited'
              ? 'rate_limited'
              : 'unavailable',
    }
  }

  const outcome: SyncOutcome = { ...empty, ok: true }

  // One lookup for every attendee across the whole batch, rather than per event.
  const allAttendees = listed.value.events.flatMap((e) =>
    candidateAttendees(e.attendees, options.ownerEmail ?? null),
  )
  const matched = await matchAttendees(supabase, userId, allAttendees)

  const seenEmails = new Set<string>()
  for (const attendee of allAttendees) {
    if (!attendee.email || seenEmails.has(attendee.email)) continue
    seenEmails.add(attendee.email)
    if (matched.has(attendee.email)) outcome.attendeesMatched++
    else outcome.attendeesUnmatched++
  }

  for (const event of listed.value.events) {
    const result = await persistEvent(supabase, {
      userId,
      integrationId,
      provider: row.provider,
      event,
      matched,
      ownerEmail: options.ownerEmail ?? null,
    })
    if (result === 'imported') outcome.imported++
    else if (result === 'updated') outcome.updated++
    else if (result === 'cancelled') outcome.cancelled++
  }

  await supabase
    .from('integration_accounts')
    .update({
      status: 'connected',
      last_error: null,
      last_synced_at: new Date().toISOString(),
      last_sync_attempt_at: new Date().toISOString(),
      sync_cursor: listed.value.cursor,
    })
    .eq('id', integrationId)

  return outcome
}
