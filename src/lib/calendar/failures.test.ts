import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Provider failure handling.
 *
 * Every one of these is a state a real user hits, and the requirement is the
 * same throughout: fail gracefully, say something true, and never throw out of
 * a server action into a blank page.
 *
 * The one that gets the most attention is admin consent. A tenant with user
 * consent disabled produces an error the user cannot resolve by retrying, and
 * reporting it as a generic failure would leave them clicking Connect forever.
 */

const KEY = 'test-encryption-key-that-is-definitely-long-enough-32+'

async function withProvider(stub: typeof fetch, which: 'microsoft' | 'google' = 'microsoft') {
  vi.resetModules()
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', KEY)
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'client-id')
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret')
  vi.stubGlobal('fetch', stub)
  const { calendarProvider } = await import('./index')
  return calendarProvider(which)
}

function reply(body: unknown, status = 200) {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('token exchange failures', () => {
  it('recognises a tenant that requires administrator approval', async () => {
    // AADSTS65001 is "the user or administrator has not consented". Retrying
    // cannot fix it, so it must not be reported as a transient error.
    const provider = await withProvider(
      reply('{"error":"invalid_grant","error_description":"AADSTS65001: consent required"}', 400),
    )
    const result = await provider.exchangeCode({ code: 'x', redirectUri: 'https://x/cb' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('admin_consent_required')
  })

  it('reports a rejected code as unauthorized, not as an outage', async () => {
    const provider = await withProvider(reply('{"error":"invalid_grant"}', 400))
    const result = await provider.exchangeCode({ code: 'stale', redirectUri: 'https://x/cb' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unauthorized')
  })

  it('resolves rather than throwing when the provider is unreachable', async () => {
    const provider = await withProvider((async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch)
    const result = await provider.exchangeCode({ code: 'x', redirectUri: 'https://x/cb' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unavailable')
  })
})

describe('listing failures', () => {
  const window = { from: new Date(), to: new Date(Date.now() + 86_400_000) }

  it('treats 401 as a grant that needs reconnecting', async () => {
    const provider = await withProvider(reply({}, 401))
    const result = await provider.listEvents({ accessToken: 'a', ...window })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unauthorized')
  })

  it('surfaces rate limiting as its own state', async () => {
    const provider = await withProvider(reply({}, 429))
    const result = await provider.listEvents({ accessToken: 'a', ...window })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rate_limited')
  })

  it('separates Google’s two meanings for 403', async () => {
    // Google uses 403 for both "not granted" and "slow down", which need
    // different remedies: reconnect versus wait.
    const limited = await withProvider(reply({ error: { message: 'rateLimitExceeded' } }, 403), 'google')
    const limitedResult = await limited.listEvents({ accessToken: 'a', ...window })
    expect(limitedResult.ok).toBe(false)
    if (!limitedResult.ok) expect(limitedResult.reason).toBe('rate_limited')

    const denied = await withProvider(reply({ error: { message: 'insufficientPermissions' } }, 403), 'google')
    const deniedResult = await denied.listEvents({ accessToken: 'a', ...window })
    expect(deniedResult.ok).toBe(false)
    if (!deniedResult.ok) expect(deniedResult.reason).toBe('unauthorized')
  })

  it('treats a 5xx as an outage rather than a permission problem', async () => {
    const provider = await withProvider(reply({}, 503))
    const result = await provider.listEvents({ accessToken: 'a', ...window })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unavailable')
  })

  it('returns an empty list, not a failure, when there are no meetings', async () => {
    // An empty fortnight is a normal Tuesday, not an error.
    const provider = await withProvider(reply({ value: [] }))
    const result = await provider.listEvents({ accessToken: 'a', ...window })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.events).toEqual([])
  })

  it('drops a malformed event rather than failing the whole sync', async () => {
    // One unparseable row must not cost the user the other nine.
    const provider = await withProvider(
      reply({
        value: [
          { id: 'ok', subject: 'Fine', start: { dateTime: '2026-09-01T10:00:00.0000000' } },
          { id: 'broken' },
          { subject: 'No id at all' },
        ],
      }),
    )
    const result = await provider.listEvents({ accessToken: 'a', ...window })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.events).toHaveLength(1)
  })
})

describe('requests are read-only and least-privilege', () => {
  it('asks for no write scope on either provider', async () => {
    const ms = await withProvider(reply({}))
    expect(ms.scopes.join(' ')).toContain('Calendars.Read')
    expect(ms.scopes.join(' ')).not.toContain('ReadWrite')
    expect(ms.scopes.join(' ')).not.toMatch(/Mail|Contacts|Files/)

    const google = await withProvider(reply({}), 'google')
    expect(google.scopes.join(' ')).toContain('calendar.events.readonly')
    expect(google.scopes.join(' ')).not.toMatch(/calendar$|calendar\.events$/)
  })

  it('only ever issues GET requests when listing', async () => {
    // The structural guarantee behind "read-only": nothing in this path can
    // mutate a calendar, because nothing sends a mutating verb.
    const methods: string[] = []
    const provider = await withProvider((async (_url, init) => {
      methods.push(((init as RequestInit)?.method ?? 'GET').toUpperCase())
      return new Response(JSON.stringify({ value: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.listEvents({
      accessToken: 'a',
      from: new Date(),
      to: new Date(Date.now() + 86_400_000),
    })
    expect(methods).toEqual(['GET'])
  })

  it('sends the token as a header, never in the URL', async () => {
    let seenUrl = ''
    let headers: Record<string, string> = {}
    const provider = await withProvider((async (url, init) => {
      seenUrl = String(url)
      headers = ((init as RequestInit)?.headers ?? {}) as Record<string, string>
      return new Response(JSON.stringify({ value: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.listEvents({
      accessToken: 'super-secret-token',
      from: new Date(),
      to: new Date(Date.now() + 86_400_000),
    })

    expect(seenUrl).not.toContain('super-secret-token')
    expect(headers.Authorization).toContain('super-secret-token')
  })

  it('requests offline access from Google, without which the grant dies in an hour', async () => {
    const provider = await withProvider(reply({}), 'google')
    const url = provider.authorizationUrl({ redirectUri: 'https://x/cb', state: 's' })
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
  })
})
