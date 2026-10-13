# Commercial readiness

## Launch pass — 13 October 2026 (branch `visual-mobile-foundation`)

Resolves items 1–7 of "Still contradictory or blocking" below. Nothing was
deployed to production, Stripe live mode was not touched, and no migration was
applied.

| Was | Now | Where |
| --- | --- | --- |
| Deletion left a Stripe subscription charging | Billing is stopped first (open checkouts expired, subscriptions cancelled immediately, open invoices voided); if Stripe cannot confirm, nothing is deleted. A late subscription for a deleted account is cancelled by the webhook. Minimal audit row in `account_deletions`. | `lib/account/deletion.ts`, `deletion.server.ts`, migration 0021 |
| Founding price not wired; $49 shown | Pro is $29/month (`PLANS.pro`, `FOUNDING_OFFER`); checkout refuses to start unless the Stripe price is exactly $29 USD monthly | `lib/billing/plans.ts`, `stripe.ts` `priceMatchesOffer`, `settings/billing/actions.ts` |
| Unapproved claims: "first 250 members", "$49" strikethrough, "held for 12 months" | Not shown, not enforced, not stored — `maxCustomers`, `referencePriceCents`, `priceProtectionMonths` are `null` until approved | `FOUNDING_OFFER` |
| Yearly price advertised but unbuyable | No annual plan offered | pricing page, checkout |
| Atlas and calendar advertised as Pro but open to Free | Enforced on the server (web page, mobile route, calendar connect/callback/sync) | `checkCapability('relationshipAtlas' / 'calendarIntegration')` |
| Transcribed audio metered as "1 call" | Metered in seconds from the file's own header (`transcription_seconds`), priced per minute where a published rate exists; no allowance set yet | `lib/billing/transcription.ts`, `lib/capture/audio-duration.ts` |
| Webhook had no ledger, could reorder | `stripe_events` ledger with atomic claim; every event re-reads the subscription; older reads never overwrite newer | `lib/billing/webhook.ts`, migration 0021 |
| No billing emails | Pro activated, cancellation scheduled, Pro ended. Receipts and failed-payment emails are Stripe's — switch them on (see below) | `lib/billing/notify.ts` |
| ~17-minute recording ceiling | Segmented, private, temporary storage: ten-minute segments, transcribed and deleted one by one, two-hour ceiling | `lib/capture/*`, `api/capture/*`, migration 0022 |
| Web recorder allowed 30 min / 24 MB over a 4.5 MB request limit | 17 minutes at 32 kbps, stated up front | `components/app/voice-recorder.tsx` |
| Placeholders `[Registered address — pending]` on Terms and Privacy | Omitted until supplied | `lib/brand` |
| No payments, voice or provider disclosure in Privacy | Added, describing what the code does | `(marketing)/privacy` |
| "Weekly relationship summary" and meeting reminders promised in Settings | Removed (neither is sent) | `settings-forms.tsx` |

### Before the first paying customer

1. Apply migration **0021** (billing integrity) to production. The webhook
   refuses to process events without its ledger (by design), so 0021 must be
   applied **before** this branch's webhook receives live events.
2. In Stripe (test mode first): create the product **Pro Founding**, one
   recurring price **$29.00 USD monthly**, and set
   `STRIPE_PRICE_PRO_MONTHLY` to its id. Set `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET`; point the webhook at `/api/stripe/webhook` with
   these events: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted|paused|resumed`,
   `invoice.paid`, `invoice.payment_failed`.
3. Stripe → Settings → Billing → **Customer portal**: allow cancellation **at
   the end of the billing period** (Terms and the pricing FAQ promise access
   until the period ends), allow payment-method updates.
4. Stripe → Settings → **Customer emails**: turn on successful-payment
   receipts and failed-payment emails (Atturel deliberately does not send its
   own copies).
5. Decide: refund policy (Terms currently says nothing about refunds);
   whether Stripe Tax is needed; whether the founding cap, reference price or
   price lock are wanted at all.
6. Legal facts below, and lawyer review of Terms and Privacy (both still show
   "Draft").

---

## Earlier audit (session 1)

Audited 13 October 2026 against the code on `visual-mobile-foundation`.
Stripe was **not** activated. No prices, products or keys were created.

## Fixed tonight (proven by the implementation)

| Was | Now | Proof |
| --- | --- | --- |
| Teams: "Per seat, billed annually" | "Not available yet — tell us if your team would use it" | `planForPrice` (`lib/billing/stripe.ts`) can only return `pro`; no seats, no team price, team workspaces are "later" in `lib/workspace.ts` |
| FAQ: "On a team plan, your private notes stay private" | Conditional, matching the privacy page | Same |
| "Storing people … is unmetered on every plan"; "People" under *Never metered* | Free holds up to five people; Pro has no limit | `PLANS.free.limits.people = 5`, enforced by `checkPersonLimit()` |
| Settings: "Storing people … is never metered" | Notes and observations only | Same |
| Pro highlight "Weekly relationship intelligence" | Removed | `weeklySummaryEmail` is only rendered by `/dev/emails`; `vercel.json` has one cron (follow-through) |
| Teams highlight "Shared meetings and commitments" | Removed | No sharing UI or shared workspace exists |
| Terms: limits "are published on the pricing page" | "shown under Settings → Plan" | The pricing page shows no Pro numbers; Settings renders used/limit per metered operation |
| A paying user with an owner/pilot grant could not reach *Manage billing* | Always shown when the plan is not Free | `settings/billing/page.tsx` hid the whole row for full-access tiers |

## Still contradictory or blocking — needs a decision

1. **Account deletion does not cancel a Stripe subscription.** `deleteAccount` removes data and the auth user; Stripe keeps charging, and later webhooks fail the foreign key and retry. Fix before taking money: cancel the subscription (or refuse deletion while one is active) inside `deleteAccount`.
2. **The founding price is not wired.** `FOUNDING_OFFER` says $29 for 12 months, but checkout always uses `STRIPE_PRICE_PRO_MONTHLY`. Any of the first 250 subscriptions is flagged founding whatever it paid; `price_protected_until` is written and never read.
3. **Settings shows "$49 per month" to every Pro user**, founding and yearly included.
4. **Yearly cannot be bought.** Nothing passes `interval: 'yearly'` to checkout.
5. **Pro-only capabilities are not gated.** No call checks `calendarIntegration`, `relationshipAtlas`, `deepResearch` or `advancedMemory`; Free gets them. Pro's real difference today is quotas and unlimited people. Either gate them or stop listing them as Pro.
6. **Voice transcription is metered but never limited** on any plan — open cost exposure, now reachable from the phone too.
7. **Webhook has no event ledger** (duplicates and out-of-order events can overwrite newer state); tax is off; no billing emails (receipt, failed payment, cancellation) — Stripe's own emails would have to be switched on.
8. **Legal.** `entityAddress` and `jurisdiction` render as `[… — pending]` on live Terms and Privacy; `policiesLegallyReviewed: false`; Terms calls itself "not yet a binding legal document" while sign-up says "By continuing you agree to the Terms"; no subprocessor list (OpenAI, Exa, Supabase, Stripe, Resend, Google/Microsoft), retention, data location, minimum age, refunds, auto-renewal disclosure.
9. **Claim to verify:** "never used to train a shared model" depends on the AI vendors' API terms.

No competitor claims were found in the marketing pages.

## Facts only Amary can supply

Legal entity name and registration · registered address · governing law and venue · effective date · lawyer review · refund policy · tax collection (Stripe Tax / VAT) · real Stripe prices and how $29 is applied (separate price or coupon) · what happens after the founding year · whether yearly counts as founding · whether Teams is sold, waitlisted or hidden · Pro limits to publish · pilot terms and duration · AI vendor retention and no-training confirmation · subprocessor list · data location, retention and backup windows · minimum age · Stripe portal settings (cancel at period end) · whether Pro-only features should be gated · trademark clearance · iOS bundle identifier and Apple team.

---

## Entitlements: one canonical layer, two payment channels

### What exists

Authorization is already **not** Stripe's. At runtime `getEntitlements()` (`lib/billing/entitlements.ts`) reads only Supabase:

```
subscriptions.plan + status        (written only by the Stripe webhook, service role)
  → PLANS[plan]                    (capabilities, quotas, people limit)
  → applyAccessTier(owner|pilot)   (access_grants)
  → entitlement_overrides          (per-user, expiring)
  → checkCapability() / recordUsage()
```

That is the right shape for two channels: the app never asks a payment provider what a user may do, it asks Atturel's own table. Keep it that way.

### What to add (prepare a migration; do not apply until Stripe goes live)

`subscriptions` is one row per user and Stripe-shaped. Make the provider explicit rather than implied:

```sql
alter table public.subscriptions
  add column provider text not null default 'stripe'
    check (provider in ('stripe', 'apple', 'manual')),
  add column provider_product_id text,          -- Stripe price id / App Store product id
  add column apple_original_transaction_id text unique,
  add column apple_environment text check (apple_environment in ('sandbox', 'production')),
  add column revoked_at timestamptz,             -- refunds / revocations
  add column last_provider_event_at timestamptz; -- ordering guard

create table public.billing_events (            -- idempotency for both webhooks
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
```

- **One active entitlement per user.** If both channels report an active subscription, the more generous plan wins and the other is flagged for support; never two rows fighting over `plan`.
- **Product → plan mapping** lives in code beside `planForPrice`: `planForAppleProduct('com.atturel.pro.monthly') → 'pro'`. Apple price tiers may not land exactly on $29/$49 — decide the tier before launch.
- **Writers.** Stripe: the existing webhook. Apple: a new `/api/apple/notifications` route for App Store Server Notifications v2 (signed JWS, verified against Apple's certificate chain), plus a `/api/mobile/purchases/verify` route the app calls after a StoreKit 2 purchase with the signed transaction. Both upsert the same row, both record into `billing_events` first, both ignore events older than `last_provider_event_at`.
- **Reads are unchanged.** `getEntitlements()` keeps reading `plan` and `status`; nothing in the product needs to know which channel paid.

### Stripe integration points (web)

| Concern | Where | State |
| --- | --- | --- |
| Checkout | `settings/billing/actions.ts` → hosted Checkout | Built; monthly only |
| Portal (upgrade, downgrade, cancel, card) | `openBillingPortal` | Built; behaviour depends on portal configuration |
| Webhook | `api/stripe/webhook` — checkout completed, subscription created/updated/deleted, payment failed | Built; needs event ledger |
| Downgrade | `status` outside trialing/active/past_due → Free; nothing deleted | Built |
| Cancellation | Portal, at period end | Depends on portal setting |
| Account deletion | Must cancel Stripe first | **Missing** |

### Apple / App Store

- App Store guideline 3.1: digital subscriptions sold inside an iOS app go through In-App Purchase, and the app must not steer users to buy elsewhere. Today the iOS app sells nothing, shows no prices and has no purchase call to action — it signs existing accounts in. Whether that is acceptable for this app before StoreKit exists is Apple's call under the guideline text current at submission (the multiplatform provisions in 3.1.3 are the relevant section); check it before the first review rather than assume it. The one link out is "Create an account on the web" on the sign-in screen, which may need to go for review.
- Account deletion is required in-app for apps with sign-in (5.1.1(v)). The app currently sends users to the web; an in-app deletion entry point that calls the existing `deleteAccount` path is needed before submission.
- Apple subscribers deleting their account must be told to cancel in iOS Settings — Atturel cannot cancel an Apple subscription.
