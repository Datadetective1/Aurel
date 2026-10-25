import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../tests/stubs/fake-supabase'
import { resolveEntitlement } from './sources'

/**
 * WHAT THE TRIAL CONFERS, AND WHEN IT STOPS
 * =============================================================================
 * The trial row says `pro` / `trialing` and keeps saying it after the trial
 * ends -- nothing rewrites it. So every reader must go through entitlements,
 * which reads it as a trial that ends by itself: Pro until `trial_ends_at`,
 * Free after, with the Free limits back and nothing removed.
 * =============================================================================
 */

const h = vi.hoisted(() => ({ subscriptions: [] as Record<string, unknown>[] }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'u-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () =>
    fakeClient({
      subscriptions: h.subscriptions as Row[],
      entitlement_overrides: [],
      access_grants: [],
    }).client,
}))

const { getEntitlements } = await import('./entitlements')

const NOW = new Date('2026-10-25T15:00:00Z')

const trialRow = (endsAt: string, over: Row = {}): Row => ({
  user_id: 'u-1',
  plan: 'pro',
  status: 'trialing',
  is_founding: false,
  current_period_end: endsAt,
  trial_ends_at: endsAt,
  stripe_subscription_id: null,
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('an account on the trial', () => {
  it('has Pro: unlimited people and the Atlas, from the trial, with nothing to bill', async () => {
    h.subscriptions = [trialRow('2026-11-08T15:00:00Z')]
    const e = await getEntitlements()
    expect(e).toMatchObject({
      plan: 'pro',
      provider: 'trial',
      trial: { state: 'active', endsAt: '2026-11-08T15:00:00Z' },
      limits: { people: null },
    })
    expect(e.capabilities.relationshipAtlas).toBe(true)
    expect(e.quotas.meeting_brief).toBe(150)
  })
})

describe('an account whose trial ended without subscribing', () => {
  it('is Free again, with Free’s limits, although its row still says pro / trialing', async () => {
    h.subscriptions = [trialRow('2026-10-24T15:00:00Z')]
    const e = await getEntitlements()
    expect(e).toMatchObject({
      plan: 'free',
      provider: 'none',
      trial: { state: 'ended', endsAt: '2026-10-24T15:00:00Z' },
      limits: { people: 5 },
    })
    expect(e.capabilities.relationshipAtlas).toBe(false)
    expect(e.quotas.meeting_brief).toBe(3)
    // Reading, editing and export are never plan-gated.
    expect(e.capabilities.dataExport).toBe(true)
  })
})

describe('an account that subscribed during the trial', () => {
  it('is Pro from Stripe, and the trial reads as subscribed', async () => {
    h.subscriptions = [trialRow('2026-11-08T15:00:00Z', { stripe_subscription_id: 'sub_1' })]
    const e = await getEntitlements()
    expect(e).toMatchObject({
      plan: 'pro',
      provider: 'stripe',
      trial: { state: 'subscribed', endsAt: '2026-11-08T15:00:00Z' },
    })
  })

  it('and canceled at the end of the trial: Free, nothing charged, nothing removed', async () => {
    h.subscriptions = [
      trialRow('2026-10-24T15:00:00Z', {
        plan: 'free',
        status: 'canceled',
        stripe_subscription_id: 'sub_1',
      }),
    ]
    const e = await getEntitlements()
    expect(e).toMatchObject({ plan: 'free', trial: null, limits: { people: 5 } })
  })
})

describe('resolution between the trial and other sources', () => {
  it('the trial confers Pro only until it ends', () => {
    const trial = { endsAt: '2026-10-26T00:00:00Z' }
    expect(
      resolveEntitlement({ stripe: null, apple: null, trial, tier: 'standard', now: NOW }),
    ).toEqual({ plan: 'pro', provider: 'trial', billingProviders: [] })
    expect(
      resolveEntitlement({
        stripe: null,
        apple: null,
        trial,
        tier: 'standard',
        now: new Date('2026-10-26T00:00:00Z'),
      }),
    ).toEqual({ plan: 'free', provider: 'none', billingProviders: [] })
  })

  it('a paid source wins a tie: it is the one that bills, and deletion must stop it', () => {
    expect(
      resolveEntitlement({
        stripe: { plan: 'pro', status: 'active' },
        apple: null,
        trial: { endsAt: '2026-11-08T00:00:00Z' },
        tier: 'standard',
        now: NOW,
      }),
    ).toEqual({ plan: 'pro', provider: 'stripe', billingProviders: ['stripe'] })
  })

  it('the trial is never a billing provider', () => {
    expect(
      resolveEntitlement({
        stripe: null,
        apple: null,
        trial: { endsAt: '2026-11-08T00:00:00Z' },
        tier: 'standard',
        now: NOW,
      }).billingProviders,
    ).toEqual([])
  })
})
