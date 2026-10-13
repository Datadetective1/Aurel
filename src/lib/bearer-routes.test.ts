import { describe, expect, it } from 'vitest'
import { BEARER_FLAG, forwardedHeaders } from './bearer-routes'

const request = (pathname: string, headers: Record<string, string> = {}) => ({
  headers: new Headers(headers),
  nextUrl: { pathname },
})

describe('forwardedHeaders', () => {
  it('flags only the native routes', () => {
    expect(forwardedHeaders(request('/api/mobile/today')).get(BEARER_FLAG)).toBe('1')
    expect(forwardedHeaders(request('/api/conversations/transcribe')).get(BEARER_FLAG)).toBe('1')
    expect(forwardedHeaders(request('/today')).get(BEARER_FLAG)).toBeNull()
    expect(forwardedHeaders(request('/api/stripe/webhook')).get(BEARER_FLAG)).toBeNull()
  })

  it('strips a forged flag on every other path', () => {
    const h = forwardedHeaders(request('/people', { [BEARER_FLAG]: '1' }))
    expect(h.get(BEARER_FLAG)).toBeNull()
  })
})
