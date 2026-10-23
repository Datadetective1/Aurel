import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time check of a cron request's bearer secret.
 *
 * Both sides are hashed first so the comparison is over equal-length buffers
 * whatever the header holds, and a missing secret always refuses.
 */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  const actual = createHash('sha256').update(header).digest()
  return timingSafeEqual(expected, actual)
}
