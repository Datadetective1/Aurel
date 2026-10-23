import { describe, expect, it } from 'vitest'
import {
  deleteAccountCore,
  type BillingSnapshot,
  type DeletionDeps,
  type StripeOps,
} from './deletion'

/**
 * Account deletion's order of operations: billing is provably stopped before
 * anything irreversible happens, for every kind of account.
 */

const USER = '22222222-2222-4222-8222-222222222222'

function harness(
  billing: Partial<BillingSnapshot>,
  opts: {
    stripe?: Partial<StripeOps> | null
    failData?: boolean
    failLogin?: boolean
    failAudit?: boolean
  } = {},
) {
  const calls: string[] = []
  const audits: unknown[] = []
  const stripe: StripeOps = {
    async expireOpenCheckouts() {
      calls.push('expire_checkouts')
      return 1
    },
    async listBillableSubscriptions() {
      calls.push('list_subscriptions')
      return [{ id: 'sub_1', status: 'active' }]
    },
    async cancelSubscription(id) {
      calls.push(`cancel:${id}`)
      return { status: 'canceled' }
    },
    async listOpenInvoices() {
      calls.push('list_invoices')
      return [{ id: 'in_1' }]
    },
    async voidInvoice(id) {
      calls.push(`void:${id}`)
    },
    ...(opts.stripe ?? {}),
  }
  const deps: DeletionDeps = {
    async loadBilling() {
      return {
        plan: 'free',
        tier: 'standard',
        stripeCustomerId: null,
        appleActive: false,
        ...billing,
      }
    },
    stripe: opts.stripe === null ? null : stripe,
    audit: {
      async record(row) {
        calls.push('audit')
        if (opts.failAudit) throw new Error('no table')
        audits.push(row)
        return 'audit_1'
      },
      async mark(_id, field) {
        calls.push(`mark:${field}`)
      },
    },
    async deleteData() {
      calls.push('delete_data')
      return !opts.failData
    },
    async deleteLogin() {
      calls.push('delete_login')
      return !opts.failLogin
    },
  }
  return { deps, calls, audits }
}

describe('a free account', () => {
  it('is deleted without touching billing', async () => {
    const { deps, calls, audits } = harness({})
    const result = await deleteAccountCore({ userId: USER, via: 'web' }, deps)
    expect(result).toEqual({ ok: true, loginDeleted: true })
    expect(calls).toEqual([
      'audit',
      'delete_data',
      'mark:data_deleted_at',
      'delete_login',
      'mark:auth_deleted_at',
    ])
    expect(audits[0]).toMatchObject({ billing_provider: 'none', billing_outcome: 'none' })
  })

  it('a pilot or owner account with no billing is deleted the same way', async () => {
    const { deps, audits } = harness({ tier: 'pilot' })
    expect((await deleteAccountCore({ userId: USER, via: 'ios' }, deps)).ok).toBe(true)
    expect(audits[0]).toMatchObject({ access_tier_at_deletion: 'pilot', requested_via: 'ios' })
  })
})

describe('an active Stripe subscriber', () => {
  it('has billing stopped before any data is deleted', async () => {
    const { deps, calls, audits } = harness({ plan: 'pro', stripeCustomerId: 'cus_1' })
    const result = await deleteAccountCore({ userId: USER, via: 'web' }, deps)
    expect(result.ok).toBe(true)
    expect(calls.indexOf('cancel:sub_1')).toBeLessThan(calls.indexOf('delete_data'))
    expect(calls.indexOf('expire_checkouts')).toBeLessThan(calls.indexOf('cancel:sub_1'))
    expect(calls).toContain('void:in_1')
    expect(audits[0]).toMatchObject({
      billing_provider: 'stripe',
      stripe_customer_id: 'cus_1',
      stripe_subscriptions_canceled: ['sub_1'],
      stripe_invoices_voided: ['in_1'],
      billing_outcome: 'canceled',
    })
  })

  it('keeps everything when the cancellation fails, and says so', async () => {
    const { deps, calls } = harness(
      { plan: 'pro', stripeCustomerId: 'cus_1' },
      {
        stripe: {
          cancelSubscription: async () => {
            throw new Error('network')
          },
        },
      },
    )
    const result = await deleteAccountCore({ userId: USER, via: 'web' }, deps)
    expect(result).toMatchObject({ ok: false, stage: 'billing' })
    expect(calls).not.toContain('delete_data')
    expect(calls).not.toContain('delete_login')
  })

  it('keeps everything when Stripe does not confirm the cancellation', async () => {
    const { deps, calls } = harness(
      { plan: 'pro', stripeCustomerId: 'cus_1' },
      { stripe: { cancelSubscription: async () => ({ status: 'active' }) } },
    )
    expect((await deleteAccountCore({ userId: USER, via: 'web' }, deps)).ok).toBe(false)
    expect(calls).not.toContain('delete_data')
  })

  it('refuses when billing cannot be reached at all', async () => {
    const { deps, calls } = harness({ plan: 'pro', stripeCustomerId: 'cus_1' }, { stripe: null })
    expect(await deleteAccountCore({ userId: USER, via: 'web' }, deps)).toMatchObject({
      ok: false,
      stage: 'billing',
    })
    expect(calls).not.toContain('delete_data')
  })
})

describe('a canceled Stripe customer', () => {
  it('is deleted, with nothing left to cancel recorded as already inactive', async () => {
    const { deps, calls, audits } = harness(
      { stripeCustomerId: 'cus_1' },
      { stripe: { listBillableSubscriptions: async () => [], listOpenInvoices: async () => [] } },
    )
    expect((await deleteAccountCore({ userId: USER, via: 'web' }, deps)).ok).toBe(true)
    expect(calls.some((c) => c.startsWith('cancel:'))).toBe(false)
    expect(audits[0]).toMatchObject({ billing_outcome: 'already_inactive' })
  })
})

describe('the audit and the data steps', () => {
  it('still deletes when the audit row cannot be written', async () => {
    const { deps, calls } = harness({ plan: 'pro', stripeCustomerId: 'cus_1' }, { failAudit: true })
    expect((await deleteAccountCore({ userId: USER, via: 'web' }, deps)).ok).toBe(true)
    expect(calls).toContain('delete_data')
  })

  it('tells a cancelled subscriber their billing stopped even if the data step failed', async () => {
    const { deps } = harness({ plan: 'pro', stripeCustomerId: 'cus_1' }, { failData: true })
    const result = await deleteAccountCore({ userId: USER, via: 'web' }, deps)
    expect(result).toMatchObject({ ok: false, stage: 'data' })
    if (!result.ok) expect(result.message).toMatch(/cancelled/)
  })
})

describe('an App Store subscriber (future)', () => {
  it('is not deleted until they confirm they cancelled with Apple', async () => {
    const { deps, calls } = harness({ plan: 'pro', appleActive: true })
    const result = await deleteAccountCore({ userId: USER, via: 'ios' }, deps)
    expect(result).toMatchObject({ ok: false, stage: 'apple_acknowledgement' })
    expect(calls).toEqual([])
  })

  it('is deleted after confirming, with no Stripe logic applied', async () => {
    const { deps, calls, audits } = harness({ plan: 'pro', appleActive: true })
    const result = await deleteAccountCore(
      { userId: USER, via: 'ios', appleAcknowledged: true },
      deps,
    )
    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.startsWith('cancel:') || c === 'list_subscriptions')).toBe(false)
    expect(audits[0]).toMatchObject({
      billing_provider: 'apple',
      billing_outcome: 'apple_user_managed',
    })
  })
})

describe('a login that cannot be deleted', () => {
  it('is reported as unfinished, with the support address, never as success', async () => {
    const { deps } = harness({}, { failLogin: true })
    const result = await deleteAccountCore({ userId: USER, via: 'web' }, deps)
    expect(result).toMatchObject({ ok: false, stage: 'login' })
    expect(result.ok ? '' : result.message).toMatch(/support@/)
  })
})
