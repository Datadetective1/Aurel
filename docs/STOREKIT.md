# App Store subscriptions (StoreKit) — prepared, not active

Nothing here is built as a purchase flow. There is no fake purchase and no
sandbox product. This is the plan, and the parts of the code already shaped
for it.

## What already exists

- **One canonical entitlement.** `getEntitlements()` reads Supabase only. Its
  plan comes from `resolveEntitlement()` (`src/lib/billing/sources.ts`), which
  takes a state per provider — `stripe`, `apple`, `manual` — and returns the
  plan, which provider confers it, and every provider currently billing the
  account. The `apple` input is always `null` today.
- **Deletion already branches on Apple.** `deleteAccountCore()`
  (`src/lib/account/deletion.ts`) refuses to delete an account with an active
  App Store subscription until the person confirms they cancelled it in iOS
  Settings, and applies no Stripe logic to it. Tested in
  `src/lib/account/deletion.test.ts`. The app's Account screen already handles
  that answer.
- **The app shows where billing is managed** (`billing: 'web' | 'apple' |
  'included' | 'none'` in `GET /api/mobile/account`) and never shows a web
  billing control as its own.
- **The webhook ledger pattern** (`stripe_events`, `claim_stripe_event`) is the
  model for Apple's notifications.

## What to build after the first TestFlight build

1. **App Store Connect:** create the app record (bundle `com.atturel.app`), a
   subscription group, and one auto-renewable product for Pro (monthly).
   Decide the price tier — Apple's tiers may not land on exactly $29, and Apple
   takes its commission; whether the iOS price matches the web is a pricing
   decision for Amary.
2. **Database (new migration, not written yet):** an `app_store_subscriptions`
   table keyed by `original_transaction_id`, with `user_id`, `product_id`,
   `status`, `expires_at`, `environment` (`sandbox`/`production`),
   `revoked_at`, and `state_at` for ordering; and an `app_store_notifications`
   ledger (notification UUID primary key) mirroring `stripe_events`. A separate
   table rather than columns on `subscriptions`: one user can, rarely, hold
   both, and the two must never overwrite each other.
3. **Server:**
   - `POST /api/mobile/purchases/verify` — the app sends the StoreKit 2 signed
     transaction after purchase; the server verifies the JWS against Apple's
     certificate chain, binds it to the signed-in user via `appAccountToken`
     (a UUID the app sets from the user id at purchase), and writes the row.
   - `POST /api/apple/notifications` — App Store Server Notifications v2
     (renewal, expiry, refund, revoke, grace period), verified, ledgered,
     ordered by `signedDate`.
   - Feed the row into `resolveEntitlement({ apple })` in `getEntitlements()`.
4. **App:** StoreKit 2 purchase via a maintained library (for example
   `expo-iap` or `react-native-iap`; requires a development build, not Expo
   Go), a restore-purchases control, and the subscription disclosure text
   Apple requires (price, period, auto-renewal, how to cancel).
5. **Review guidelines to check at submission:** 3.1.1 (digital
   subscriptions sold in the app use In-App Purchase), 3.1.2 (auto-renewable
   subscription disclosures), 3.1.3 (multiplatform services — whether a web
   subscriber may use the app), 5.1.1(v) (in-app account deletion — done).

## The decision this now needs (October 2026)

Guideline 3.1.3(b) lets an app unlock a subscription bought on the web only
"provided those items are also available as in-app purchases within the app".
The United States storefront exception (3.1.1(a)) allows links and buttons to
web checkout; it does not remove that condition. Apps in Atturel's position —
no prices or purchase buttons, a web-paid plan visible on the review account —
have been rejected under 3.1.1 (Apple Developer Forums, May 2026). Before the
first App Store submission, choose: build the StoreKit plan below, or submit
with a Free reviewer account and accept that risk. TestFlight internal testing
is not affected. See docs/IOS_READINESS.md §5.

## Until then

The iOS app sells nothing and shows no price. A web subscriber signs in and
has Pro. The one link out is "Create an account on the web" on the sign-in
screen; check it against the guideline text current at submission.
