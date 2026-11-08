import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { AccountResponse } from '@atturel/web/lib/mobile/contracts'
import { ThemeProvider } from '../theme'

/**
 * THE IN-APP PRO SECTION
 * Shown only when the server allows it and the App Store has the product;
 * carries the price, renewal terms, Terms of Use, Privacy Policy and Restore
 * (App Review 3.1.2); and buys with the account bound as appAccountToken.
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: false },
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const mockPost = jest.fn()
jest.mock('~/lib/api', () => {
  class ApiError extends Error {
    failure: { kind: string }
    constructor(mockFailure: { kind: string }) {
      super(mockFailure.kind)
      this.failure = mockFailure
    }
  }
  return { ApiError, api: { post: (path: string, body: unknown) => mockPost(path, body) } }
})

const mockStore = {
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async (): Promise<unknown> => [
    { id: 'com.atturel.app.pro.monthly', displayPrice: '$29.99', title: 'Atturel Pro' },
  ]),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => true),
  getAvailablePurchases: jest.fn(async (): Promise<unknown> => []),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  deepLinkToSubscriptions: jest.fn(async () => undefined),
}
jest.mock('expo-iap', () => mockStore)

const { ApplePro } = require('../components/apple-pro') as typeof import('../components/apple-pro')

const legal: AccountResponse['legal'] = {
  privacyUrl: 'https://www.atturel.com/privacy',
  termsUrl: 'https://www.atturel.com/terms',
  supportEmail: 'support@atturel.com',
}
const iap = (over: Partial<NonNullable<AccountResponse['appleIap']>> = {}) => ({
  offer: true,
  productId: 'com.atturel.app.pro.monthly',
  accountToken: '11111111-1111-4111-8111-111111111111',
  active: false,
  renews: null,
  endsAt: null,
  ...over,
})
const show = (info = iap()) =>
  render(
    <ThemeProvider force="pearl">
      <ApplePro iap={info} legal={legal} onChanged={jest.fn()} />
    </ThemeProvider>,
  )

beforeEach(() => jest.clearAllMocks())

it('shows the price, the renewal terms and every link App Review asks for', async () => {
  await show()
  expect(await screen.findByText('Subscribe for $29.99/month')).toBeTruthy()
  expect(screen.getByText(/renews automatically each month unless you turn it off at least 24 hours/)).toBeTruthy()
  expect(screen.getByText('Terms of Use')).toBeTruthy()
  expect(screen.getByText('Privacy Policy')).toBeTruthy()
  expect(screen.getByText('Restore purchases')).toBeTruthy()
})

it('buys with this account bound as the appAccountToken', async () => {
  await show()
  await fireEvent.press(await screen.findByText('Subscribe for $29.99/month'))
  await waitFor(() =>
    expect(mockStore.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: 'com.atturel.app.pro.monthly', appAccountToken: '11111111-1111-4111-8111-111111111111' } },
      type: 'subs',
    }),
  )
})

it('shows only Restore when the App Store has no product to sell yet', async () => {
  mockStore.fetchProducts.mockResolvedValueOnce([])
  await show()
  await waitFor(() => expect(mockStore.fetchProducts).toHaveBeenCalled())
  expect(await screen.findByText('Restore purchases')).toBeTruthy()
  expect(screen.queryByText(/Subscribe for/)).toBeNull()
})

it('shows nothing to an account that is already Pro another way', async () => {
  await show(iap({ offer: false }))
  expect(screen.queryByText(/Subscribe for/)).toBeNull()
  expect(screen.queryByText('Restore purchases')).toBeNull()
})

it('a subscriber gets Manage subscription, not a second purchase', async () => {
  await show(iap({ offer: false, active: true, renews: true }))
  expect(await screen.findByText('Manage subscription')).toBeTruthy()
  expect(screen.queryByText(/Subscribe for/)).toBeNull()
  await fireEvent.press(screen.getByText('Manage subscription'))
  expect(mockStore.deepLinkToSubscriptions).toHaveBeenCalled()
})

it('restores: sends each Atturel purchase to the server and finishes it once recorded', async () => {
  const purchase = { productId: 'com.atturel.app.pro.monthly', purchaseToken: 'h.p.s' }
  mockStore.getAvailablePurchases.mockResolvedValueOnce([purchase, { productId: 'other', purchaseToken: 'x.y.z' }])
  mockPost.mockResolvedValueOnce({ ok: true, status: 'active', expiresAt: null })
  await show()
  await fireEvent.press(await screen.findByText('Restore purchases'))
  expect(await screen.findByText('Thank you. Pro is on.')).toBeTruthy()
  expect(mockPost).toHaveBeenCalledTimes(1)
  expect(mockStore.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false })
})
