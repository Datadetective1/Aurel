import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => store.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))

const { bearerToken } = await import('./server')
const { bearerFlagValue } = await import('@/lib/bearer-routes')

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl'

describe('bearerToken', () => {
  beforeEach(() => store.clear())

  it('is ignored everywhere the middleware did not flag as a bearer route', async () => {
    store.set('authorization', `Bearer ${JWT}`)
    await expect(bearerToken()).resolves.toBeNull()
    // A forged mark with a guessable value is not the middleware's mark.
    store.set('x-atturel-bearer-route', '1')
    await expect(bearerToken()).resolves.toBeNull()
  })

  it('is read on a flagged route when it has the shape of a JWT', async () => {
    store.set('x-atturel-bearer-route', await bearerFlagValue())
    store.set('authorization', `Bearer ${JWT}`)
    await expect(bearerToken()).resolves.toBe(JWT)
  })

  it('refuses anything that is not a JWT, such as the cron secret', async () => {
    store.set('x-atturel-bearer-route', await bearerFlagValue())
    store.set('authorization', 'Bearer a-long-random-cron-secret')
    await expect(bearerToken()).resolves.toBeNull()
  })
})
