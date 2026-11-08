import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { AppleStore, ClaimResult } from './process'
import type { AppleSubscriptionRow } from './subscriptions'
import { APPLE_SUBSCRIPTION_COLUMNS_USER, appleRowsFromDb } from './read'

/**
 * The App Store store, over the service-role client.
 *
 * `app_store_subscriptions`, `app_store_notifications` and
 * `claim_app_store_notification` arrive in migration 0025 and are not in the
 * generated types until it is applied, so calls go through an untyped handle
 * (the same treatment as 0021's billing tables).
 *
 * Fails closed: without the tables, the routes answer 500 / 503, the app
 * keeps the transaction unfinished, and Apple keeps the notification for
 * retry. Nothing is granted without a written row.
 */

const COLUMNS = `${APPLE_SUBSCRIPTION_COLUMNS_USER}, version`

function rowToDb(row: AppleSubscriptionRow) {
  return {
    product_id: row.productId,
    latest_transaction_id: row.latestTransactionId,
    latest_purchase_at: row.latestPurchaseAt,
    environment: row.environment,
    expires_at: row.expiresAt,
    revoked_at: row.revokedAt,
    auto_renew: row.autoRenew,
    grace_period_expires_at: row.gracePeriodExpiresAt,
    renewal_state_at: row.renewalStateAt,
  }
}

export function supabaseAppleStore(): AppleStore {
  const admin = createServiceRoleClient()
  const raw = admin as unknown as SupabaseClient

  return {
    async getByOriginal(id) {
      const { data, error } = await raw
        .from('app_store_subscriptions')
        .select(COLUMNS)
        .eq('original_transaction_id', id)
        .maybeSingle()
      if (error) throw new Error(`apple_read_failed:${error.code ?? 'unknown'}`)
      return data ? (appleRowsFromDb([data as Record<string, unknown>])[0] ?? null) : null
    },

    async save(next, previous) {
      if (!previous) {
        const { error } = await raw.from('app_store_subscriptions').insert({
          original_transaction_id: next.originalTransactionId,
          user_id: next.userId,
          ...rowToDb(next),
        })
        if (!error) return true
        // Inserted concurrently: re-read and merge again.
        if (error.code === '23505') return false
        throw new Error(`apple_insert_failed:${error.code ?? 'unknown'}`)
      }
      const version = previous.version ?? 1
      const { data, error } = await raw
        .from('app_store_subscriptions')
        .update({ ...rowToDb(next), version: version + 1 })
        .eq('original_transaction_id', previous.originalTransactionId)
        .eq('user_id', previous.userId)
        .eq('version', version)
        .select('original_transaction_id')
      if (error) throw new Error(`apple_update_failed:${error.code ?? 'unknown'}`)
      return (data ?? []).length > 0
    },

    async userExists(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error && /not.?found/i.test(error.message ?? '')) return false
      if (error) throw new Error('user_lookup_failed')
      return Boolean(data.user)
    },

    async claimNotification(n): Promise<ClaimResult> {
      const { data, error } = await raw.rpc('claim_app_store_notification', {
        p_id: n.id,
        p_type: n.type,
        p_subtype: n.subtype,
        p_environment: n.environment,
        p_signed: n.signedAt,
      })
      if (error) throw new Error(`apple_ledger_claim_failed:${error.code ?? 'unknown'}`)
      return data as ClaimResult
    },

    async finishNotification(id, outcome) {
      const { error } = await raw
        .from('app_store_notifications')
        .update({
          status: outcome.status,
          processed_at: outcome.status === 'failed' ? null : new Date().toISOString(),
          user_id: outcome.userId ?? null,
          original_transaction_id: outcome.originalTransactionId ?? null,
          error_code: outcome.errorCode ?? null,
        })
        .eq('id', id)
      if (error) throw new Error(`apple_ledger_finish_failed:${error.code ?? 'unknown'}`)
    },
  }
}
