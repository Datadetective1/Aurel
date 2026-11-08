import * as React from 'react'
import { Alert, Linking, View } from 'react-native'
import type { AccountResponse } from '@atturel/web/lib/mobile/contracts'
import { PLANS } from '@atturel/web/lib/billing/plans'
import { Section } from '~/components/screen'
import { Button } from '~/components/button'
import { T } from '~/components/text'
import {
  isUserCancel,
  loadIap,
  loadProduct,
  recordDeps,
  recordPurchase,
  type IapModule,
  type RecordOutcome,
  type StoreProduct,
  type StorePurchase,
} from '~/lib/purchases'

/**
 * ATTUREL PRO, BOUGHT IN THE APP
 * =============================================================================
 * Shown only when the server says the account may buy (not already Pro on the
 * web, not full access) AND the App Store returned the product with its price.
 * Without both, nothing is shown: no button that cannot work.
 *
 * Carries what App Review guideline 3.1.2 asks of an auto-renewing
 * subscription: its name and length, the price in the person's own currency
 * from StoreKit, that it renews until cancelled, how to cancel, and working
 * links to the Terms of Use and the Privacy Policy. Restore purchases is
 * always available, as Apple requires.
 * =============================================================================
 */

type IapInfo = NonNullable<AccountResponse['appleIap']>

export function ApplePro({
  iap: info,
  legal,
  onChanged,
}: {
  iap: IapInfo
  legal: AccountResponse['legal']
  onChanged: () => void
}) {
  const store = React.useMemo<IapModule | null>(() => loadIap(), [])
  const [product, setProduct] = React.useState<StoreProduct | null>(null)
  const [busy, setBusy] = React.useState<'buy' | 'restore' | null>(null)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  // Only a purchase or restore the person asked for reports a refusal; a
  // transaction StoreKit replays by itself is recorded quietly.
  const asked = React.useRef(false)

  const report = React.useCallback(
    (outcome: RecordOutcome | null) => {
      if (!outcome) return
      if (outcome.kind === 'recorded') {
        setMessage(
          outcome.active
            ? { ok: true, text: 'Thank you. Pro is on.' }
            : { ok: false, text: 'That subscription has ended. Subscribe again to turn Pro back on.' },
        )
        onChanged()
      } else if (asked.current) {
        setMessage({ ok: false, text: outcome.message })
      }
    },
    [onChanged],
  )

  React.useEffect(() => {
    if (!store) return
    let alive = true
    const subscriptions: { remove(): void }[] = []
    void (async () => {
      try {
        await store.initConnection()
        subscriptions.push(
          store.purchaseUpdatedListener((purchase: StorePurchase) => {
            void recordPurchase(purchase, info.productId, recordDeps(store)).then((outcome) => {
              if (!alive) return
              setBusy(null)
              report(outcome)
            })
          }),
          store.purchaseErrorListener((error) => {
            if (!alive) return
            setBusy(null)
            if (!isUserCancel(error) && asked.current) {
              setMessage({ ok: false, text: 'The App Store could not complete the purchase. You have not been charged.' })
            }
          }),
        )
        const loaded = await loadProduct(store, info.productId)
        if (alive) setProduct(loaded)
      } catch {
        if (alive) setProduct(null)
      }
    })()
    return () => {
      alive = false
      subscriptions.forEach((s) => s.remove())
      void store.endConnection().catch(() => undefined)
    }
  }, [store, info.productId, report])

  if (!store) return null

  const buy = async () => {
    asked.current = true
    setMessage(null)
    setBusy('buy')
    try {
      await store.requestPurchase({
        request: { apple: { sku: info.productId, appAccountToken: info.accountToken } },
        type: 'subs',
      })
    } catch (error) {
      setBusy(null)
      if (!isUserCancel(error as { code?: string })) {
        setMessage({ ok: false, text: 'The App Store could not start the purchase. You have not been charged.' })
      }
    }
  }

  const restore = async () => {
    asked.current = true
    setMessage(null)
    setBusy('restore')
    try {
      const purchases = ((await store.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })) ??
        []) as StorePurchase[]
      const ours = purchases.filter((p) => p.productId === info.productId)
      if (ours.length === 0) {
        setMessage({ ok: false, text: 'No Atturel subscription was found for this Apple ID.' })
        return
      }
      let last: RecordOutcome | null = null
      for (const purchase of ours) last = await recordPurchase(purchase, info.productId, recordDeps(store))
      report(last)
    } catch {
      setMessage({ ok: false, text: 'Purchases could not be restored just now. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  const manage = () => {
    void store.deepLinkToSubscriptions().catch(() =>
      Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() =>
        Alert.alert('Manage subscription', 'Open Settings, tap your name, then Subscriptions.'),
      ),
    )
  }

  // Subscribed through Apple: where to manage it, nothing to buy.
  if (info.active) {
    return (
      <Section label="Subscription" icon="award">
        <T variant="small" tone="secondary">
          Atturel Pro is billed to your Apple ID.{' '}
          {info.renews === false ? 'It will not renew.' : 'It renews automatically until you cancel.'}
        </T>
        <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Manage subscription" variant="secondary" icon="settings" onPress={manage} />
          <Button label="Restore purchases" variant="secondary" icon="refresh-cw" busy={busy === 'restore'} onPress={() => void restore()} />
        </View>
        {message ? <Note message={message} /> : null}
      </Section>
    )
  }

  // Not offered (already Pro another way): nothing. The App Store has no
  // product to show yet: only Restore, so a subscriber can recover theirs.
  if (!info.offer) return null
  if (!product) {
    return (
      <Section label="Atturel Pro" icon="award">
        <Button label="Restore purchases" variant="secondary" icon="refresh-cw" busy={busy === 'restore'} onPress={() => void restore()} />
        {message ? <Note message={message} /> : null}
      </Section>
    )
  }

  return (
    <Section label="Atturel Pro" icon="award">
      <T variant="small">For professionals who keep many working relationships moving.</T>
      <View style={{ marginTop: 8, gap: 4 }}>
        {PLANS.pro.highlights.slice(0, 3).map((line) => (
          <T key={line} variant="small" tone="secondary">
            {`• ${line}`}
          </T>
        ))}
      </View>
      <View style={{ marginTop: 14, alignItems: 'flex-start' }}>
        <Button
          label={`Subscribe for ${product.displayPrice}/month`}
          icon="award"
          busy={busy === 'buy'}
          disabled={busy !== null}
          onPress={() => void buy()}
        />
      </View>
      <T variant="meta" tone="muted" style={{ marginTop: 10 }}>
        {`Atturel Pro, monthly: ${product.displayPrice} a month, charged to your Apple ID when you confirm. It renews automatically each month unless you turn it off at least 24 hours before the period ends, on your iPhone in Settings, then your name, then Subscriptions. Nothing is deleted if you cancel.`}
      </T>
      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Terms of Use" variant="secondary" icon="file-text" onPress={() => void Linking.openURL(legal.termsUrl)} />
        <Button label="Privacy Policy" variant="secondary" icon="lock" onPress={() => void Linking.openURL(legal.privacyUrl)} />
        <Button label="Restore purchases" variant="secondary" icon="refresh-cw" busy={busy === 'restore'} disabled={busy === 'buy'} onPress={() => void restore()} />
      </View>
      {message ? <Note message={message} /> : null}
    </Section>
  )
}

function Note({ message }: { message: { ok: boolean; text: string } }) {
  return (
    <T variant="small" tone={message.ok ? 'positive' : 'critical'} style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
      {message.text}
    </T>
  )
}
