import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { requireOnboardedUser } from '@/lib/auth'
import { calendarProvider, CALENDAR_PROVIDERS, providerConfigured } from '@/lib/calendar'
import type { CalendarProviderId } from '@/lib/calendar'
import { canStoreSecrets } from '@/lib/crypto'
import { serverEnv } from '@/lib/env'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { absoluteUrl } from '@/lib/brand'

/**
 * Start the OAuth dance.
 *
 * The `state` parameter is signed rather than random-and-stored. It carries the
 * user id and provider, HMAC'd with the token encryption key, so the callback
 * can verify that this authorization belongs to the session completing it
 * without a round trip to a table of pending requests. Without that binding,
 * an attacker could complete an OAuth flow they started and have the resulting
 * grant attached to someone else's account.
 */

export function stateSecret(): string {
  return serverEnv.TOKEN_ENCRYPTION_KEY ?? ''
}

export function signState(payload: string): string {
  const mac = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

/** Constant-time verification, returning the payload or null. */
export function verifyState(state: string | null): string | null {
  if (!state) return null
  const index = state.lastIndexOf('.')
  if (index <= 0) return null

  const payload = state.slice(0, index)
  const provided = Buffer.from(state.slice(index + 1))
  const expected = Buffer.from(createHmac('sha256', stateSecret()).update(payload).digest('base64url'))

  if (provided.length !== expected.length) return null
  return timingSafeEqual(provided, expected) ? payload : null
}

export function calendarRedirectUri(provider: CalendarProviderId): string {
  return absoluteUrl(`/api/calendar/${provider}/callback`)
}

/**
 * TEMPORARY configuration diagnostic.
 *
 * Answers one question and no other: does the running deployment see the
 * variables this route needs? Booleans, a length and variable NAMES -- never a
 * value, never a fragment of one. Behind the same authentication as the rest of
 * the route, because even names are worth not handing to a stranger.
 *
 * similarKeyNames is the part that earns its place: a variable misspelled or
 * saved with stray whitespace in its name is invisible to every other check,
 * because the code looks for the correct name and correctly does not find it.
 * Listing what the runtime actually holds is the only way to see that.
 *
 * Remove once the calendar is connected.
 */
function configurationDiagnostic(id: CalendarProviderId) {
  const key = serverEnv.TOKEN_ENCRYPTION_KEY
  return {
    tokenEncryptionKeyPresent: Boolean(key),
    tokenEncryptionKeyLength: key?.length ?? 0,
    tokenEncryptionKeyUsable: canStoreSecrets(),
    microsoftClientIdPresent: Boolean(serverEnv.MICROSOFT_CLIENT_ID),
    microsoftClientSecretPresent: Boolean(serverEnv.MICROSOFT_CLIENT_SECRET),
    providerConfigured: providerConfigured(id),
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    // Names only. Reveals a typo or stray whitespace in the variable name,
    // which no check for the correct name can ever surface.
    similarKeyNames: Object.keys(process.env)
      .filter((name) => /TOKEN|ENCRYPT|MICROSOFT/i.test(name))
      .sort(),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params
  const origin = absoluteUrl('').replace(/\/$/, '')

  if (!CALENDAR_PROVIDERS.includes(raw as CalendarProviderId)) {
    return NextResponse.redirect(`${origin}/settings/capabilities?calendar=unknown_provider`)
  }
  const id = raw as CalendarProviderId

  const { user } = await requireOnboardedUser()

  if (request.nextUrl.searchParams.get('diagnose') === '1') {
    return NextResponse.json(configurationDiagnostic(id), {
      headers: { 'cache-control': 'no-store' },
    })
  }

  // Refusing here rather than at the callback: sending someone through a
  // consent screen we cannot honour wastes their time and leaves a granted
  // permission we never use.
  if (!providerConfigured(id) || !canStoreSecrets()) {
    logger.warn('calendar.connect_unconfigured', { provider: id })
    return NextResponse.redirect(`${origin}/settings/capabilities?calendar=not_configured`)
  }

  await track('calendar_connect_started', { provider: id })

  const nonce = randomBytes(16).toString('base64url')
  const state = signState(`${id}:${user.id}:${nonce}`)

  return NextResponse.redirect(
    calendarProvider(id).authorizationUrl({
      redirectUri: calendarRedirectUri(id),
      state,
    }),
  )
}
