import type { AppleSubscriptionRow } from './subscriptions'

/**
 * Reading an account's own App Store subscriptions (user-scoped, RLS
 * read-own). Shared by entitlements and the account screen; no server-only
 * import, so it is safe in pure code and tests.
 */
export const APPLE_SUBSCRIPTION_COLUMNS_USER =
  'original_transaction_id, user_id, product_id, latest_transaction_id, latest_purchase_at, environment, expires_at, revoked_at, auto_renew, grace_period_expires_at, renewal_state_at'

const toIso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null)

export function appleRowsFromDb(rows: Record<string, unknown>[]): AppleSubscriptionRow[] {
  return rows.map((data) => ({
    originalTransactionId: String(data.original_transaction_id),
    userId: String(data.user_id),
    productId: String(data.product_id),
    latestTransactionId: String(data.latest_transaction_id),
    latestPurchaseAt: toIso(data.latest_purchase_at) as string,
    environment: data.environment as AppleSubscriptionRow['environment'],
    expiresAt: toIso(data.expires_at),
    revokedAt: toIso(data.revoked_at),
    autoRenew: typeof data.auto_renew === 'boolean' ? data.auto_renew : null,
    gracePeriodExpiresAt: toIso(data.grace_period_expires_at),
    renewalStateAt: toIso(data.renewal_state_at),
    ...(typeof data.version === 'number' ? { version: data.version } : {}),
  }))
}
