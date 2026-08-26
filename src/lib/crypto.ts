import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * SECRETS AT REST
 * =============================================================================
 * AES-256-GCM for the OAuth tokens Atturel holds on a user's behalf.
 *
 * These are not our secrets. A calendar refresh token is a standing grant to
 * read someone's working life, and a database backup that leaks them is a much
 * worse event than a leaked password hash. So they are encrypted with a key
 * that lives outside the database entirely — an attacker with the database and
 * nothing else gets ciphertext.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a tampered
 * ciphertext fails to decrypt rather than producing plausible garbage that gets
 * sent to a provider as if it were a token.
 *
 * FAILS CLOSED, everywhere. No key configured means encryption throws rather
 * than storing plaintext, and decryption returns null rather than guessing.
 * The calling code treats null as "this connection needs reconnecting", which
 * is the honest outcome: we cannot read the token, so we cannot sync.
 *
 * Nothing here is logged. Not the key, not the plaintext, not the ciphertext,
 * and not the length of either — see the catch blocks.
 * =============================================================================
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard; 96 bits is what the mode is specified for.
const TAG_BYTES = 16
const VERSION = 'v1'

/**
 * The 32-byte key, derived from the configured secret.
 *
 * SHA-256 of the env value rather than requiring exactly 32 raw bytes: it lets
 * the secret be any sufficiently long random string, which is what a person
 * actually pastes into a hosting dashboard, without weakening the key material.
 */
function key(): Buffer | null {
  const secret = serverEnv.TOKEN_ENCRYPTION_KEY
  if (!secret || secret.length < 32) return null
  return createHash('sha256').update(secret).digest()
}

/** True when tokens can actually be stored. Drives the UI, not just the code. */
export function canStoreSecrets(): boolean {
  return key() !== null
}

/**
 * Encrypt a token for storage.
 *
 * Throws when no key is configured. That is deliberate and load-bearing: the
 * alternative is silently writing a refresh token in plaintext, which is the
 * single worst thing this file could do.
 */
export function encryptSecret(plaintext: string): string {
  const k = key()
  if (!k) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured; refusing to store a secret.')
  }

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, k, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // version.iv.tag.ciphertext — version first so the format can change later
  // without having to guess what an old row is.
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

/**
 * Decrypt a stored token, or null.
 *
 * Null on every failure — no key, wrong key, tampered ciphertext, unknown
 * version, malformed input. The caller cannot tell these apart on purpose:
 * every one of them means the same thing operationally, and distinguishing
 * them in a returned value invites logging the difference.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  const k = key()
  if (!k) return null

  try {
    const [version, iv, tag, ciphertext] = stored.split('.')
    if (version !== VERSION || !iv || !tag || !ciphertext) return null

    const decipher = createDecipheriv(ALGORITHM, k, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // No detail, not even the error name. A decryption failure is either a key
    // rotation or an attack, and both are visible from the connection going to
    // 'error' — neither needs a line that hints at the ciphertext.
    logger.warn('crypto.decrypt_failed', {})
    return null
  }
}
