import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * GRANTING THE TRIAL
 * =============================================================================
 * The one entitlement Atturel writes itself rather than learning from a
 * payment processor -- because no money is involved. Everything paid is
 * written by the Stripe webhook alone.
 *
 * One conditional UPDATE: only a Free row that has never had a trial or a
 * Stripe subscription becomes a trial. Postgres takes the row lock, then
 * re-checks those conditions, so of two presses at once exactly one claims
 * it and the other finds nothing to update.
 * =============================================================================
 */

export type TrialClaim = 'claimed' | 'used' | 'failed'

export async function claimTrial(userId: string, endsAt: string): Promise<TrialClaim> {
  const trial = {
    plan: 'pro' as const,
    status: 'trialing' as const,
    trial_ends_at: endsAt,
    current_period_end: endsAt,
    cancel_at_period_end: false,
  }
  const admin = createServiceRoleClient()
  const { data: claimed, error } = await admin
    .from('subscriptions')
    .update(trial)
    .eq('user_id', userId)
    .eq('plan', 'free')
    .is('trial_ends_at', null)
    .is('stripe_subscription_id', null)
    .select('user_id')
  if (error) {
    logger.error('billing.trial_claim_failed', { code: error.code })
    return 'failed'
  }
  if (claimed && claimed.length > 0) return 'claimed'

  // Every account gets a row at sign-up; one without could only predate it.
  const { data: exists } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (exists) return 'used'
  const { error: insertError } = await admin
    .from('subscriptions')
    .insert({ user_id: userId, ...trial })
  if (!insertError) return 'claimed'
  if (insertError.code === '23505') return 'used'
  logger.error('billing.trial_insert_failed', { code: insertError.code })
  return 'failed'
}
