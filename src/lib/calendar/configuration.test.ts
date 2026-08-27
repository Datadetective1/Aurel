import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Configuration diagnostics.
 *
 * The screen that reports a calendar as unavailable has to say which setting is
 * missing, not which settings exist. Naming all three when two are already set
 * is what turns a five-minute fix into an afternoon of re-checking a dashboard.
 */

const KEY = 'test-encryption-key-that-is-definitely-long-enough-32+'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const name of [
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'TOKEN_ENCRYPTION_KEY',
  ]) {
    vi.stubEnv(name, env[name] ?? '')
  }
  return import('./provider')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// The first import pays for transforming the module graph, which on a cold
// run exceeds the 5s default on Windows.
describe('missingProviderEnv', { timeout: 20_000 }, () => {
  it('names every variable when nothing is set', async () => {
    const { missingProviderEnv } = await load({})
    expect(missingProviderEnv('microsoft')).toEqual([
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'TOKEN_ENCRYPTION_KEY',
    ])
  })

  it('names only the one that is missing', async () => {
    // The case this exists for: an operator sets the OAuth pair, forgets the
    // encryption key, and needs to be told that rather than shown all three.
    const { missingProviderEnv } = await load({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
    })
    expect(missingProviderEnv('microsoft')).toEqual(['TOKEN_ENCRYPTION_KEY'])
  })

  it('is empty once the provider is fully configured', async () => {
    const { missingProviderEnv, providerConfigured } = await load({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      TOKEN_ENCRYPTION_KEY: KEY,
    })
    expect(missingProviderEnv('microsoft')).toEqual([])
    expect(providerConfigured('microsoft')).toBe(true)
  })

  it('reports each provider independently', async () => {
    const { missingProviderEnv } = await load({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      TOKEN_ENCRYPTION_KEY: KEY,
    })
    expect(missingProviderEnv('microsoft')).toEqual([])
    expect(missingProviderEnv('google')).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
  })

  it('never returns a value, only a name', async () => {
    const { missingProviderEnv } = await load({ MICROSOFT_CLIENT_ID: 'super-secret-id' })
    expect(missingProviderEnv('microsoft').join(' ')).not.toContain('super-secret-id')
  })
})
