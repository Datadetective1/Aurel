# App Store subscriptions (StoreKit): built, waiting on App Store Connect

**Decision (owner, 8 Nov 2026):** Pro is sold inside the iPhone app through
Apple's in-app purchase, alongside web billing through Stripe. Apple's
commission is accepted (15% under the App Store Small Business Program, 30%
without it). Guideline 3.1.3(b) lets the app unlock a web subscription only if
Pro is also offered as an in-app purchase, so this is what makes a public App
Store release possible.

The code is complete and tested. Nothing is sold until the owner steps below
are done: without the App Store product, the app shows no purchase at all.

## How it works

1. **The app** (`mobile/src/components/apple-pro.tsx`, `mobile/src/lib/purchases.ts`,
   using `expo-iap` 6.2.0, StoreKit 2) shows the Pro section on Account only
   when the server says the account may buy and the App Store returns the
   product with its local price. It buys with `appAccountToken` set to the
   account's id, so Apple's own records name the account.
2. **The app sends the transaction Apple signed** to
   `POST /api/mobile/purchases/apple`, and finishes the transaction with
   StoreKit only after the server answers 200. Offline or a server error: the
   transaction stays unfinished and StoreKit hands it back on the next launch.
   A payment is never lost.
3. **The server verifies Apple's signature** (`src/lib/billing/apple/jws.ts`):
   ES256, a three-certificate chain ending in Apple Root CA - G3 (pinned by its
   SHA-256 fingerprint), Apple's marker extensions on the intermediate and the
   signing certificate, validity dates, then the signature itself. Pure
   `node:crypto`, no dependency. Then it checks the transaction is Atturel's
   bundle, a known product, an auto-renewable subscription, from Production or
   Sandbox (`src/lib/billing/apple/subscriptions.ts`).
4. **Binding** (`src/lib/billing/apple/process.ts`): one Apple subscription
   (its `originalTransactionId`) belongs to one Atturel account, forever. A
   purchase made for another account is refused (403); a subscription already
   linked elsewhere is refused (409). A database trigger also makes `user_id`
   immutable.
5. **App Store Server Notifications v2** arrive at `POST /api/apple/notifications`:
   renewals, billing retry and grace period, auto-renew turned off, expiry,
   refunds. Each is verified, ledgered by `notificationUUID` (applied once;
   a retry in flight is answered 409 so Apple tries again), and applied in
   order: transactions by purchase date, renewal info by its signed date. A
   purchase the app never reported (it crashed) is still recorded from the
   notification, through `appAccountToken`.
6. **Access comes from dates, not a stored status.** Before `expires_at`:
   active. Inside Apple's billing grace period: still Pro (like Stripe's
   `past_due`). Refunded: no access. After that: Free. A lost notification
   cannot leave anyone on Pro forever.
7. **Everywhere else reads one answer.** `getEntitlements()` feeds the Apple
   row into `resolveEntitlement()`. The web Plan page and the app's Account
   screen say "Billed by Apple" with Apple's own dates and no price (Apple sets
   it), and point to iPhone Settings to manage it. Manage billing (Stripe) is
   hidden for Apple-only subscribers. Account deletion asks the person to
   cancel with Apple first, for any account Apple is billing.
8. **No double billing.** The app offers no purchase to a web subscriber or a
   full-access (pilot or owner) account. The web offers no Stripe checkout to
   an account already on Pro through Apple.

Sandbox purchases are accepted on production on purpose: App Review buys in
the sandbox against the production server. Only TestFlight testers and Apple's
reviewers can make sandbox purchases, and they are never charged.

## Database: migration 0025 (not applied yet)

`supabase/migrations/0025_app_store_subscriptions.sql`, additive only:

- `app_store_subscriptions` keyed by `original_transaction_id`, with
  `user_id` (cascade on account deletion), product, latest transaction and
  purchase date, environment, `expires_at`, `revoked_at`, `auto_renew`,
  `grace_period_expires_at`, `renewal_state_at`, and a `version` column for
  compare-and-swap writes. RLS on; an account may read its own rows; only the
  service role writes.
- `app_store_notifications`, the ledger, with
  `claim_app_store_notification()`, the same contract as
  `claim_stripe_event()` (0021). Service role only.

Checked on a local PostgreSQL 16 with stand-ins for Supabase's auth schema:
applies cleanly twice; the ledger answers claimed, in_progress, duplicate and
re-claims a failed one; `user_id` cannot change; a signed-in user can read only
their own row and can write nothing; deleting an account removes its rows.

Until 0025 is applied, nothing breaks: the Apple read fails quietly, no one
gets Apple access, and the app is told not to offer a purchase.

## Owner steps (App Store Connect and Supabase)

Do these in order. None costs money; the $99 developer membership is already
paid.

1. **Merge the pull request, then apply migration 0025** to production.
2. **Agreements, Tax, and Banking** in App Store Connect: accept the Paid Apps
   agreement, add the bank account and the tax form. Nothing can be sold until
   it shows Active. If the account is moving to Harborlune LLC, doing this
   after the conversion puts payouts in the company's name from the start.
3. **Enroll in the App Store Small Business Program**
   (developer.apple.com/app-store/small-business-program). This is what makes
   Apple's share 15% instead of 30% in the first year of each subscription.
4. **Create the subscription** in App Store Connect › Atturel › Subscriptions:
   - a subscription group, for example "Atturel Pro";
   - one auto-renewable subscription, duration 1 month, Product ID exactly
     `com.atturel.app.pro.monthly` (it must match
     `src/lib/billing/apple/subscriptions.ts`);
   - the price: the owner's choice. The web price is $29 a month; check which
     price points Apple offers near it (not verified here);
   - a display name and description (for example "Atturel Pro" and "Meeting
     preparation, relationship memory and follow-through for professionals"),
     and the review screenshot of the Pro section on the Account screen.
5. **App Store Server Notifications** (App Store Connect › Atturel › App
   Information): set both the Production and the Sandbox Server URL to
   `https://www.atturel.com/api/apple/notifications`, version 2. Then use
   "Request a Test Notification"; the log shows `apple.notification` with
   outcome `ignored`, reason `test`.
6. **A new iOS build.** StoreKit is a native module, so the current TestFlight
   build (0.1.0 (5)) cannot buy. Build through the existing iOS workflow.
7. **Test on TestFlight** (free: TestFlight purchases use the sandbox and are
   never charged): buy, see Pro on the phone and on the website, cancel in
   Settings and see "Pro until …", restore on a second device. A sandbox month
   lasts minutes, so renewals and expiry can be watched in an hour.
8. **Submit** the subscription together with the next app version. Keep the
   App Review demo account (`appreview@atturel.com`) on the standard tier,
   without an invitation code: a full-access account is never offered the
   purchase, and the reviewer must be able to find it.

## What was not verified

- No purchase has gone through Apple yet: everything above was tested with a
  throwaway certificate chain built to imitate Apple's, not with a real Apple
  signature. The first TestFlight purchase (step 7) is that evidence.
- Apple's online certificate revocation check (OCSP) is not performed. Apple's
  own library makes it optional; the chain, markers, pinned root and dates are
  all checked.
- The `expo-iap` native module has not run on a device; its JavaScript API
  matches what the code calls, and the build configuration resolves.

## Guidelines checked

- 3.1.1: Pro sold in the app uses In-App Purchase.
- 3.1.2: the Pro section shows the name and length, the price from StoreKit in
  local currency, that it renews until cancelled and how to cancel, and links
  to the Terms of Use and the Privacy Policy. Restore purchases is always
  available.
- 3.1.3(b): a web subscriber may use Pro in the app because it is also sold in
  the app.
- 5.1.1(v): account deletion in the app (done earlier); an Apple subscriber is
  told to cancel with Apple.
