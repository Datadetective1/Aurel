import { describe, expect, it } from 'vitest'
import { BEARER_FLAG, bearerFlagValue, forwardedHeaders } from './bearer-routes'

const request = (pathname: string, headers: Record<string, string> = {}) => ({
  headers: new Headers(headers),
  nextUrl: { pathname },
})

describe('forwardedHeaders', () => {
  it('marks only the native routes, with the secret-derived value', async () => {
    const value = await bearerFlagValue()
    expect(forwardedHeaders(request('/api/mobile/today'), value).get(BEARER_FLAG)).toBe(value)
    expect(forwardedHeaders(request('/api/conversations/transcribe'), value).get(BEARER_FLAG)).toBe(
      value,
    )
    expect(forwardedHeaders(request('/today'), value).get(BEARER_FLAG)).toBeNull()
    expect(forwardedHeaders(request('/api/stripe/webhook'), value).get(BEARER_FLAG)).toBeNull()
  })

  it('strips a forged mark on every other path', async () => {
    const h = forwardedHeaders(request('/people', { [BEARER_FLAG]: '1' }), await bearerFlagValue())
    expect(h.get(BEARER_FLAG)).toBeNull()
  })
})
