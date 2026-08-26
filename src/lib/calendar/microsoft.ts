import 'server-only'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  MICROSOFT_SCOPES,
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
 * MICROSOFT 365 / OUTLOOK, via Microsoft Graph.
 *
 * Delegated OAuth against the `common` authority by default, so the same app
 * registration serves any Entra organisation and personal Microsoft accounts.
 * MICROSOFT_TENANT narrows it to one organisation if a deployment wants that.
 *
 * The failure this adapter is most careful about is a tenant that disables user
 * consent. Graph returns AADSTS65001/AADSTS90094 for it, which is not an error
 * the user can fix by retrying — they need their administrator. Reporting it as
 * a generic failure would leave them clicking Connect forever, so it is
 * surfaced as its own reason all the way to the UI.
 * =============================================================================
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'

function authority(): string {
  return `https://login.microsoftonline.com/${serverEnv.MICROSOFT_TENANT}`
}

/** Consent problems the user cannot resolve alone. */
function isAdminConsentError(payload: string): boolean {
  return /AADSTS65001|AADSTS90094|AADSTS900941|admin_consent|consent_required/i.test(payload)
}

interface GraphAttendee {
  emailAddress?: { address?: string; name?: string }
  type?: string
  status?: { response?: string }
}

interface GraphEvent {
  id: string
  subject?: string | null
  bodyPreview?: string | null
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  isAllDay?: boolean
  location?: { displayName?: string | null }
  onlineMeeting?: { joinUrl?: string | null } | null
  organizer?: { emailAddress?: { address?: string } }
  attendees?: GraphAttendee[]
  seriesMasterId?: string | null
  type?: string
  isCancelled?: boolean
  sensitivity?: string
  lastModifiedDateTime?: string
  '@removed'?: { reason?: string }
}

/**
 * Graph returns local wall-clock plus a named zone, not an instant. Treating
 * `dateTime` as UTC would shift every meeting by the user's offset.
 */
function toInstant(part: { dateTime?: string; timeZone?: string } | undefined): string | null {
  if (!part?.dateTime) return null
  const raw = part.dateTime
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)
  // Graph's default timeZone is UTC unless the request asked otherwise, and we
  // ask for UTC via the Prefer header, so an unsuffixed value is UTC.
  const iso = hasZone ? raw : `${raw}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeAttendee(raw: GraphAttendee, organizerEmail: string | null): NormalizedAttendee {
  const email = raw.emailAddress?.address?.toLowerCase() ?? null
  const displayName = raw.emailAddress?.name ?? null
  return {
    email,
    displayName,
    isOrganizer: Boolean(email && organizerEmail && email === organizerEmail),
    isResource: looksLikeResource({ email, displayName, providerType: raw.type }),
    response: raw.status?.response ?? 'none',
  }
}

export function normalizeMicrosoftEvent(raw: GraphEvent): NormalizedEvent | null {
  const startsAt = toInstant(raw.start)
  if (!raw.id || !startsAt) return null

  // Graph's delta feed marks deletions with @removed rather than a status.
  const removed = Boolean(raw['@removed'])
  const cancelled = removed || raw.isCancelled === true

  // `private` and `confidential` are the provider saying "do not repeat this".
  // We keep when it is and who is in it, because that is what preparation
  // needs, and store nothing about what it says.
  const isPrivate = raw.sensitivity === 'private' || raw.sensitivity === 'confidential'

  const organizerEmail = raw.organizer?.emailAddress?.address?.toLowerCase() ?? null

  return {
    externalId: raw.id,
    calendarId: null,
    title: isPrivate ? null : (raw.subject ?? null),
    description: isPrivate ? null : (raw.bodyPreview?.slice(0, 500) ?? null),
    startsAt,
    endsAt: toInstant(raw.end),
    timeZone: raw.start?.timeZone ?? null,
    isAllDay: raw.isAllDay === true,
    location: isPrivate ? null : (raw.location?.displayName ?? null),
    meetingUrl: isPrivate
      ? null
      : extractMeetingUrl(raw.onlineMeeting?.joinUrl, raw.location?.displayName, raw.bodyPreview),
    organizerEmail,
    attendees: (raw.attendees ?? []).map((a) => normalizeAttendee(a, organizerEmail)),
    recurrenceId: raw.seriesMasterId ?? null,
    isRecurring: Boolean(raw.seriesMasterId) || raw.type === 'seriesMaster',
    status: cancelled ? 'cancelled' : 'confirmed',
    isPrivate,
    providerUpdatedAt: raw.lastModifiedDateTime ?? null,
  }
}

export function microsoftProvider(): CalendarProvider {
  const clientId = serverEnv.MICROSOFT_CLIENT_ID ?? ''
  const clientSecret = serverEnv.MICROSOFT_CLIENT_SECRET ?? ''

  async function token(body: URLSearchParams): Promise<ProviderResult<TokenSet>> {
    try {
      const response = await fetch(`${authority()}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
      })

      const text = await response.text()

      if (!response.ok) {
        if (isAdminConsentError(text)) {
          logger.warn('calendar.admin_consent_required', { provider: 'microsoft' })
          return { ok: false, reason: 'admin_consent_required' }
        }
        // Status only. The body echoes the request, which carries the code.
        logger.warn('calendar.token_exchange_failed', {
          provider: 'microsoft',
          status: response.status,
        })
        return { ok: false, reason: response.status === 400 ? 'unauthorized' : 'error' }
      }

      const payload = JSON.parse(text) as {
        access_token: string
        refresh_token?: string
        expires_in: number
        scope?: string
        id_token?: string
      }

      return {
        ok: true,
        value: {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
          scopes: payload.scope?.split(' ') ?? MICROSOFT_SCOPES,
          accountEmail: emailFromIdToken(payload.id_token),
        },
      }
    } catch (error) {
      logger.warn('calendar.token_request_error', {
        provider: 'microsoft',
        error: error instanceof Error ? error.name : 'unknown',
      })
      return { ok: false, reason: 'unavailable' }
    }
  }

  return {
    id: 'microsoft',
    label: 'Microsoft 365',
    configured: providerConfigured('microsoft'),
    scopes: MICROSOFT_SCOPES,

    authorizationUrl({ redirectUri, state }) {
      const url = new URL(`${authority()}/oauth2/v2.0/authorize`)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_mode', 'query')
      url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '))
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
          scope: MICROSOFT_SCOPES.join(' '),
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
          scope: MICROSOFT_SCOPES.join(' '),
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
        // calendarView expands recurrences into occurrences, which is what we
        // want: a weekly standup should be one row per week, each with its own
        // id, not a series master we would have to expand ourselves.
        const base = calendarId
          ? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
          : `${GRAPH}/me/calendarView`

        const url = new URL(base)
        url.searchParams.set('startDateTime', from.toISOString())
        url.searchParams.set('endDateTime', to.toISOString())
        url.searchParams.set('$top', '100')
        url.searchParams.set(
          '$select',
          'id,subject,bodyPreview,start,end,isAllDay,location,onlineMeeting,organizer,attendees,seriesMasterId,type,isCancelled,sensitivity,lastModifiedDateTime',
        )
        url.searchParams.set('$orderby', 'start/dateTime')

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            // Ask for instants in UTC so toInstant is not guessing.
            Prefer: 'outlook.timezone="UTC"',
          },
          signal: AbortSignal.timeout(20_000),
        })

        if (response.status === 401) return { ok: false, reason: 'unauthorized' }
        if (response.status === 429) return { ok: false, reason: 'rate_limited' }
        if (response.status === 403) {
          const body = await response.text()
          return {
            ok: false,
            reason: isAdminConsentError(body) ? 'admin_consent_required' : 'unauthorized',
          }
        }
        if (!response.ok) {
          logger.warn('calendar.list_failed', { provider: 'microsoft', status: response.status })
          return { ok: false, reason: response.status >= 500 ? 'unavailable' : 'error' }
        }

        const payload = (await response.json()) as { value?: GraphEvent[] }
        const events = (payload.value ?? [])
          .map(normalizeMicrosoftEvent)
          .filter((e): e is NormalizedEvent => e !== null)

        // calendarView does not return a delta cursor. Sync is bounded by the
        // date window instead, which for a fourteen-day horizon is cheap.
        return { ok: true, value: { events, cursor: null } }
      } catch (error) {
        logger.warn('calendar.list_error', {
          provider: 'microsoft',
          error: error instanceof Error ? error.name : 'unknown',
        })
        return { ok: false, reason: 'unavailable' }
      }
    },

    async revoke() {
      // Graph has no delegated revocation endpoint for a single grant; a user
      // removes access from their Microsoft account page. Disconnect therefore
      // deletes our copy of the tokens, which is the part we control, and never
      // depends on this call succeeding.
    },
  }
}

/**
 * The email claim from an id_token, without verifying the signature.
 *
 * Safe here and nowhere else: the token arrived over TLS directly from the
 * token endpoint in response to our own authenticated request, and the value is
 * used only to show the user which account they connected. It is never a
 * credential and never an authorisation decision.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
      preferred_username?: string
    }
    return (claims.email ?? claims.preferred_username ?? null)?.toLowerCase() ?? null
  } catch {
    return null
  }
}
