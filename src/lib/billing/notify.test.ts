import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BILLING AND TRIAL EMAILS ARE SENT ONCE
 * =============================================================================
 * Stripe sends several events for one checkout within a second, handled in
 * parallel, and each can compute the same transition from the row it read. The
 * daily job can run twice (a manual run, or a duplicated cron delivery). Each
 * email carries an idempotency key, and Resend sends one email per key for 24
 * hours.
 * =============================================================================
 */

const sent = vi.hoisted(() => [] as { kind: string; idempotencyKey?: string }[])

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: 'ada@example.invalid' } } }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { preferred_name: 'Ada', full_name: 'Ada L', timezone: 'America/Chicago' },
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (m: { kind: string; idempotencyKey?: string }) => {
    sent.push({ kind: m.kind, idempotencyKey: m.idempotencyKey })
    return { ok: true, delivered: true, id: 'em_1' }
  },
}))

const { notifyBillingTransition, notifyTrial, transitionEmailKey } = await import('./notify')

beforeEach(() => {
  sent.length = 0
})

describe('the subscription confirmation', () => {
  it('two events computing the same activation carry the same key', async () => {
    const activated = { kind: 'activated' as const, firstChargeAt: '2026-11-08T15:00:00.000Z' }
    await Promise.all([
      notifyBillingTransition('u-1', activated, { subscriptionId: 'sub_1' }),
      notifyBillingTransition('u-1', activated, { subscriptionId: 'sub_1' }),
    ])
    expect(sent).toHaveLength(2)
    expect(sent.map((s) => s.idempotencyKey)).toEqual([
      'billing:sub_1:activated:2026-11-08T15:00:00.000Z',
      'billing:sub_1:activated:2026-11-08T15:00:00.000Z',
    ])
  })

  it('differs for another subscription, another transition or another date', () => {
    const a = transitionEmailKey('u-1', { kind: 'activated', firstChargeAt: null }, 'sub_1')
    expect(transitionEmailKey('u-1', { kind: 'activated', firstChargeAt: null }, 'sub_2')).not.toBe(
      a,
    )
    expect(
      transitionEmailKey(
        'u-1',
        { kind: 'cancellation_scheduled', endsAt: '2026-11-08T15:00:00Z' },
        'sub_1',
      ),
    ).not.toBe(
      transitionEmailKey(
        'u-1',
        { kind: 'cancellation_scheduled', endsAt: '2026-12-08T15:00:00Z' },
        'sub_1',
      ),
    )
    expect(transitionEmailKey('u-1', { kind: 'ended', reason: 'canceled' }, 'sub_1')).not.toBe(a)
  })
})

describe('the trial notices', () => {
  it('a second run of the daily job sends the same notice under the same key', async () => {
    await notifyTrial('u-1', 'ending', '2026-11-08T15:00:00.000Z')
    await notifyTrial('u-1', 'ending', '2026-11-08T15:00:00.000Z')
    expect(sent.map((s) => s.idempotencyKey)).toEqual([
      'trial:ending:u-1:2026-11-08T15:00:00.000Z',
      'trial:ending:u-1:2026-11-08T15:00:00.000Z',
    ])
  })
})
