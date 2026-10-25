import { describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../tests/stubs/fake-supabase'

/**
 * THE TRIAL-ENDING REMINDER AND THE TRIAL-ENDED NOTICE
 * =============================================================================
 * Sent from the daily follow-through job through the existing email system.
 * Only for trials that were not subscribed; each notice once, from a window
 * rather than a ledger, so only the scheduled daily run may send them.
 * =============================================================================
 */

vi.mock('server-only', () => ({}))
vi.mock('./notify', () => ({ notifyTrial: vi.fn() }))

const { sendTrialNotices, trialNoticesRun } = await import('./trial-notices')

const NOW = new Date('2026-10-25T13:00:00Z')
const HOUR = 3_600_000
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()

const trial = (user: string, endsAt: string, over: Row = {}): Row => ({
  user_id: user,
  status: 'trialing',
  stripe_subscription_id: null,
  trial_ends_at: endsAt,
  ...over,
})

describe('the daily run', () => {
  it('reminds a trial that ends in two to three days, and tells one that just ended', async () => {
    const { client, calls } = fakeClient({
      subscriptions: [
        trial('ending', at(60)),
        trial('ended', at(-5)),
        trial('later', at(10 * 24)),
        trial('today', at(5)),
      ],
    })
    const notify = vi.fn(async () => true)
    const tally = await sendTrialNotices(client, NOW, notify)

    expect(notify.mock.calls).toEqual([
      ['ending', 'ending', at(60)],
      ['ended', 'ended', at(-5)],
    ])
    expect(tally).toEqual({ ending: 1, ended: 1, charge_soon: 0, failed: 0 })
    // The query itself only asks for trials near their end.
    const ops = calls
      .find((c) => c.table === 'subscriptions')
      ?.ops.map(([op, [col]]) => `${op}:${col}`)
    expect(ops).toEqual(
      expect.arrayContaining(['eq:status', 'gt:trial_ends_at', 'lte:trial_ends_at']),
    )
  })

  it('a subscribed trial is reminded of its first charge, in the same window, once', async () => {
    const subscribed = (user: string, endsAt: string, canceled = false) =>
      trial(user, endsAt, { stripe_subscription_id: `sub_${user}`, cancel_at_period_end: canceled })
    const { client } = fakeClient({
      subscriptions: [
        subscribed('soon', at(60)),
        subscribed('canceled', at(60), true),
        subscribed('charged-today', at(-5)),
        subscribed('later', at(10 * 24)),
      ],
    })
    const notify = vi.fn(async () => true)
    expect(await sendTrialNotices(client, NOW, notify)).toEqual({
      ending: 0,
      ended: 0,
      charge_soon: 1,
      failed: 0,
    })
    // Canceled: it will not be charged. Past its end: Stripe's receipt follows.
    expect(notify.mock.calls).toEqual([['soon', 'charge_soon', at(60)]])
  })

  it('counts a failed email without stopping the others', async () => {
    const { client } = fakeClient({
      subscriptions: [trial('a', at(60)), trial('b', at(-2))],
    })
    const notify = vi.fn(async (user: string) => user !== 'a')
    expect(await sendTrialNotices(client, NOW, notify)).toEqual({
      ending: 0,
      ended: 1,
      charge_soon: 0,
      failed: 1,
    })
  })
})

describe('which runs send them', () => {
  it('the scheduled daily run', () => {
    expect(trialNoticesRun({ query: null, mode: 'daily', now: NOW })).toBe(true)
  })

  it('never a manual run, which passes ?mode=', () => {
    expect(trialNoticesRun({ query: 'daily', mode: 'daily', now: NOW })).toBe(false)
    expect(trialNoticesRun({ query: 'hourly', mode: 'hourly', now: NOW })).toBe(false)
  })

  it('only the 13:00 UTC run if the job is ever hourly', () => {
    expect(trialNoticesRun({ query: null, mode: 'hourly', now: NOW })).toBe(true)
    expect(
      trialNoticesRun({ query: null, mode: 'hourly', now: new Date('2026-10-25T14:00:00Z') }),
    ).toBe(false)
  })
})
