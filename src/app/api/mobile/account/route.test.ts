import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient } from '../../../../../tests/stubs/fake-supabase'

/**
 * THE IPHONE'S ACCOUNT RESPONSE: PLAN AND ACCESS ONLY
 * =============================================================================
 * The plan line uses the website's own words and dates (account zone), and
 * `billing` says where it is managed -- `trial` for the 14-day trial, which
 * bills nothing. No purchase or payment link is ever sent (owner decision 3).
 * =============================================================================
 */

const h = vi.hoisted(() => ({
  entitlements: {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/server', () => ({
  bearerToken: async () => 'a.b.c',
  createClient: async () => fakeClient({ integration_accounts: [] }).client,
}))
vi.mock('@/lib/auth', () => ({
  getOptionalUser: async () => ({ id: 'u-1', email: 'qa@example.com' }),
  getProfile: async () => ({
    id: 'u-1',
    full_name: 'QA',
    preferred_name: null,
    timezone: 'America/Chicago',
    demo_seeded_at: null,
  }),
}))
vi.mock('@/lib/billing/entitlements', () => ({
  getEntitlements: async () => ({
    periodStart: '2026-10-01',
    quotas: { transcription_seconds: 3600 },
    capabilities: { calendarIntegration: true },
    ...h.entitlements,
  }),
  usageInPeriod: async () => 0,
}))
vi.mock('@/lib/account/deletion.server', () => ({ deleteCurrentAccount: vi.fn() }))

const { GET } = await import('./route')

async function account() {
  const response = await GET()
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
})

describe('GET /api/mobile/account: the plan', () => {
  it('on the trial: its end date in the account’s zone, and nothing billed', async () => {
    h.entitlements = {
      plan: 'pro',
      tier: 'standard',
      provider: 'trial',
      trial: { state: 'active', endsAt: '2026-11-09T03:00:00Z' },
    }
    const body = await account()
    expect(body).toMatchObject({
      planLabel: 'Pro trial · ends 8 Nov 2026',
      billing: 'trial',
      trial: { state: 'active', endsAt: '2026-11-09T03:00:00Z' },
    })
  })

  it('after the trial ended unsubscribed: Free, nothing billed', async () => {
    h.entitlements = {
      plan: 'free',
      tier: 'standard',
      provider: 'none',
      trial: { state: 'ended', endsAt: '2026-10-20T15:00:00Z' },
    }
    expect(await account()).toMatchObject({ planLabel: 'Free', billing: 'none' })
  })

  it('subscribed during the trial: the first charge date, billed on the web', async () => {
    h.entitlements = {
      plan: 'pro',
      tier: 'standard',
      provider: 'stripe',
      trial: { state: 'subscribed', endsAt: '2026-11-08T15:00:00Z' },
    }
    expect(await account()).toMatchObject({
      planLabel: 'Pro · first charge 8 Nov 2026',
      billing: 'web',
    })
  })

  it('paying, pilot and Free read as before', async () => {
    h.entitlements = { plan: 'pro', tier: 'standard', provider: 'stripe', trial: null }
    expect(await account()).toMatchObject({ planLabel: 'Pro', billing: 'web', trial: null })
    h.entitlements = { plan: 'free', tier: 'pilot', provider: 'manual', trial: null }
    expect(await account()).toMatchObject({ planLabel: 'Full access', billing: 'included' })
    h.entitlements = { plan: 'free', tier: 'standard', provider: 'none' }
    expect(await account()).toMatchObject({ planLabel: 'Free', billing: 'none', trial: null })
  })

  it('never carries a purchase or payment link', async () => {
    h.entitlements = {
      plan: 'pro',
      tier: 'standard',
      provider: 'trial',
      trial: { state: 'active', endsAt: '2026-11-08T15:00:00Z' },
    }
    const raw = JSON.stringify(await account())
    expect(raw).not.toMatch(/checkout|stripe|subscribe|\/settings\/billing|\$29/i)
  })
})
