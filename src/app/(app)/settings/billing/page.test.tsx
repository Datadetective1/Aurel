// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../../../tests/stubs/fake-supabase'

/**
 * SETTINGS › PLAN, STATE BY STATE
 * =============================================================================
 * The real page, rendered for each point in a trial's life. What a customer
 * must always be able to see: when the trial ends, that there is no card,
 * what happens after, and -- beside the one action that subscribes -- the
 * first charge date and the monthly terms.
 * =============================================================================
 */

const h = vi.hoisted(() => ({
  entitlements: {} as Record<string, unknown>,
  row: null as Record<string, unknown> | null,
  pending: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({
  requireOnboardedUser: async () => ({
    user: { id: 'u-1' },
    profile: { timezone: 'America/Chicago' },
  }),
}))
vi.mock('@/lib/billing/entitlements', () => ({
  getEntitlements: async () => ({
    isFounding: false,
    periodStart: '2026-10-01',
    quotas: {},
    ...h.entitlements,
  }),
  usageInPeriod: async () => 0,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient({ subscriptions: h.row ? [h.row as Row] : [] }).client,
}))
vi.mock('./actions', () => ({
  foundingPlacesRemaining: async () => null,
  startCheckout: vi.fn(),
  startProTrial: vi.fn(),
  openBillingPortal: vi.fn(),
}))
vi.mock('@/lib/billing/stripe', () => ({ trialAvailable: () => true }))
vi.mock('@/lib/env', async (original) => ({
  ...(await original<typeof import('@/lib/env')>()),
  features: { billing: true, billingWebhooks: true, serviceRole: true },
}))
vi.mock('@/components/app/invitation-panel', () => ({ InvitationPanel: () => null }))
vi.mock('@/components/app/checkout-pending', () => ({
  CheckoutPending: () => {
    h.pending++
    return null
  },
}))

const { default: BillingSettingsPage } = await import('./page')

async function show(checkout?: string) {
  render(await BillingSettingsPage({ searchParams: Promise.resolve({ checkout }) }))
}

const row = (over: Row = {}): Row => ({
  user_id: 'u-1',
  status: null,
  cancel_at_period_end: false,
  current_period_end: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_ends_at: null,
  ...over,
})

const trialEnds = '2026-11-08T15:00:00Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
  h.pending = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a Free account that never had a trial', () => {
  beforeEach(() => {
    h.entitlements = { plan: 'free', tier: 'standard', provider: 'none', trial: null }
    h.row = row()
  })

  it('offers the trial first, and a separate, priced subscribe action with its terms', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Start your 14-day Pro trial' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subscribe to Pro — $29/month' })).toBeTruthy()
    expect(
      screen.getByText(/14 days of Pro, no card\. It returns to Free unless you subscribe/),
    ).toBeTruthy()
    expect(
      screen.getByText(/You will be charged \$29 today, then \$29 every month until you cancel\./),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Manage billing/ })).toBeNull()
  })
})

describe('during the trial', () => {
  beforeEach(() => {
    h.entitlements = {
      plan: 'pro',
      tier: 'standard',
      provider: 'trial',
      trial: { state: 'active', endsAt: trialEnds },
    }
    h.row = row({
      status: 'trialing',
      current_period_end: trialEnds,
      trial_ends_at: trialEnds,
    })
  })

  it('names the end date, the days left, no card, and the return to Free', async () => {
    await show()
    expect(screen.getByText('Pro trial')).toBeTruthy()
    expect(
      screen.getByText(
        'Your 14-day trial ends on 8 Nov 2026 (14 days left). No card, nothing charged.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /When it ends your account returns to Free, unless you subscribe\. Nothing is deleted/,
      ),
    ).toBeTruthy()
    // Not "$29 per month" beside the name: nothing is being billed.
    expect(screen.queryByText('$29 per month')).toBeNull()
  })

  it('subscribing shows the first charge date and keeps the rest of the trial', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Subscribe to Pro — $29/month' })).toBeTruthy()
    expect(
      screen.getByText(
        'The rest of your trial is kept. Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start your 14-day/ })).toBeNull()
  })

  it('offers no Manage billing: the trial has nothing at Stripe to manage', async () => {
    await show()
    expect(screen.queryByRole('button', { name: /Manage billing/ })).toBeNull()
  })

  it('back from Checkout before the webhook lands: waits for Stripe, and checks', async () => {
    await show('success')
    expect(screen.getByText(/Your subscription starts as soon as Stripe confirms it/)).toBeTruthy()
    expect(h.pending).toBe(1)
  })
})

describe('the trial ended without a subscription', () => {
  it('is Free: nothing charged, nothing deleted, no second trial', async () => {
    h.entitlements = {
      plan: 'free',
      tier: 'standard',
      provider: 'none',
      trial: { state: 'ended', endsAt: '2026-10-20T15:00:00Z' },
    }
    h.row = row({ status: 'trialing', trial_ends_at: '2026-10-20T15:00:00Z' })
    await show()
    expect(
      screen.getByText(/Your Pro trial ended on 20 Oct 2026\. Nothing was charged\./),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start your 14-day/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Subscribe to Pro — $29/month' })).toBeTruthy()
    expect(screen.getByText(/charged \$29 today/)).toBeTruthy()
  })
})

describe('subscribed during the trial', () => {
  beforeEach(() => {
    h.entitlements = {
      plan: 'pro',
      tier: 'standard',
      provider: 'stripe',
      trial: { state: 'subscribed', endsAt: trialEnds },
    }
    h.row = row({
      status: 'trialing',
      current_period_end: trialEnds,
      trial_ends_at: trialEnds,
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    })
  })

  it('names the first charge, offers Manage billing, and no second subscribe', async () => {
    await show()
    expect(
      screen.getByText(
        'Subscribed. Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('$29 per month')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Manage billing/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Subscribe to Pro/ })).toBeNull()
  })

  it('back from Checkout: confirmed', async () => {
    await show('success')
    expect(screen.getByText('Thank you. You are subscribed to Pro.')).toBeTruthy()
    expect(h.pending).toBe(0)
  })
})

describe('owner and pilot accounts', () => {
  it('are offered neither the trial nor a subscription', async () => {
    h.entitlements = { plan: 'free', tier: 'pilot', provider: 'manual', trial: null }
    h.row = row()
    await show()
    expect(screen.queryByRole('button', { name: /Start your 14-day|Subscribe to Pro/ })).toBeNull()
  })
})
