import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Exa provider.
 *
 * Exercised through `resolveSearchProvider` rather than by importing the
 * factory, so the env resolution that decides which provider runs is on the
 * path too — that decision is where the last provider activation went wrong.
 *
 * The transport is stubbed. These are about the request we send and how we read
 * the reply; whether Exa is up is not something a test suite can assert.
 */

async function withExa(stub: typeof fetch) {
  vi.stubEnv('EXA_API_KEY', 'exa_test_key_not_real')
  vi.stubEnv('SEARCH_PROVIDER', '')
  vi.stubGlobal('fetch', stub)
  vi.resetModules()
  const { resolveSearchProvider } = await import('./providers')
  return resolveSearchProvider()
}

function reply(body: unknown, status = 200) {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('exa provider', () => {
  it('is selected by the key alone, and reports itself honestly', async () => {
    const provider = await withExa(reply({ results: [] }))
    expect(provider.id).toBe('exa')
    expect(provider.configured).toBe(true)
  })

  it('returns ranked results from a successful search', async () => {
    const provider = await withExa(
      reply({
        results: [
          { url: 'https://meridiansystems.com/team/jordan-avery', title: 'Jordan Avery' },
          { url: 'https://confer.example/speakers/jordan', title: 'Speaker: Jordan Avery' },
        ],
      }),
    )

    const result = await provider.search({ name: 'Jordan Avery', organization: 'Meridian Systems' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.url).toContain('meridiansystems.com')
    // Rank is positional, so the caller can preserve provider order.
    expect(result.results[0]?.rank).toBe(0)
    expect(result.results[1]?.rank).toBe(1)
    expect(result.costUnits).toBe(1)
  })

  it('never asks Exa for page contents', async () => {
    // Two reasons, and both matter. Contents cost more per request, and they
    // would arrive without passing through our own fetch — the thing that
    // enforces SSRF protection, size limits, paywall detection and the identity
    // check. A snippet must never become a fact.
    let sent: Record<string, unknown> = {}
    const provider = await withExa((async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body))
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.search({ name: 'Jordan Avery' })
    expect(sent.contents).toBeUndefined()
    expect(sent.text).toBeUndefined()
  })

  it('never uses the deep search type, which bills a multiple', async () => {
    let sent: Record<string, unknown> = {}
    const provider = await withExa((async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body))
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.search({ name: 'Jordan Avery' })
    expect(sent.type).toBe('auto')
    expect(String(sent.type)).not.toContain('deep')
  })

  it('excludes aggregators and LinkedIn at the provider, not just after', async () => {
    // Filtering them locally still pays for them. LinkedIn is excluded because
    // fetching it programmatically is against their terms.
    let sent: { excludeDomains?: string[] } = {}
    const provider = await withExa((async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body))
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.search({ name: 'Jordan Avery' })
    expect(sent.excludeDomains).toContain('linkedin.com')
    expect(sent.excludeDomains).toContain('rocketreach.co')
  })

  it('pins the search to a domain when one is known', async () => {
    let sent: { includeDomains?: string[] } = {}
    const provider = await withExa((async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body))
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch)

    // Accepts a bare domain, a URL or an email address.
    await provider.search({ name: 'Jordan Avery', domain: 'jordan@meridiansystems.com' })
    expect(sent.includeDomains).toEqual(['meridiansystems.com'])
  })

  it('sends the key as a header and never in the query', async () => {
    let seenUrl = ''
    let headers: Record<string, string> = {}
    const provider = await withExa((async (url, init) => {
      seenUrl = String(url)
      headers = (init as RequestInit).headers as Record<string, string>
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch)

    await provider.search({ name: 'Jordan Avery' })
    expect(headers['x-api-key']).toBeTruthy()
    expect(seenUrl).not.toContain('exa_test_key_not_real')
  })

  it('reports an empty result set as success with nothing found', async () => {
    // Distinct from a failure: the caller tells the user nobody could be found,
    // which is true, rather than that research is unavailable, which is not.
    const provider = await withExa(reply({ results: [] }))
    const result = await provider.search({ name: 'Nobody Findable' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toEqual([])
  })

  it('treats a rejected key as configuration, not a transient error', async () => {
    // Reporting it as transient would have the UI suggest retrying forever.
    for (const status of [401, 403]) {
      const provider = await withExa(reply({ error: 'unauthorised' }, status))
      const result = await provider.search({ name: 'Jordan Avery' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('not_configured')
    }
  })

  it('surfaces a rate limit as its own reason', async () => {
    const provider = await withExa(reply({}, 429))
    const result = await provider.search({ name: 'Jordan Avery' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rate_limited')
  })

  it('resolves rather than throwing when the request dies', async () => {
    // Research runs inside a server action. An unhandled throw here would fail
    // the whole action rather than degrading to "paste a link instead".
    const provider = await withExa((async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch)

    const result = await provider.search({ name: 'Jordan Avery' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('error')
  })

  it('drops malformed results rather than passing a URL-less row down the pipeline', async () => {
    const provider = await withExa(
      reply({ results: [{ title: 'No URL here' }, { url: 'https://ok.example/x', title: 'Fine' }] }),
    )
    const result = await provider.search({ name: 'Jordan Avery' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toHaveLength(1)
  })
})
