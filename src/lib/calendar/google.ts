import 'server-only'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  GOOGLE_SCOPES,
  extractMeetingUrl,
  looksLikeResource,
  providerConfigured,
  type CalendarProvider,
  type ListEventsInput,
  type ListEventsOutput,
  type NormalizedAttendee,
  type NormalizedEvent,
  type ProviderResult,
  type TokenSet,
} from './provider'

/**
 * GOOGLE CALENDAR.
 *
 * Same abstraction as Microsoft, and deliberately the same shape of file, so
 * the differences between the two providers are visible rather than buried in
 * differently-organised code.
 *
 * Two things differ meaningfully. Google issues a refresh token only on the
 * first consent unless `prompt=consent` is forced, so the authorization URL
 * asks for offline access explicitly — without it, a reconnect silently yields
 * an access token that expires in an hour and never renews. And Google's
 * `singleEvents=true` expands recurrences into occurrences, matching what
 * Graph's calendarView does, so both providers hand the sync the same thing.
 * =============================================================================
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleAttendee {
  email?: string
  displayName?: string
  organizer?: boolean
  resource?: boolean
  responseStatus?: string
  self?: boolean
}

interface GoogleEvent {
  id?: string
  status?: string
  summary?: string | null
  description?: string | null
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  location?: string | null
  hangoutLink?: string | null
  conferenceData?: { entryPoints?: { uri?: string }[] }
  organizer?: { email?: string }
  attendees?: GoogleAttendee[]
  recurringEventId?: string | null
  visibility?: string
  updated?: string
}

/** `dateTime` is a real instant; `date` is an all-day event with no time. */
function toInstant(part: GoogleEvent['start']): { iso: string | null; allDay: boolean } {
  if (part?.dateTime) {
    const date = new Date(part.dateTime)
    return { iso: Number.isNaN(date.getTime()) ? null : date.toISOString(), allDay: false }
  }
  if (part?.date) {
    const date = new Date(`${part.date}T00:00:00Z`)
    return { iso: Number.isNaN(date.getTime()) ? null : date.toISOString(), allDay: true }
  }
  return { iso: null, allDay: false }
}

function normalizeAttendee(raw: GoogleAttendee): NormalizedAttendee {
  const email = raw.email?.toLowerCase() ?? null
  const displayName = raw.displayName ?? null
  return {
    email,
    displayName,
    isOrganizer: raw.organizer === true,
    isResource: raw.resource === true || looksLikeResource({ email, displayName }),
    response: raw.responseStatus ?? 'none',
  }
}

export function normalizeGoogleEvent(raw: GoogleEvent): NormalizedEvent | null {
  const start = toInstant(raw.start)
  if (!raw.id || !start.iso) return null

  // Google's own privacy semantics, not ours to reinterpret.
  const isPrivate = raw.visibility === 'private' || raw.visibility === 'confidential'
  const end = toInstant(raw.end)

  return {
    externalId: raw.id,
    calendarId: null,
    title: isPrivate ? null : (raw.summary ?? null),
    description: isPrivate ? null : (raw.description?.slice(0, 500) ?? null),
    startsAt: start.iso,
    endsAt: end.iso,
    timeZone: raw.start?.timeZone ?? null,
    isAllDay: start.allDay,
    location: isPrivate ? null : (raw.location ?? null),
    meetingUrl: isPrivate
      ? null
      : extractMeetingUrl(
          raw.hangoutLink,
          raw.conferenceData?.entryPoints?.[0]?.uri,
          raw.location,
          raw.description,
        ),
    organizerEmail: raw.organizer?.email?.toLowerCase() ?? null,
    attendees: (raw.attendees ?? []).map(normalizeAttendee),
    recurrenceId: raw.recurringEventId ?? null,
    isRecurring: Boolean(raw.recurringEventId),
    status: raw.status === 'cancelled' ? 'cancelled' : 'confirmed',
    isPrivate,
    providerUpdatedAt: raw.updated ?? null,
  }
}

export function googleProvider(): CalendarProvider {
  const clientId = serverEnv.GOOGLE_CLIENT_ID ?? ''
  const clientSecret = serverEnv.GOOGLE_CLIENT_SECRET ?? ''

  async function token(body: URLSearchParams): Promise<ProviderResult<TokenSet>> {
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        // Status only: the error body echoes the request, which carries the
        // authorization code.
        logger.warn('calendar.token_exchange_failed', {
          provider: 'google',
          status: response.status,
        })
        return { ok: false, reason: response.status === 400 ? 'unauthorized' : 'error' }
      }

      const payload = (await response.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        scope?: string
        id_token?: string
      }

      return {
        ok: true,
        value: {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
          scopes: payload.scope?.split(' ') ?? GOOGLE_SCOPES,
          accountEmail: emailFromIdToken(payload.id_token),
        },
      }
    } catch (error) {
      logger.warn('calendar.token_request_error', {
        provider: 'google',
        error: error instanceof Error ? error.name : 'unknown',
      })
      return { ok: false, reason: 'unavailable' }
    }
  }

  return {
    id: 'google',
    label: 'Google Calendar',
    configured: providerConfigured('google'),
    scopes: GOOGLE_SCOPES,

    authorizationUrl({ redirectUri, state }) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
      // Both are required for a refresh token. Without access_type=offline
      // Google returns none at all; without prompt=consent it returns none on
      // any reconnect, and the connection dies quietly an hour later.
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('include_granted_scopes', 'true')
      url.searchParams.set('state', state)
      return url.toString()
    },

    exchangeCode({ code, redirectUri }) {
      return token(
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      )
    },

    refresh({ refreshToken }) {
      return token(
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      )
    },

    async listEvents({
      accessToken,
      from,
      to,
      calendarId,
    }: ListEventsInput): Promise<ProviderResult<ListEventsOutput>> {
      try {
        const url = new URL(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId || 'primary')}/events`,
        )
        url.searchParams.set('timeMin', from.toISOString())
        url.searchParams.set('timeMax', to.toISOString())
        // Expand recurrences into occurrences, so a weekly standup is one row
        // per week with its own id — the same shape Graph's calendarView gives.
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        url.searchParams.set('maxResults', '250')

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(20_000),
        })

        if (response.status === 401) return { ok: false, reason: 'unauthorized' }
        if (response.status === 403) {
          const body = await response.text()
          // Google uses 403 for both "not granted" and "rate limited".
          return {
            ok: false,
            reason: /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(body)
              ? 'rate_limited'
              : 'unauthorized',
          }
        }
        if (response.status === 429) return { ok: false, reason: 'rate_limited' }
        if (!response.ok) {
          logger.warn('calendar.list_failed', { provider: 'google', status: response.status })
          return { ok: false, reason: response.status >= 500 ? 'unavailable' : 'error' }
        }

        const payload = (await response.json()) as {
          items?: GoogleEvent[]
          nextSyncToken?: string
        }
        const events = (payload.items ?? [])
          .map(normalizeGoogleEvent)
          .filter((e): e is NormalizedEvent => e !== null)

        return { ok: true, value: { events, cursor: payload.nextSyncToken ?? null } }
      } catch (error) {
        logger.warn('calendar.list_error', {
          provider: 'google',
          error: error instanceof Error ? error.name : 'unknown',
        })
        return { ok: false, reason: 'unavailable' }
      }
    },

    async revoke({ refreshToken, accessToken }) {
      // Google does support real revocation, so disconnect actually withdraws
      // the grant rather than only forgetting it. Best-effort: a failure here
      // must not stop us deleting our own copy, which is the part that matters.
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken ?? accessToken }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        logger.warn('calendar.revoke_failed', { provider: 'google' })
      }
    },
  }
}

/** See the note on the Microsoft equivalent: display only, never a decision. */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
    }
    return claims.email?.toLowerCase() ?? null
  } catch {
    return null
  }
}
