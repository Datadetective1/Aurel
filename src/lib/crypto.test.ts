import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Token encryption.
 *
 * A calendar refresh token is a standing grant to read someone's working life.
 * These tests are about the properties that matter if a database backup ever
 * leaks, and about failing closed rather than quietly storing plaintext.
 *
 * The module reads its key at call time from serverEnv, so each test stubs the
 * environment and re-imports.
 */

const KEY = 'test-encryption-key-that-is-definitely-long-enough-32+'

async function load(key?: string) {
  vi.resetModules()
  if (key === undefined) vi.stubEnv('TOKEN_ENCRYPTION_KEY', '')
  else vi.stubEnv('TOKEN_ENCRYPTION_KEY', key)
  return import('./crypto')
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', async () => {
    const { encryptSecret, decryptSecret } = await load(KEY)
    const token = 'refresh-token-value'
    expect(decryptSecret(encryptSecret(token))).toBe(token)
  })

  it('never stores the plaintext anywhere in the ciphertext', async () => {
    const { encryptSecret } = await load(KEY)
    const token = 'a-very-recognisable-refresh-token'
    const stored = encryptSecret(token)
    expect(stored).not.toContain(token)
    expect(Buffer.from(stored, 'utf8').toString('base64')).not.toContain(token)
  })

  it('produces different ciphertext each time for the same input', async () => {
    // A fresh IV per encryption. Without it, identical tokens are visibly
    // identical in the database, which leaks that two rows share a value.
    const { encryptSecret } = await load(KEY)
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('refuses to store a secret when no key is configured', async () => {
    // The alternative is silently writing a refresh token in plaintext, which
    // is the single worst thing this module could do.
    const { encryptSecret, canStoreSecrets } = await load(undefined)
    expect(canStoreSecrets()).toBe(false)
    expect(() => encryptSecret('token')).toThrow()
  })

  it('refuses a key too short to be worth anything', async () => {
    const { canStoreSecrets } = await load('short')
    expect(canStoreSecrets()).toBe(false)
  })

  it('returns null rather than garbage when the key is wrong', async () => {
    const { encryptSecret } = await load(KEY)
    const stored = encryptSecret('token')

    const { decryptSecret } = await load('a-different-key-also-long-enough-to-pass-32')
    expect(decryptSecret(stored)).toBeNull()
  })

  it('detects tampering instead of decrypting to plausible nonsense', async () => {
    // This is why GCM rather than CBC: an altered ciphertext fails the auth tag
    // instead of producing bytes we would hand to a provider as a token.
    const { encryptSecret, decryptSecret } = await load(KEY)
    const stored = encryptSecret('token')
    const [version, iv, tag, ciphertext] = stored.split('.')
    const flipped = `${version}.${iv}.${tag}.${ciphertext!.slice(0, -2)}AA`
    expect(decryptSecret(flipped)).toBeNull()
  })

  it('returns null for malformed, empty or unversioned input', async () => {
    const { decryptSecret } = await load(KEY)
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret(undefined)).toBeNull()
    expect(decryptSecret('')).toBeNull()
    expect(decryptSecret('not-encrypted-at-all')).toBeNull()
    expect(decryptSecret('v9.a.b.c')).toBeNull()
  })

  it('carries a version so the format can change without guessing', async () => {
    const { encryptSecret } = await load(KEY)
    expect(encryptSecret('token').startsWith('v1.')).toBe(true)
  })
})
