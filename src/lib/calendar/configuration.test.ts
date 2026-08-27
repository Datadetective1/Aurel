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

  it('treats a key too short to use as missing, not as configured', async () => {
    // canStoreSecrets refuses anything under 32 characters. If
    // providerConfigured were the more generous of the two, the screen would
    // offer a Connect button that sends someone through a consent screen and
    // then refuses to store the grant it just obtained.
    const { missingProviderEnv, providerConfigured, tokenKeyState } = await load({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      TOKEN_ENCRYPTION_KEY: 'too-short',
    })
    expect(providerConfigured('microsoft')).toBe(false)
    expect(missingProviderEnv('microsoft')).toEqual(['TOKEN_ENCRYPTION_KEY'])
    expect(tokenKeyState()).toBe('too_short')
  })

  it('tells an absent key apart from an unusable one', async () => {
    const absent = await load({})
    expect(absent.tokenKeyState()).toBe('missing')

    const ok = await load({ TOKEN_ENCRYPTION_KEY: KEY })
    expect(ok.tokenKeyState()).toBe('ok')
  })

  /**
   * These use synthetic names rather than TOKEN_ENCRYPTION_KEY itself: load()
   * stubs that one, and on Windows process.env is case-insensitive, so a test
   * written against the real name collides with its own setup. Production is
   * Linux and case-sensitive; the logic under test is the same either way.
   */
  it('spots a variable set under a misspelled name', async () => {
    // The real one, transposed exactly as it was found in production:
    // ATTUREL_ENCRIPTION_PROBE sitting where ATTUREL_ENCRYPTION_PROBE belonged.
    const { nearMatchFor } = await load({})
    vi.stubEnv('ATTUREL_ENCRIPTION_PROBE', 'a'.repeat(48))
    expect(nearMatchFor('ATTUREL_ENCRYPTION_PROBE')).toBe('ATTUREL_ENCRIPTION_PROBE')
  })

  it('spots a name saved with stray whitespace', async () => {
    const { nearMatchFor } = await load({})
    vi.stubEnv(' ATTUREL_WHITESPACE_PROBE', 'x')
    expect(nearMatchFor('ATTUREL_WHITESPACE_PROBE')).toBe(' ATTUREL_WHITESPACE_PROBE')
  })

  it('suggests nothing when nothing is close', async () => {
    // A wrong suggestion is worse than none: it sends someone off to rename a
    // variable that was never the problem.
    const { nearMatchFor } = await load({})
    expect(nearMatchFor('ATTUREL_ABSENT_PROBE_XYZ')).toBeNull()
  })

  it('never suggests the variable itself', async () => {
    const { nearMatchFor } = await load({})
    vi.stubEnv('ATTUREL_EXACT_PROBE', 'x')
    expect(nearMatchFor('ATTUREL_EXACT_PROBE')).toBeNull()
  })

  it('never returns a value, only a name', async () => {
    const { missingProviderEnv } = await load({ MICROSOFT_CLIENT_ID: 'super-secret-id' })
    expect(missingProviderEnv('microsoft').join(' ')).not.toContain('super-secret-id')
  })
})
