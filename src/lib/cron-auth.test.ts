import { describe, expect, it } from 'vitest'
import { cronAuthorized } from './cron-auth'

describe('cronAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(cronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })
  it('refuses a wrong, partial or missing header', () => {
    expect(cronAuthorized('Bearer s3cret', 's3cret-value')).toBe(false)
    expect(cronAuthorized('s3cret-value', 's3cret-value')).toBe(false)
    expect(cronAuthorized(null, 's3cret-value')).toBe(false)
  })
  it('refuses everything when no secret is configured', () => {
    expect(cronAuthorized('Bearer ', '')).toBe(false)
    expect(cronAuthorized('Bearer undefined', undefined)).toBe(false)
  })
})
