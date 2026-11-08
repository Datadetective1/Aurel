import { Platform } from 'react-native'
import type { ApplePurchaseResponse } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError } from '~/lib/api'
import { config } from '~/lib/config'

/**
 * PRO THROUGH APPLE (StoreKit 2, via expo-iap)
 * =============================================================================
 * The order of operations is the whole point:
 *
 *   1. StoreKit sells the subscription, with appAccountToken set to this
 *      account's id, so Apple's own records name the account it is for.
 *   2. The transaction Apple signed goes to Atturel's server, which checks
 *      Apple's signature and records it (POST /api/mobile/purchases/apple).
 *   3. ONLY THEN is the transaction finished. If step 2 fails (offline,
 *      server down), the transaction stays unfinished and StoreKit hands it
 *      back on the next launch, so a payment is never lost. Apple's server
 *      notification records it independently as well.
 *
 * Nothing on the phone decides whether someone is Pro. The account screen
 * reloads from the server after every step.
 * =============================================================================
 */

/** The parts of a StoreKit purchase this file reads. */
export interface StorePurchase {
  productId: string
  /** On iOS, the transaction's JWS as Apple signed it. */
  purchaseToken?: string | null
}

/** The parts of expo-iap this file uses, so the flow can be tested without it. */
export interface IapModule {
  initConnection(): Promise<unknown>
  endConnection(): Promise<unknown>
  fetchProducts(request: { skus: string[]; type: 'subs' }): Promise<unknown>
  requestPurchase(props: {
    request: { apple: { sku: string; appAccountToken: string } }
    type: 'subs'
  }): Promise<unknown>
  finishTransaction(args: { purchase: never; isConsumable: boolean }): Promise<unknown>
  getAvailablePurchases(options?: { onlyIncludeActiveItemsIOS?: boolean }): Promise<unknown>
  purchaseUpdatedListener(listener: (purchase: never) => void): { remove(): void }
  purchaseErrorListener(listener: (error: { code?: string; message?: string }) => void): {
    remove(): void
  }
  deepLinkToSubscriptions(options?: unknown): Promise<unknown>
}

/** expo-iap, or null where there is no StoreKit (web, preview data, a build
 *  made before the module was added). */
export function loadIap(): IapModule | null {
  if (Platform.OS !== 'ios' || config.previewData) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as IapModule
  } catch {
    return null
  }
}

export interface StoreProduct {
  id: string
  displayPrice: string
  title: string
}

export async function loadProduct(iap: IapModule, productId: string): Promise<StoreProduct | null> {
  const result = (await iap.fetchProducts({ skus: [productId], type: 'subs' })) as
    | { id?: string; displayPrice?: string; title?: string }[]
    | null
  const product = (result ?? []).find((p) => p?.id === productId)
  if (!product || !product.displayPrice) return null
  return { id: productId, displayPrice: product.displayPrice, title: product.title ?? 'Atturel Pro' }
}

export type RecordOutcome =
  | { kind: 'recorded'; active: boolean }
  | { kind: 'refused'; message: string }
  /** Not recorded yet; the transaction is kept and tried again. */
  | { kind: 'retry'; message: string }

const REFUSED: Record<string, string> = {
  account_mismatch:
    'This Apple ID’s subscription was bought for a different Atturel account. Sign in to that account to use it.',
  linked_to_another_account:
    'This Apple ID’s subscription is already linked to a different Atturel account.',
}

export interface RecordDeps {
  post: (path: string, body: unknown) => Promise<ApplePurchaseResponse>
  finish: (purchase: StorePurchase) => Promise<unknown>
}

/**
 * Send one purchase to the server, and finish it only once the server has
 * recorded it. Exported for tests.
 */
export async function recordPurchase(
  purchase: StorePurchase,
  productId: string,
  deps: RecordDeps,
): Promise<RecordOutcome | null> {
  // Not Atturel Pro (or not a subscription): leave it alone.
  if (purchase.productId !== productId) return null
  const jws = purchase.purchaseToken
  if (!jws) return { kind: 'retry', message: 'The App Store did not return the purchase yet. Try Restore purchases.' }

  let result: ApplePurchaseResponse
  try {
    result = await deps.post('/api/mobile/purchases/apple', { signedTransaction: jws })
  } catch (e) {
    const code =
      e instanceof ApiError && (e.failure.kind === 'server' || e.failure.kind === 'conflict')
        ? (e.failure.body as { code?: string } | undefined)?.code
        : undefined
    if (code && REFUSED[code]) return { kind: 'refused', message: REFUSED[code] }
    if (e instanceof ApiError && e.failure.kind === 'offline') {
      return { kind: 'retry', message: 'You appear to be offline. Your purchase is safe; it will be added when you are back online.' }
    }
    return {
      kind: 'retry',
      message: 'Your purchase is safe, but Atturel could not confirm it just now. It will be added automatically; you can also try Restore purchases.',
    }
  }
  if (!result.ok) {
    return REFUSED[result.code]
      ? { kind: 'refused', message: REFUSED[result.code] as string }
      : { kind: 'retry', message: 'Atturel could not confirm this purchase. Try Restore purchases, or contact support.' }
  }
  await deps.finish(purchase).catch(() => undefined)
  return { kind: 'recorded', active: result.status === 'active' || result.status === 'past_due' }
}

export function recordDeps(iap: IapModule): RecordDeps {
  return {
    post: (path, body) => api.post<ApplePurchaseResponse>(path, body),
    finish: (purchase) => iap.finishTransaction({ purchase: purchase as never, isConsumable: false }),
  }
}

/** StoreKit's own code for "the person closed the sheet". */
export function isUserCancel(error: { code?: string } | null | undefined): boolean {
  const code = String(error?.code ?? '').toLowerCase().replace(/_/g, '-')
  return code === 'user-cancelled' || code === 'e-user-cancelled' || code === 'usercancelled'
}
