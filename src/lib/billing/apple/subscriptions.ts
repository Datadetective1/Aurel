import type { PlanId } from '../plans'
import type { ProviderState } from '../sources'

/**
 * APP STORE SUBSCRIPTIONS, AS ATTUREL HOLDS THEM
 * =============================================================================
 * Pure rules over the `app_store_subscriptions` row: one row per Apple
 * subscription (its originalTransactionId), bound to exactly one Atturel
 * account and never moved to another.
 *
 * Access is derived from DATES, not from a stored status, so a notification
 * that never arrives cannot leave someone entitled forever:
 *
 *   revoked (refund, or Family Sharing removed)   -> no access
 *   now < expires_at                              -> 'active'
 *   now < grace_period_expires_at                 -> 'past_due' (Apple is
 *                                                    retrying the card; same
 *                                                    rule as Stripe's past_due)
 *   otherwise                                     -> 'expired'
 *
 * Ordering: transactions are compared by purchase date (a renewal is always
 * a newer purchase), renewal info by its signedDate. An older transaction or
 * an older renewal record never overwrites a newer one, whatever order Apple
 * delivers them in.
 * =============================================================================
 */

export const APPLE_BUNDLE_ID = 'com.atturel.app'

/** App Store product ids and the plan each confers. Must match App Store
 *  Connect exactly; see docs/STOREKIT.md. */
export const APPLE_PRODUCTS: Record<string, PlanId> = {
  'com.atturel.app.pro.monthly': 'pro',
}
export const APPLE_PRO_MONTHLY = 'com.atturel.app.pro.monthly'

export type AppleEnvironment = 'Production' | 'Sandbox'
export const ACCEPTED_ENVIRONMENTS: readonly AppleEnvironment[] = ['Production', 'Sandbox']

/** The fields of Apple's JWSTransactionDecodedPayload this code reads. */
export interface AppleTransaction {
  transactionId: string
  originalTransactionId: string
  bundleId: string
  productId: string
  type?: string
  purchaseDate: number
  expiresDate?: number
  revocationDate?: number
  appAccountToken?: string
  environment: string
  signedDate: number
}

/** The fields of Apple's JWSRenewalInfoDecodedPayload this code reads. */
export interface AppleRenewalInfo {
  originalTransactionId: string
  autoRenewStatus?: number
  autoRenewProductId?: string
  gracePeriodExpiresDate?: number
  environment: string
  signedDate: number
}

export interface AppleNotification {
  notificationType: string
  subtype?: string
  notificationUUID: string
  signedDate: number
  data?: {
    bundleId?: string
    environment?: string
    signedTransactionInfo?: string
    signedRenewalInfo?: string
  }
}

export interface AppleSubscriptionRow {
  originalTransactionId: string
  userId: string
  productId: string
  latestTransactionId: string
  latestPurchaseAt: string
  environment: AppleEnvironment
  expiresAt: string | null
  revokedAt: string | null
  autoRenew: boolean | null
  gracePeriodExpiresAt: string | null
  renewalStateAt: string | null
  /** Compare-and-swap version as read from the database; carried, never compared. */
  version?: number
}

const iso = (ms: number | undefined | null) =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null
const ms = (value: string | null) => (value ? new Date(value).getTime() : null)

export type AppleStatus = 'active' | 'past_due' | 'expired' | 'revoked'

export function appleStatus(row: AppleSubscriptionRow, now = new Date()): AppleStatus {
  if (row.revokedAt) return 'revoked'
  const t = now.getTime()
  const expires = ms(row.expiresAt)
  if (expires !== null && t < expires) return 'active'
  const grace = ms(row.gracePeriodExpiresAt)
  // Grace only extends access past the CURRENT period's end.
  if (grace !== null && expires !== null && grace > expires && t < grace) return 'past_due'
  return 'expired'
}

/** The provider state `resolveEntitlement` reads: the most generous row. */
export function appleProviderState(
  rows: AppleSubscriptionRow[],
  now = new Date(),
): ProviderState | null {
  const rank = (status: AppleStatus) => (status === 'active' ? 2 : status === 'past_due' ? 1 : 0)
  let best: { plan: PlanId; status: AppleStatus } | null = null
  for (const row of rows) {
    const plan = APPLE_PRODUCTS[row.productId]
    if (!plan) continue
    const status = appleStatus(row, now)
    if (!best || rank(status) > rank(best.status)) best = { plan, status }
  }
  return best
}

/** The row an Apple subscription that is still running shows in "Pro until …". */
export function appleBillingLine(
  rows: AppleSubscriptionRow[],
  now = new Date(),
): { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null {
  const entitled = rows
    .filter((r) => APPLE_PRODUCTS[r.productId])
    .map((r) => ({ r, s: appleStatus(r, now) }))
    .filter(({ s }) => s === 'active' || s === 'past_due')
    .sort((a, b) => (ms(b.r.expiresAt) ?? 0) - (ms(a.r.expiresAt) ?? 0))[0]
  if (!entitled) return null
  return {
    status: entitled.s,
    cancelAtPeriodEnd: entitled.r.autoRenew === false,
    currentPeriodEnd: entitled.r.expiresAt,
  }
}

export type TransactionCheck =
  | { ok: true }
  | {
      ok: false
      code: 'wrong_app' | 'unknown_product' | 'not_subscription' | 'environment' | 'malformed'
    }

/** Is this verified transaction one of Atturel's subscriptions at all? */
export function checkTransaction(tx: AppleTransaction): TransactionCheck {
  if (
    typeof tx?.originalTransactionId !== 'string' ||
    typeof tx.transactionId !== 'string' ||
    typeof tx.purchaseDate !== 'number' ||
    typeof tx.signedDate !== 'number'
  ) {
    return { ok: false, code: 'malformed' }
  }
  if (tx.bundleId !== APPLE_BUNDLE_ID) return { ok: false, code: 'wrong_app' }
  if (!APPLE_PRODUCTS[tx.productId]) return { ok: false, code: 'unknown_product' }
  if (tx.type !== undefined && tx.type !== 'Auto-Renewable Subscription') {
    return { ok: false, code: 'not_subscription' }
  }
  if (!(ACCEPTED_ENVIRONMENTS as readonly string[]).includes(tx.environment)) {
    return { ok: false, code: 'environment' }
  }
  return { ok: true }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Atturel account a transaction names, if it names one. The app passes
 *  the account's id as `appAccountToken` on every purchase. */
export function boundAccount(tx: AppleTransaction): string | null {
  return typeof tx.appAccountToken === 'string' && UUID.test(tx.appAccountToken)
    ? tx.appAccountToken.toLowerCase()
    : null
}

/**
 * Fold a verified transaction into the row. Returns the new row, or null when
 * the transaction is older than what is held and changes nothing.
 */
export function mergeTransaction(
  existing: AppleSubscriptionRow | null,
  tx: AppleTransaction,
  userId: string,
): AppleSubscriptionRow | null {
  const fromTx = {
    productId: tx.productId,
    latestTransactionId: tx.transactionId,
    latestPurchaseAt: iso(tx.purchaseDate) as string,
    environment: tx.environment as AppleEnvironment,
    expiresAt: iso(tx.expiresDate),
    revokedAt: iso(tx.revocationDate),
  }
  if (!existing) {
    return {
      originalTransactionId: tx.originalTransactionId,
      userId,
      autoRenew: null,
      gracePeriodExpiresAt: null,
      renewalStateAt: null,
      ...fromTx,
    }
  }
  const sameTx = tx.transactionId === existing.latestTransactionId
  const newer = tx.purchaseDate > (ms(existing.latestPurchaseAt) ?? 0)
  if (!sameTx && !newer) return null
  const next = { ...existing, ...fromTx, userId: existing.userId }
  return sameRow(existing, next) ? null : next
}

/** Fold verified renewal info into the row; null when it is older or the same. */
export function mergeRenewal(
  existing: AppleSubscriptionRow,
  renewal: AppleRenewalInfo,
): AppleSubscriptionRow | null {
  if (renewal.originalTransactionId !== existing.originalTransactionId) return null
  if (typeof renewal.signedDate !== 'number') return null
  if (existing.renewalStateAt && renewal.signedDate < (ms(existing.renewalStateAt) ?? 0)) {
    return null
  }
  const next: AppleSubscriptionRow = {
    ...existing,
    autoRenew:
      renewal.autoRenewStatus === 1
        ? true
        : renewal.autoRenewStatus === 0
          ? false
          : existing.autoRenew,
    gracePeriodExpiresAt: iso(renewal.gracePeriodExpiresDate),
    renewalStateAt: iso(renewal.signedDate),
  }
  return sameRow(existing, next, true) ? null : next
}

function sameRow(a: AppleSubscriptionRow, b: AppleSubscriptionRow, includeStamp = false) {
  const keys: (keyof AppleSubscriptionRow)[] = [
    'productId',
    'latestTransactionId',
    'latestPurchaseAt',
    'environment',
    'expiresAt',
    'revokedAt',
    'autoRenew',
    'gracePeriodExpiresAt',
  ]
  if (includeStamp) keys.push('renewalStateAt')
  return keys.every((k) => a[k] === b[k])
}
