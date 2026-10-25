import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { PlanId } from './plans'
import type { ApplyInput, BillingStore, CanonicalRow, ClaimResult } from './webhook'

/**
 * The webhook's store, over the service-role client.
 *
 * `stripe_events`, `claim_stripe_event` and `subscriptions.stripe_state_at`
 * arrive in migration 0021 and are not in the generated types until it is
 * applied, so those calls go through an untyped handle -- the same treatment
 * as the other not-yet-applied tables in this codebase.
 *
 * Fails closed: without the ledger, the webhook answers 500 and Stripe keeps
 * the event for retry. Billing must not run without idempotency.
 */
export function supabaseBillingStore(): BillingStore {
  const admin = createServiceRoleClient()
  const raw = admin as unknown as SupabaseClient

  return {
    async claimEvent(event): Promise<ClaimResult> {
      const { data, error } = await raw.rpc('claim_stripe_event', {
        p_id: event.id,
        p_type: event.type,
        p_livemode: event.livemode,
        p_created: new Date(event.created * 1000).toISOString(),
      })
      if (error) throw new Error(`ledger_claim_failed:${error.code ?? 'unknown'}`)
      return data as ClaimResult
    },

    async finishEvent(id, outcome) {
      const { error } = await raw
        .from('stripe_events')
        .update({
          status: outcome.status,
          processed_at: outcome.status === 'failed' ? null : new Date().toISOString(),
          user_id: outcome.userId ?? null,
          error_code: outcome.errorCode ?? null,
        })
        .eq('id', id)
      if (error) throw new Error(`ledger_finish_failed:${error.code ?? 'unknown'}`)
    },

    async getRow(userId): Promise<CanonicalRow | null> {
      const { data } = await raw
        .from('subscriptions')
        .select(
          'user_id, plan, status, cancel_at_period_end, current_period_end, is_founding, stripe_customer_id, stripe_subscription_id, trial_ends_at, stripe_state_at',
        )
        .eq('user_id', userId)
        .maybeSingle()
      if (!data) return null
      const row = data as Record<string, unknown>
      return {
        userId,
        plan: (row.plan as PlanId) ?? 'free',
        status: (row.status as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        currentPeriodEnd: (row.current_period_end as string | null) ?? null,
        isFounding: Boolean(row.is_founding),
        stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
        stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        stateAt: (row.stripe_state_at as string | null) ?? null,
      }
    },

    async findUserByCustomer(customerId) {
      const { data } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      return data?.user_id ?? null
    },

    async userExists(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error && /not.?found/i.test(error.message ?? '')) return false
      if (error) throw new Error('user_lookup_failed')
      return Boolean(data.user)
    },

    async apply(input: ApplyInput) {
      const values = {
        plan: input.state.plan,
        status: input.state.status,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        stripe_price_id: input.stripePriceId,
        current_period_end: input.state.currentPeriodEnd,
        cancel_at_period_end: input.state.cancelAtPeriodEnd,
        trial_ends_at: input.trialEndsAt,
        billing_interval: input.billingInterval,
        stripe_state_at: input.stateAt,
        ...input.founding,
      }

      // Conditional on the ordering guard, in one statement: only a read
      // newer than the one already applied may write.
      const { data: updated, error } = await raw
        .from('subscriptions')
        .update(values)
        .eq('user_id', input.userId)
        .or(`stripe_state_at.is.null,stripe_state_at.lt."${input.stateAt}"`)
        .select('user_id')
      if (error) throw new Error(`subscription_update_failed:${error.code ?? 'unknown'}`)
      if ((updated ?? []).length > 0) return 'applied'

      const { data: exists } = await raw
        .from('subscriptions')
        .select('user_id')
        .eq('user_id', input.userId)
        .maybeSingle()
      if (exists) return 'stale'

      const { error: insertError } = await raw
        .from('subscriptions')
        .insert({ user_id: input.userId, ...values })
      if (insertError) {
        // Inserted concurrently by another delivery: theirs is at least as new.
        if (insertError.code === '23505') return 'stale'
        throw new Error(`subscription_insert_failed:${insertError.code ?? 'unknown'}`)
      }
      return 'applied'
    },

    async countFounding() {
      const { count } = await admin
        .from('subscriptions')
        .select('user_id', { count: 'exact', head: true })
        .eq('is_founding', true)
      return count ?? 0
    },
  }
}
