import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * STARTING THE TRIAL, AND SUBSCRIBING DURING IT
 * =============================================================================
 * The two server actions behind "Start your 14-day Pro trial" and "Subscribe
 * to Pro — $29/month", against an in-memory `subscriptions` table that
 * applies a conditional UPDATE the way Postgres does (filters, then write,
 * as one step). Stripe is a fake that records what it was asked.
 *
 * What must hold:
 *   - one trial per account: starting twice, or twice at once, starts one;
 *   - the trial never touches Stripe and never asks for a card;
 *   - subscribing during the trial keeps the rest of it (`trial_end`) and
 *     shows the first charge date and the monthly terms on Stripe's page;
 *   - after the trial, subscribing charges today and says so.
 * The real UPDATE is also run against Postgres 16 under two concurrent
 * sessions; see the PR's verification notes.
 * =============================================================================
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  subscriptions: [] as Record<string, unknown>[],
  timezone: 'America/Chicago',
  tier: 'standard' as string,
  configured: true,
}))

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}

/** A query builder over `h.subscriptions` with Postgres's update semantics. */
function table(name: string) {
  const filters: [string, string, unknown][] = []
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  let values: Row = {}
  const rows = (): Row[] =>
    name === 'profiles'
      ? [{ id: 'u-1', timezone: h.timezone }]
      : (h.subscriptions as Row[]).filter((r) =>
          filters.every(([, column, value]) => (r[column] ?? null) === value),
        )
  const run = (): { data: unknown; error: unknown } => {
    if (op === 'update') {
      const hit = rows()
      for (const r of hit) Object.assign(r, values)
      return { data: hit.map((r) => ({ user_id: r.user_id })), error: null }
    }
    if (op === 'insert') {
      if ((h.subscriptions as Row[]).some((r) => r.user_id === values.user_id)) {
        return { data: null, error: { code: '23505' } }
      }
      h.subscriptions.push({ ...values })
      return { data: null, error: null }
    }
    if (op === 'upsert') {
      const found = (h.subscriptions as Row[]).find((r) => r.user_id === values.user_id)
      if (found) Object.assign(found, values)
      else h.subscriptions.push({ ...values })
      return { data: null, error: null }
    }
    return { data: rows(), error: null }
  }
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => (filters.push(['eq', column, value]), chain),
    is: (column: string, value: unknown) => (filters.push(['is', column, value]), chain),
    update: (v: Row) => ((op = 'update'), (values = v), chain),
    insert: (v: Row) => ((op = 'insert'), (values = v), chain),
    upsert: (v: Row) => ((op = 'upsert'), (values = v), chain),
    maybeSingle: async () => {
      const { data } = run()
      return { data: (data as Row[])[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return chain
}

const client = { from: (name: string) => table(name) }

const stripeFake = {
  prices: {
    retrieve: vi.fn(async () => ({
      id: 'price_pro',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 2900,
      recurring: { interval: 'month', interval_count: 1 },
    })),
  },
  customers: { create: vi.fn(async () => ({ id: 'cus_new' })) },
  subscriptions: { list: vi.fn(async () => ({ data: [] as { status: string }[] })) },
  checkout: {
    sessions: {
      create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/s' })),
      list: vi.fn(
        async (_params?: {
          customer: string
          status: string
          limit: number
        }): Promise<{
          data: { id: string; url: string | null; metadata: Record<string, string> }[]
        }> => ({ data: [] }),
      ),
      expire: vi.fn(async (_id: string) => ({})),
    },
  },
}

const notifyTrial = vi.fn(async () => true)
const track = vi.fn(async () => {})

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url)
  },
}))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'u-1', email: 'qa@example.com' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => client,
  createServiceRoleClient: () => client,
}))
vi.mock('@/lib/env', async (original) => ({
  ...(await original<typeof import('@/lib/env')>()),
  features: { billing: true, billingWebhooks: true, serviceRole: true },
}))
vi.mock('@/lib/billing/stripe', async (original) => ({
  ...(await original<typeof import('@/lib/billing/stripe')>()),
  stripe: () => stripeFake,
  expireOpenCheckouts: async (customer: string) => {
    const open = await stripeFake.checkout.sessions.list({ customer, status: 'open', limit: 10 })
    for (const session of open.data) await stripeFake.checkout.sessions.expire(session.id)
  },
  proPriceId: () => (h.configured ? 'price_pro' : null),
  checkoutAvailable: () => h.configured,
  trialOfferOpen: () => h.configured,
}))
vi.mock('@/lib/billing/notify', () => ({
  notifyTrial: (...a: unknown[]) => notifyTrial(...(a as [])),
}))
vi.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => track(...(a as [])) }))
vi.mock('@/lib/billing/entitlements', async () => {
  const { resolveEntitlement } = await import('@/lib/billing/sources')
  const { isAppTrial, trialState } = await import('@/lib/billing/trial')
  return {
    getEntitlements: async () => {
      const row = (h.subscriptions as Row[]).find((r) => r.user_id === 'u-1')
      const trialRow = row
        ? {
            status: (row.status as string) ?? null,
            trialEndsAt: (row.trial_ends_at as string) ?? null,
            stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
          }
        : null
      const app = isAppTrial(trialRow)
      const resolved = resolveEntitlement({
        stripe:
          row && !app
            ? { plan: row.plan as 'free' | 'pro', status: (row.status as string) ?? null }
            : null,
        apple: null,
        trial: app && trialRow?.trialEndsAt ? { endsAt: trialRow.trialEndsAt } : null,
        tier: h.tier as 'standard',
      })
      const state = trialState(trialRow)
      return {
        plan: resolved.plan,
        tier: h.tier,
        provider: resolved.provider,
        trial: state && trialRow?.trialEndsAt ? { state, endsAt: trialRow.trialEndsAt } : null,
      }
    },
  }
})

const { startProTrial, startCheckout } = await import('./actions')

const NOW = new Date('2026-10-25T15:00:00Z')
const freeRow = (over: Row = {}): Row => ({
  user_id: 'u-1',
  plan: 'free',
  status: null,
  trial_ends_at: null,
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  ...over,
})
const sub = () => h.subscriptions[0] as Row
const start = () => startProTrial({}, new FormData())
const subscribe = async () => {
  try {
    return { state: await startCheckout({}, new FormData()), url: null as string | null }
  } catch (error) {
    if (error instanceof RedirectSignal) return { state: null, url: error.url }
    throw error
  }
}
interface SessionParams {
  mode: string
  adaptive_pricing: { enabled: boolean }
  metadata: Record<string, string>
  line_items: unknown
  subscription_data: { metadata: Record<string, string>; trial_end?: number }
  custom_text: { submit: { message: string } }
}
const stripeCalls = () =>
  stripeFake.prices.retrieve.mock.calls.length +
  stripeFake.customers.create.mock.calls.length +
  stripeFake.subscriptions.list.mock.calls.length +
  stripeFake.checkout.sessions.create.mock.calls.length
const sessionParams = () =>
  (stripeFake.checkout.sessions.create.mock.calls.at(-1) as unknown as [SessionParams])[0]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.subscriptions = [freeRow()]
  h.tier = 'standard'
  h.configured = true
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('starting the trial', () => {
  it('starts 14 days of Pro with no card and nothing at Stripe', async () => {
    expect(await start()).toEqual({
      message: 'Your 14-day Pro trial is on. No card, nothing charged.',
    })
    expect(sub()).toMatchObject({
      // `plan` is what is paid for: a trial keeps Free there.
      plan: 'free',
      status: 'trialing',
      trial_ends_at: '2026-11-08T15:00:00.000Z',
      current_period_end: '2026-11-08T15:00:00.000Z',
      stripe_subscription_id: null,
      stripe_customer_id: null,
    })
    expect(stripeCalls()).toBe(0)
    expect(notifyTrial).toHaveBeenCalledExactlyOnceWith(
      'u-1',
      'started',
      '2026-11-08T15:00:00.000Z',
    )
    expect(track).toHaveBeenCalledWith('trial_started', {})
  })

  it('starting twice starts one trial, and the second press says why', async () => {
    await start()
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    expect(await start()).toEqual({ error: 'Your Pro trial is already on.' })
    expect(sub().trial_ends_at).toBe('2026-11-08T15:00:00.000Z')
    expect(notifyTrial).toHaveBeenCalledTimes(1)
  })

  it('two presses at once start one trial: the conditional update takes one', async () => {
    const results = await Promise.all([start(), start()])
    expect(results.filter((r) => r.message)).toHaveLength(1)
    expect(results.filter((r) => r.error)).toEqual([
      { error: 'This account has already had its Pro trial.' },
    ])
    expect(notifyTrial).toHaveBeenCalledTimes(1)
  })

  it('an account whose trial ended cannot start another', async () => {
    h.subscriptions = [freeRow({ status: 'trialing', trial_ends_at: '2026-10-20T15:00:00Z' })]
    expect(await start()).toEqual({
      error: 'This account has already had its Pro trial. Subscribe to Pro to keep using it.',
    })
    expect(sub().trial_ends_at).toBe('2026-10-20T15:00:00Z')
  })

  it('an account that has had a subscription cannot start one', async () => {
    h.subscriptions = [freeRow({ status: 'canceled', stripe_subscription_id: 'sub_old' })]
    expect((await start()).error).toMatch(/has had a subscription/)
    expect(sub().plan).toBe('free')
  })

  it('a paying account is refused, and nothing changes', async () => {
    h.subscriptions = [freeRow({ plan: 'pro', status: 'active', stripe_subscription_id: 'sub_1' })]
    expect(await start()).toEqual({ error: 'This account is already on Pro.' })
    expect(sub()).toMatchObject({ status: 'active', trial_ends_at: null })
  })

  it('owner and pilot accounts are refused: they already have everything', async () => {
    h.tier = 'pilot'
    expect(await start()).toEqual({ error: 'Your account already has full access.' })
    expect(sub().plan).toBe('free')
  })

  it('is not offered where subscribing does not work, so it can always end in a choice', async () => {
    h.configured = false
    expect((await start()).error).toMatch(/not available/)
    expect(sub().plan).toBe('free')
  })

  it('closes a Checkout opened before the trial, so a forgotten tab cannot charge today', async () => {
    sub().stripe_customer_id = 'cus_1'
    stripeFake.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        { id: 'cs_before', url: 'https://checkout.stripe.test/before', metadata: { terms: 'now' } },
      ],
    })
    expect((await start()).message).toBeTruthy()
    expect(stripeFake.checkout.sessions.expire).toHaveBeenCalledExactlyOnceWith('cs_before')
    // Still nothing created at Stripe.
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripeFake.customers.create).not.toHaveBeenCalled()
  })

  it('a Stripe failure while closing old Checkouts does not undo the trial', async () => {
    sub().stripe_customer_id = 'cus_1'
    stripeFake.checkout.sessions.list.mockRejectedValueOnce(new Error('stripe down'))
    expect((await start()).message).toBeTruthy()
    expect(sub()).toMatchObject({ status: 'trialing' })
  })

  it('an account that predates the sign-up row gets one, once', async () => {
    h.subscriptions = []
    expect((await start()).message).toBeTruthy()
    expect(h.subscriptions).toHaveLength(1)
    expect(await start()).toEqual({ error: 'Your Pro trial is already on.' })
  })
})

describe('subscribing during the trial', () => {
  beforeEach(async () => {
    await start()
    vi.clearAllMocks()
  })

  it('keeps the rest of the trial: the first charge is when it ends', async () => {
    vi.setSystemTime(new Date('2026-10-28T15:00:30Z'))
    const { url } = await subscribe()
    expect(url).toBe('https://checkout.stripe.test/s')
    const params = sessionParams()
    expect(params.subscription_data).toEqual({
      metadata: { user_id: 'u-1' },
      trial_end: Math.floor(Date.parse('2026-11-08T15:00:00Z') / 1000),
    })
    expect(params.mode).toBe('subscription')
    expect(params.line_items).toEqual([{ price: 'price_pro', quantity: 1 }])
  })

  it('shows the first charge date and the monthly terms beside Stripe’s button', async () => {
    await subscribe()
    expect(sessionParams().custom_text).toEqual({
      submit: {
        message:
          'Nothing is charged today. Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel.',
      },
    })
  })

  it('in the last two days, the first charge is Checkout’s minimum, a little after the trial', async () => {
    vi.setSystemTime(new Date('2026-11-07T15:00:00Z'))
    await subscribe()
    const trialEnd = sessionParams().subscription_data.trial_end as number
    const nowS = Date.parse('2026-11-07T15:00:00Z') / 1000
    expect(trialEnd - nowS).toBeGreaterThanOrEqual(48 * 3600)
    expect(trialEnd - nowS).toBeLessThanOrEqual(48 * 3600 + 600)
    expect(sessionParams().custom_text.submit.message).toContain(
      'first charge of $29 is on 9 Nov 2026',
    )
  })

  it('does not change the trial row: only the webhook records a subscription', async () => {
    const before = { ...sub() }
    await subscribe()
    expect(sub()).toEqual({ ...before, stripe_customer_id: 'cus_new' })
  })

  it('is refused if Stripe already has a live subscription for the customer', async () => {
    sub().stripe_customer_id = 'cus_1'
    stripeFake.subscriptions.list.mockResolvedValueOnce({ data: [{ status: 'trialing' }] })
    const { state } = await subscribe()
    expect(state?.error).toMatch(/already has a subscription/)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe('one open Checkout per customer, so no duplicate subscription', () => {
  beforeEach(async () => {
    await start()
    sub().stripe_customer_id = 'cus_1'
    vi.clearAllMocks()
  })

  it('a second press on the same terms reuses the open session instead of opening another', async () => {
    await subscribe()
    const created = sessionParams()
    stripeFake.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        {
          id: 'cs_1',
          url: 'https://checkout.stripe.test/existing',
          metadata: created.metadata as Record<string, string>,
        },
      ],
    })
    const { url } = await subscribe()
    expect(url).toBe('https://checkout.stripe.test/existing')
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
    expect(stripeFake.checkout.sessions.expire).not.toHaveBeenCalled()
  })

  it('an open session on other terms is expired before a new one opens', async () => {
    stripeFake.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        { id: 'cs_old', url: 'https://checkout.stripe.test/old', metadata: { terms: 'now' } },
        { id: 'cs_legacy', url: 'https://checkout.stripe.test/legacy', metadata: {} },
      ],
    })
    const { url } = await subscribe()
    expect(stripeFake.checkout.sessions.expire.mock.calls.map((c) => c[0])).toEqual([
      'cs_old',
      'cs_legacy',
    ])
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
    expect(url).toBe('https://checkout.stripe.test/s')
  })

  it('charges in the currency the terms state: no Adaptive Pricing conversion', async () => {
    await subscribe()
    expect(sessionParams().adaptive_pricing).toEqual({ enabled: false })
  })

  it('records the terms on the session, so a later press can tell', async () => {
    await subscribe()
    expect(sessionParams().metadata).toEqual({
      user_id: 'u-1',
      terms: '2026-11-08T15:00:00.000Z',
      price_id: 'price_pro',
    })
  })
})

describe('subscribing without a trial running', () => {
  it('after the trial ended: charged today, and Checkout says so', async () => {
    h.subscriptions = [freeRow({ status: 'trialing', trial_ends_at: '2026-10-20T15:00:00Z' })]
    const { url } = await subscribe()
    expect(url).toBeTruthy()
    expect(sessionParams().subscription_data).toEqual({ metadata: { user_id: 'u-1' } })
    expect(sessionParams().custom_text.submit.message).toBe(
      'You will be charged $29 today, then $29 every month until you cancel.',
    )
  })

  it('never on Free without asking: a plain Free account is charged today, with the terms shown', async () => {
    await subscribe()
    expect(sessionParams().subscription_data.trial_end).toBeUndefined()
    expect(sessionParams().custom_text.submit.message).toMatch(/charged \$29 today/)
  })

  it('a paying account is sent to Manage billing instead', async () => {
    h.subscriptions = [freeRow({ plan: 'pro', status: 'active', stripe_subscription_id: 'sub_1' })]
    const { state } = await subscribe()
    expect(state?.error).toMatch(/already on Pro/)
    expect(stripeCalls()).toBe(0)
  })
})
