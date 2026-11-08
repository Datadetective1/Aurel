import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient } from '../../../tests/stubs/fake-supabase'

/**
 * An App Store subscription in the one canonical answer: Pro while Apple's
 * dates say so, Free once they do not, and nothing at all (not an error)
 * before migration 0025 exists.
 */

const h = vi.hoisted(() => ({
  apple: [] as Record<string, unknown>[],
  appleMissing: false,
  subscription: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'u-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const client = fakeClient({
      subscriptions: h.subscription ? [h.subscription] : [],
      entitlement_overrides: [],
      access_grants: [],
      app_store_subscriptions: h.apple,
    }).client as unknown as { from(table: string): unknown }
    return {
      from(table: string) {
        if (table === 'app_store_subscriptions' && h.appleMissing) {
          const failed = { data: null, error: { code: '42P01' } }
          const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => Promise.resolve(failed),
          }
          return chain
        }
        return client.from(table)
      },
    }
  },
}))

const { getEntitlements } = await import('./entitlements')

const DAY = 86_400_000
function appleRow(over: Record<string, unknown> = {}) {
  return {
    original_transaction_id: '2000000001',
    user_id: 'u-1',
    product_id: 'com.atturel.app.pro.monthly',
    latest_transaction_id: '2000000001',
    latest_purchase_at: new Date(Date.now() - DAY).toISOString(),
    environment: 'Production',
    expires_at: new Date(Date.now() + 29 * DAY).toISOString(),
    revoked_at: null,
    auto_renew: true,
    grace_period_expires_at: null,
    renewal_state_at: null,
    ...over,
  }
}

beforeEach(() => {
  h.apple = []
  h.appleMissing = false
  h.subscription = null
})

describe('getEntitlements with an App Store subscription', () => {
  it('is Pro, billed by Apple, while the period runs', async () => {
    h.apple = [appleRow()]
    const e = await getEntitlements()
    expect(e.plan).toBe('pro')
    expect(e.provider).toBe('apple')
    expect(e.billingProviders).toEqual(['apple'])
    expect(e.apple.available).toBe(true)
    expect(e.apple.billing).toMatchObject({ status: 'active', cancelAtPeriodEnd: false })
  })

  it('is Free once the period has ended', async () => {
    h.apple = [appleRow({ expires_at: new Date(Date.now() - DAY).toISOString() })]
    expect((await getEntitlements()).plan).toBe('free')
  })

  it('is Free after a refund, even inside the period', async () => {
    h.apple = [appleRow({ revoked_at: new Date().toISOString() })]
    const e = await getEntitlements()
    expect(e.plan).toBe('free')
    expect(e.billingProviders).toEqual([])
  })

  it('before migration 0025: no Apple access, no error, and no purchase offered', async () => {
    h.appleMissing = true
    const e = await getEntitlements()
    expect(e.plan).toBe('free')
    expect(e.apple).toEqual({ available: false, billing: null })
  })
})
