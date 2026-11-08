/**
 * PRO THROUGH APPLE: THE PHONE'S HALF
 * A purchase is finished with StoreKit only after the server has recorded it,
 * so a failure never loses a payment; refusals are explained in plain words.
 */
jest.mock('~/lib/api', () => {
  class ApiError extends Error {
    failure: { kind: string; message?: string; body?: unknown }
    constructor(mockFailure: { kind: string; message?: string; body?: unknown }) {
      super(mockFailure.kind)
      this.failure = mockFailure
    }
  }
  return { ApiError, api: { post: jest.fn() } }
})
jest.mock('~/lib/config', () => ({ config: { previewData: false, apiUrl: 'https://test' } }))

const { ApiError } = jest.requireMock('~/lib/api') as {
  ApiError: new (failure: { kind: string; message?: string; body?: unknown }) => Error
}
const { recordPurchase, isUserCancel } = require('../lib/purchases') as typeof import('../lib/purchases')

const PRODUCT = 'com.atturel.app.pro.monthly'
const purchase = { productId: PRODUCT, purchaseToken: 'header.payload.signature' }

function deps(post: jest.Mock) {
  const finish = jest.fn(async () => undefined)
  return { deps: { post, finish }, finish }
}

describe('recordPurchase', () => {
  it('finishes the transaction only after the server recorded it', async () => {
    const order: string[] = []
    const post = jest.fn(async () => {
      order.push('server')
      return { ok: true as const, status: 'active' as const, expiresAt: null }
    })
    const finish = jest.fn(async () => {
      order.push('finish')
    })
    const outcome = await recordPurchase(purchase, PRODUCT, { post, finish })
    expect(outcome).toEqual({ kind: 'recorded', active: true })
    expect(post).toHaveBeenCalledWith('/api/mobile/purchases/apple', { signedTransaction: purchase.purchaseToken })
    expect(order).toEqual(['server', 'finish'])
  })

  it('keeps the transaction when offline or when the server fails, so it is retried', async () => {
    for (const error of [new ApiError({ kind: 'offline' }), new ApiError({ kind: 'server', message: 'x', body: { code: 'busy' } })]) {
      const { deps: d, finish } = deps(jest.fn(async () => Promise.reject(error)))
      const outcome = await recordPurchase(purchase, PRODUCT, d)
      expect(outcome?.kind).toBe('retry')
      expect(finish).not.toHaveBeenCalled()
    }
  })

  it('explains a subscription that belongs to another account, and does not finish it', async () => {
    const { deps: d, finish } = deps(
      jest.fn(async () => Promise.reject(new ApiError({ kind: 'server', message: 'x', body: { ok: false, code: 'account_mismatch' } }))),
    )
    const outcome = await recordPurchase(purchase, PRODUCT, d)
    expect(outcome).toMatchObject({ kind: 'refused' })
    expect(outcome && 'message' in outcome ? outcome.message : '').toContain('different Atturel account')
    expect(finish).not.toHaveBeenCalled()
  })

  it('leaves other products and a missing token alone', async () => {
    const { deps: d, finish } = deps(jest.fn())
    expect(await recordPurchase({ productId: 'other', purchaseToken: 'a.b.c' }, PRODUCT, d)).toBeNull()
    expect((await recordPurchase({ productId: PRODUCT, purchaseToken: null }, PRODUCT, d))?.kind).toBe('retry')
    expect(d.post).not.toHaveBeenCalled()
    expect(finish).not.toHaveBeenCalled()
  })

  it('reports an expired restore as not active', async () => {
    const { deps: d } = deps(jest.fn(async () => ({ ok: true, status: 'expired', expiresAt: null })))
    expect(await recordPurchase(purchase, PRODUCT, d)).toEqual({ kind: 'recorded', active: false })
  })
})

describe('isUserCancel', () => {
  it('recognises StoreKit closing the sheet', () => {
    expect(isUserCancel({ code: 'user-cancelled' })).toBe(true)
    expect(isUserCancel({ code: 'E_USER_CANCELLED' })).toBe(true)
    expect(isUserCancel({ code: 'network-error' })).toBe(false)
    expect(isUserCancel(null)).toBe(false)
  })
})
