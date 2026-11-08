import { describe, expect, it } from 'vitest'
import { verifyAppleJws } from './jws'
import { processNotification, verifyPurchase, type AppleDeps, type AppleStore } from './process'
import {
  APPLE_PRO_MONTHLY,
  appleProviderState,
  appleStatus,
  type AppleSubscriptionRow,
  type AppleTransaction,
} from './subscriptions'
import { signTestJws, TEST_ROOT_FINGERPRINT } from './test-signing'
import { effectivePlan } from '../subscription-state'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const DAY = 86_400_000
const NOW = new Date('2026-12-01T12:00:00Z')

function memoryStore(users = [USER, OTHER]) {
  const rows = new Map<string, AppleSubscriptionRow>()
  const ledger = new Map<string, { status: string; errorCode?: string | null }>()
  const store: AppleStore = {
    async getByOriginal(id) {
      const row = rows.get(id)
      return row ? { ...row } : null
    },
    async save(next, previous) {
      const current = rows.get(next.originalTransactionId) ?? null
      if (JSON.stringify(current) !== JSON.stringify(previous)) return false
      rows.set(next.originalTransactionId, { ...next })
      return true
    },
    async userExists(id) {
      return users.includes(id)
    },
    async claimNotification(n) {
      const held = ledger.get(n.id)
      if (!held) {
        ledger.set(n.id, { status: 'processing' })
        return 'claimed'
      }
      if (held.status === 'processed' || held.status === 'ignored') return 'duplicate'
      if (held.status === 'processing') return 'in_progress'
      held.status = 'processing'
      return 'claimed'
    },
    async finishNotification(id, outcome) {
      ledger.set(id, { status: outcome.status, errorCode: outcome.errorCode })
    },
  }
  return { store, rows, ledger }
}

function deps(store: AppleStore): AppleDeps {
  return {
    store,
    verify: (jws) => verifyAppleJws(jws, { rootFingerprint: TEST_ROOT_FINGERPRINT, now: NOW }),
    now: () => NOW,
  }
}

function tx(over: Partial<AppleTransaction> = {}): AppleTransaction {
  return {
    transactionId: '2000000001',
    originalTransactionId: '2000000001',
    bundleId: 'com.atturel.app',
    productId: APPLE_PRO_MONTHLY,
    type: 'Auto-Renewable Subscription',
    purchaseDate: NOW.getTime() - DAY,
    expiresDate: NOW.getTime() + 29 * DAY,
    appAccountToken: USER,
    environment: 'Production',
    signedDate: NOW.getTime() - DAY,
    ...over,
  }
}

let uuid = 0
function notification(type: string, transaction: AppleTransaction | null, extra: object = {}) {
  return signTestJws({
    notificationType: type,
    notificationUUID: `n-${++uuid}`,
    signedDate: NOW.getTime(),
    data: {
      bundleId: 'com.atturel.app',
      environment: 'Production',
      ...(transaction ? { signedTransactionInfo: signTestJws(transaction) } : {}),
      ...extra,
    },
  })
}

describe('verifyPurchase', () => {
  it('binds a genuine purchase to the account that made it and grants Pro', async () => {
    const { store, rows } = memoryStore()
    const result = await verifyPurchase(
      { userId: USER, signedTransaction: signTestJws(tx()) },
      deps(store),
    )
    expect(result).toMatchObject({ ok: true, status: 'active', productId: APPLE_PRO_MONTHLY })
    const row = rows.get('2000000001')!
    expect(row.userId).toBe(USER)
    expect(effectivePlan(appleProviderState([row], NOW))).toBe('pro')
  })

  it('rejects anything not signed by the pinned root', async () => {
    const { store, rows } = memoryStore()
    const forged = signTestJws(tx())
    const strict: AppleDeps = { store, verify: (jws) => verifyAppleJws(jws) }
    expect(await verifyPurchase({ userId: USER, signedTransaction: forged }, strict)).toMatchObject(
      {
        ok: false,
        code: 'invalid_signature',
      },
    )
    expect(rows.size).toBe(0)
  })

  it("refuses another app's or an unknown product's transaction", async () => {
    const { store } = memoryStore()
    for (const [over, code] of [
      [{ bundleId: 'com.example.other' }, 'wrong_app'],
      [{ productId: 'com.atturel.app.lifetime' }, 'unknown_product'],
      [{ type: 'Consumable' }, 'not_subscription'],
      [{ environment: 'Xcode' }, 'environment'],
    ] as const) {
      expect(
        await verifyPurchase(
          { userId: USER, signedTransaction: signTestJws(tx(over)) },
          deps(store),
        ),
      ).toMatchObject({ ok: false, code })
    }
  })

  it('refuses a purchase made for a different Atturel account', async () => {
    const { store, rows } = memoryStore()
    const result = await verifyPurchase(
      { userId: OTHER, signedTransaction: signTestJws(tx()) },
      deps(store),
    )
    expect(result).toMatchObject({ ok: false, httpStatus: 403, code: 'account_mismatch' })
    expect(rows.size).toBe(0)
  })

  it('never moves a subscription already linked to another account', async () => {
    const { store, rows } = memoryStore()
    // An offer code redeemed in the App Store carries no account token.
    const noToken = tx({ appAccountToken: undefined })
    await verifyPurchase({ userId: USER, signedTransaction: signTestJws(noToken) }, deps(store))
    const second = await verifyPurchase(
      { userId: OTHER, signedTransaction: signTestJws(noToken) },
      deps(store),
    )
    expect(second).toMatchObject({ ok: false, httpStatus: 409, code: 'linked_to_another_account' })
    expect(rows.get('2000000001')!.userId).toBe(USER)
  })

  it('is idempotent: the same transaction twice changes nothing', async () => {
    const { store, rows } = memoryStore()
    const jws = signTestJws(tx())
    await verifyPurchase({ userId: USER, signedTransaction: jws }, deps(store))
    const before = JSON.stringify(rows.get('2000000001'))
    expect(
      await verifyPurchase({ userId: USER, signedTransaction: jws }, deps(store)),
    ).toMatchObject({
      ok: true,
      status: 'active',
    })
    expect(JSON.stringify(rows.get('2000000001'))).toBe(before)
  })

  it('reports an expired restore without granting Pro', async () => {
    const { store } = memoryStore()
    const old = tx({
      purchaseDate: NOW.getTime() - 60 * DAY,
      expiresDate: NOW.getTime() - 30 * DAY,
    })
    expect(
      await verifyPurchase({ userId: USER, signedTransaction: signTestJws(old) }, deps(store)),
    ).toMatchObject({ ok: true, status: 'expired' })
  })
})

describe('processNotification', () => {
  it('applies a renewal and keeps the account binding', async () => {
    const { store, rows } = memoryStore()
    await verifyPurchase({ userId: USER, signedTransaction: signTestJws(tx()) }, deps(store))
    const renewal = tx({
      transactionId: '2000000002',
      purchaseDate: NOW.getTime() + 28 * DAY,
      expiresDate: NOW.getTime() + 58 * DAY,
      appAccountToken: OTHER,
    })
    expect(
      await processNotification(notification('DID_RENEW', renewal), deps(store)),
    ).toMatchObject({
      httpStatus: 200,
      outcome: 'processed',
    })
    const row = rows.get('2000000001')!
    expect(row.latestTransactionId).toBe('2000000002')
    expect(row.userId).toBe(USER)
  })

  it('takes Pro away on a refund', async () => {
    const { store, rows } = memoryStore()
    await verifyPurchase({ userId: USER, signedTransaction: signTestJws(tx()) }, deps(store))
    const refunded = tx({ revocationDate: NOW.getTime() - 1000, signedDate: NOW.getTime() })
    await processNotification(notification('REFUND', refunded), deps(store))
    const row = rows.get('2000000001')!
    expect(appleStatus(row, NOW)).toBe('revoked')
    expect(effectivePlan(appleProviderState([row], NOW))).toBe('free')
  })

  it('ignores an older transaction delivered after a newer one', async () => {
    const { store, rows } = memoryStore()
    const newer = tx({
      transactionId: '2000000002',
      purchaseDate: NOW.getTime(),
      expiresDate: NOW.getTime() + 30 * DAY,
    })
    await processNotification(notification('DID_RENEW', newer), deps(store))
    const older = tx({ revocationDate: NOW.getTime() })
    expect(await processNotification(notification('REFUND', older), deps(store))).toMatchObject({
      outcome: 'unchanged',
    })
    expect(appleStatus(rows.get('2000000001')!, NOW)).toBe('active')
  })

  it('records auto-renew off and the billing grace period from renewal info', async () => {
    const { store, rows } = memoryStore()
    const lapsed = tx({ expiresDate: NOW.getTime() - DAY, purchaseDate: NOW.getTime() - 31 * DAY })
    await verifyPurchase({ userId: USER, signedTransaction: signTestJws(lapsed) }, deps(store))
    const renewalInfo = signTestJws({
      originalTransactionId: '2000000001',
      autoRenewStatus: 0,
      gracePeriodExpiresDate: NOW.getTime() + 5 * DAY,
      environment: 'Production',
      signedDate: NOW.getTime(),
    })
    await processNotification(
      notification('DID_FAIL_TO_RENEW', lapsed, { signedRenewalInfo: renewalInfo }),
      deps(store),
    )
    const row = rows.get('2000000001')!
    expect(row.autoRenew).toBe(false)
    expect(appleStatus(row, NOW)).toBe('past_due')
    expect(effectivePlan(appleProviderState([row], NOW))).toBe('pro')
    expect(appleStatus(row, new Date(NOW.getTime() + 6 * DAY))).toBe('expired')
  })

  it('creates the row from a notification when the app never reported the purchase', async () => {
    const { store, rows } = memoryStore()
    await processNotification(notification('SUBSCRIBED', tx()), deps(store))
    expect(rows.get('2000000001')!.userId).toBe(USER)
  })

  it('does not bind to an account that no longer exists', async () => {
    const { store, rows, ledger } = memoryStore([OTHER])
    const result = await processNotification(notification('SUBSCRIBED', tx()), deps(store))
    expect(result).toMatchObject({ httpStatus: 200, outcome: 'ignored', reason: 'unbound' })
    expect(rows.size).toBe(0)
    expect([...ledger.values()][0]?.status).toBe('ignored')
  })

  it('applies each notification once, and never acknowledges one still in progress', async () => {
    const { store, ledger } = memoryStore()
    const signed = notification('SUBSCRIBED', tx())
    expect((await processNotification(signed, deps(store))).outcome).toBe('processed')
    expect((await processNotification(signed, deps(store))).outcome).toBe('duplicate')

    const pending = notification('DID_RENEW', tx())
    const id = `n-${uuid}`
    ledger.set(id, { status: 'processing' })
    expect(await processNotification(pending, deps(store))).toMatchObject({
      httpStatus: 409,
      outcome: 'in_progress',
    })
  })

  it("acknowledges another app's notification without recording it", async () => {
    const { store, ledger } = memoryStore()
    const other = signTestJws({
      notificationType: 'SUBSCRIBED',
      notificationUUID: 'x',
      signedDate: NOW.getTime(),
      data: { bundleId: 'com.example.other' },
    })
    expect(await processNotification(other, deps(store))).toMatchObject({
      httpStatus: 200,
      outcome: 'ignored',
    })
    expect(ledger.size).toBe(0)
  })

  it('rejects a forged notification and a forged inner transaction', async () => {
    const { store, rows } = memoryStore()
    const strict: AppleDeps = { store, verify: (jws) => verifyAppleJws(jws) }
    expect(await processNotification(notification('SUBSCRIBED', tx()), strict)).toMatchObject({
      httpStatus: 400,
      outcome: 'invalid_signature',
    })
    // A genuine envelope around a transaction signed by someone else.
    const mixed: AppleDeps = {
      store,
      verify: (jws) => {
        const payload = verifyAppleJws<Record<string, unknown>>(jws, {
          rootFingerprint: TEST_ROOT_FINGERPRINT,
          now: NOW,
        })
        if ('transactionId' in payload) throw new Error('not apple')
        return payload as never
      },
    }
    expect(await processNotification(notification('SUBSCRIBED', tx()), mixed)).toMatchObject({
      outcome: 'ignored',
      reason: 'invalid_transaction_signature',
    })
    expect(rows.size).toBe(0)
  })

  it('marks the notification failed and answers 500 when the database fails', async () => {
    const { store, ledger } = memoryStore()
    const broken: AppleStore = {
      ...store,
      async getByOriginal() {
        throw new Error('db_down')
      },
    }
    expect(await processNotification(notification('SUBSCRIBED', tx()), deps(broken))).toMatchObject(
      {
        httpStatus: 500,
      },
    )
    expect([...ledger.values()][0]?.status).toBe('failed')
  })
})
