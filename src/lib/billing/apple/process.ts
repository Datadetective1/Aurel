import {
  APPLE_BUNDLE_ID,
  appleStatus,
  boundAccount,
  checkTransaction,
  mergeRenewal,
  mergeTransaction,
  type AppleNotification,
  type AppleRenewalInfo,
  type AppleStatus,
  type AppleSubscriptionRow,
  type AppleTransaction,
} from './subscriptions'

/**
 * APP STORE PURCHASES AND NOTIFICATIONS
 * =============================================================================
 * The only two ways an Apple subscription reaches `app_store_subscriptions`:
 *
 *   verifyPurchase       the app, right after StoreKit completes a purchase or
 *                        a restore, sends the transaction Apple signed. The
 *                        app finishes the transaction only after this answers.
 *   processNotification  App Store Server Notifications v2: renewals, billing
 *                        problems, cancellations, refunds. Ledgered by
 *                        notificationUUID, so a retry never applies twice.
 *
 * Both verify Apple's signature before reading anything (./jws), both refuse
 * other apps' and unknown products' transactions, and neither ever moves a
 * subscription from one Atturel account to another.
 *
 * Network and database live behind `deps`, so every rule here is unit-tested.
 * =============================================================================
 */

export type ClaimResult = 'claimed' | 'duplicate' | 'in_progress'

export interface AppleStore {
  getByOriginal(originalTransactionId: string): Promise<AppleSubscriptionRow | null>
  /**
   * Write `next`, but only if the row is still `previous` (null: does not
   * exist yet). Returns false when someone else changed it first; the caller
   * re-reads and merges again.
   */
  save(next: AppleSubscriptionRow, previous: AppleSubscriptionRow | null): Promise<boolean>
  userExists(userId: string): Promise<boolean>
  claimNotification(n: {
    id: string
    type: string
    subtype: string | null
    environment: string | null
    signedAt: string
  }): Promise<ClaimResult>
  finishNotification(
    id: string,
    outcome: {
      status: 'processed' | 'ignored' | 'failed'
      userId?: string | null
      originalTransactionId?: string | null
      errorCode?: string | null
    },
  ): Promise<void>
}

export interface AppleDeps {
  store: AppleStore
  /** Verify an Apple JWS and return its payload; throws when not genuine. */
  verify: <T>(jws: string) => T
  now?: () => Date
}

export type VerifyPurchaseResult =
  | { ok: true; status: AppleStatus; expiresAt: string | null; productId: string }
  | {
      ok: false
      httpStatus: 400 | 403 | 409 | 422 | 500
      code:
        | 'invalid_signature'
        | 'wrong_app'
        | 'unknown_product'
        | 'not_subscription'
        | 'environment'
        | 'malformed'
        | 'account_mismatch'
        | 'linked_to_another_account'
        | 'busy'
    }

const MAX_ATTEMPTS = 3

/** Read, merge, compare-and-swap; retried when a concurrent write wins. */
async function applyToRow(
  store: AppleStore,
  originalTransactionId: string,
  mutate: (current: AppleSubscriptionRow | null) => AppleSubscriptionRow | null,
): Promise<{ row: AppleSubscriptionRow | null; changed: boolean }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await store.getByOriginal(originalTransactionId)
    const next = mutate(current)
    if (!next) return { row: current, changed: false }
    if (await store.save(next, current)) return { row: next, changed: true }
  }
  throw new Error('apple_store_contention')
}

export async function verifyPurchase(
  input: { userId: string; signedTransaction: unknown },
  deps: AppleDeps,
): Promise<VerifyPurchaseResult> {
  const now = deps.now?.() ?? new Date()
  if (typeof input.signedTransaction !== 'string' || !input.signedTransaction) {
    return { ok: false, httpStatus: 400, code: 'malformed' }
  }

  let tx: AppleTransaction
  try {
    tx = deps.verify<AppleTransaction>(input.signedTransaction)
  } catch {
    return { ok: false, httpStatus: 400, code: 'invalid_signature' }
  }

  const check = checkTransaction(tx)
  if (!check.ok) return { ok: false, httpStatus: 422, code: check.code }

  const userId = input.userId.toLowerCase()
  const bound = boundAccount(tx)
  // Bought while signed in to another Atturel account on this Apple ID.
  if (bound && bound !== userId) return { ok: false, httpStatus: 403, code: 'account_mismatch' }

  let linkedElsewhere = false
  let result: { row: AppleSubscriptionRow | null; changed: boolean }
  try {
    result = await applyToRow(deps.store, tx.originalTransactionId, (current) => {
      if (current && current.userId !== userId) {
        linkedElsewhere = true
        return null
      }
      return mergeTransaction(current, tx, userId)
    })
  } catch {
    return { ok: false, httpStatus: 500, code: 'busy' }
  }
  if (linkedElsewhere) return { ok: false, httpStatus: 409, code: 'linked_to_another_account' }

  // `row` is null only if nothing was held and the merge declined, which a
  // first transaction never does; answer from the transaction itself then.
  const row = result.row
  return {
    ok: true,
    status: row ? appleStatus(row, now) : 'expired',
    expiresAt: row?.expiresAt ?? null,
    productId: tx.productId,
  }
}

export type NotificationResult = {
  httpStatus: 200 | 400 | 409 | 500
  outcome:
    | 'processed'
    | 'unchanged'
    | 'duplicate'
    | 'in_progress'
    | 'ignored'
    | 'invalid_signature'
    | 'failed'
  reason?: string
}

export async function processNotification(
  signedPayload: unknown,
  deps: AppleDeps,
): Promise<NotificationResult> {
  if (typeof signedPayload !== 'string' || !signedPayload) {
    return { httpStatus: 400, outcome: 'invalid_signature' }
  }

  let n: AppleNotification
  try {
    n = deps.verify<AppleNotification>(signedPayload)
  } catch {
    return { httpStatus: 400, outcome: 'invalid_signature' }
  }
  if (typeof n.notificationUUID !== 'string' || typeof n.notificationType !== 'string') {
    return { httpStatus: 400, outcome: 'invalid_signature', reason: 'malformed' }
  }
  // Another app's notification cannot be ours to apply; acknowledge it so
  // Apple stops retrying, and keep no record.
  if (n.data?.bundleId !== APPLE_BUNDLE_ID) {
    return { httpStatus: 200, outcome: 'ignored', reason: 'wrong_app' }
  }

  const claim = await deps.store.claimNotification({
    id: n.notificationUUID,
    type: n.notificationType,
    subtype: n.subtype ?? null,
    environment: n.data?.environment ?? null,
    signedAt: new Date(typeof n.signedDate === 'number' ? n.signedDate : Date.now()).toISOString(),
  })
  if (claim === 'duplicate') return { httpStatus: 200, outcome: 'duplicate' }
  // Never acknowledge while another delivery holds it: it may yet fail.
  if (claim === 'in_progress') return { httpStatus: 409, outcome: 'in_progress' }

  const ignore = async (reason: string, extra: { userId?: string; original?: string } = {}) => {
    await deps.store.finishNotification(n.notificationUUID, {
      status: 'ignored',
      userId: extra.userId ?? null,
      originalTransactionId: extra.original ?? null,
      errorCode: reason,
    })
    return { httpStatus: 200 as const, outcome: 'ignored' as const, reason }
  }

  try {
    if (n.notificationType === 'TEST') return await ignore('test')
    const signedTx = n.data?.signedTransactionInfo
    if (!signedTx) return await ignore('no_transaction')

    let tx: AppleTransaction
    try {
      tx = deps.verify<AppleTransaction>(signedTx)
    } catch {
      return await ignore('invalid_transaction_signature')
    }
    const check = checkTransaction(tx)
    if (!check.ok) return await ignore(check.code, { original: tx.originalTransactionId })

    let renewal: AppleRenewalInfo | null = null
    if (n.data?.signedRenewalInfo) {
      try {
        renewal = deps.verify<AppleRenewalInfo>(n.data.signedRenewalInfo)
      } catch {
        renewal = null
      }
      if (renewal && renewal.originalTransactionId !== tx.originalTransactionId) renewal = null
    }

    // The account: the one the subscription is already bound to, or else the
    // one the purchase named, if that account still exists.
    const held = await deps.store.getByOriginal(tx.originalTransactionId)
    let userId = held?.userId ?? null
    if (!userId) {
      const named = boundAccount(tx)
      if (named && (await deps.store.userExists(named))) userId = named
    }
    if (!userId) return await ignore('unbound', { original: tx.originalTransactionId })

    const owner = userId
    const { changed } = await applyToRow(deps.store, tx.originalTransactionId, (current) => {
      // Bound to someone else since we looked: never move it.
      if (current && current.userId !== owner) return null
      const afterTx = mergeTransaction(current, tx, owner) ?? current
      if (!afterTx) return null
      const afterRenewal = renewal ? mergeRenewal(afterTx, renewal) : null
      const next = afterRenewal ?? afterTx
      return next === current ? null : next
    })

    await deps.store.finishNotification(n.notificationUUID, {
      status: 'processed',
      userId: owner,
      originalTransactionId: tx.originalTransactionId,
    })
    return { httpStatus: 200, outcome: changed ? 'processed' : 'unchanged' }
  } catch (error) {
    await deps.store
      .finishNotification(n.notificationUUID, {
        status: 'failed',
        errorCode: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
      })
      .catch(() => undefined)
    return { httpStatus: 500, outcome: 'failed' }
  }
}
