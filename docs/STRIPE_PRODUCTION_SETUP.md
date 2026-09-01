# Stripe — production setup

Everything in this document is done in a browser, in the Stripe dashboard, the
Vercel dashboard and the Supabase SQL editor. Nothing here needs a code change:
the repository is complete, and every value below is read from an environment
variable.

Work through it in order. Steps 1–4 are prerequisites, 5–9 are configuration,
10 is the test-mode rehearsal, 11–13 are going live.

> **The one thing that breaks silently.** The webhook is the only thing allowed
> to grant a plan, and it writes with the Supabase **service role** key. Without
> `SUPABASE_SERVICE_ROLE_KEY` set in Vercel, a customer's card is charged, Stripe
> reports success, and their account stays on Free. Step 3.

---

## 1. Apply the database migration — **do this before deploying**

`supabase/migrations/0017_stripe_webhook_reliability.sql` adds the webhook event
ledger, the ordering watermark and the two functions the webhook calls. The new
code calls `apply_stripe_subscription()`; if the migration has not run, every
webhook delivery returns 500.

That failure is loud and recoverable — Stripe retries for three days, so the
events replay once the migration lands — but there is no reason to have it.

In **Supabase → SQL Editor**, paste and run the whole file. Or, with a
connection string:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0017_stripe_webhook_reliability.sql
```

Or let the runner do it. Your database predates the migration ledger, so it
needs telling what is already applied — once, after checking that 0016 really is
the highest migration it has:

```bash
DATABASE_URL="postgres://..." npm run db:migrate -- --adopt-through 0016
DATABASE_URL="postgres://..." npm run db:migrate     # applies 0017, and nothing else
```

Migrations are forward-only and applied in filename order. This one is purely
additive: a new table, a nullable column, two functions. It touches no existing
row and is safe to run against a live database.

Confirm it worked, either with the assertion suite:

```bash
psql "$DATABASE_URL" -f supabase/tests/billing-webhook.sql
# ... ALL BILLING WEBHOOK ASSERTIONS PASSED
```

It creates two throwaway accounts, exercises ordering, idempotency, failed
payments and the permission boundary, and always rolls back — so it is safe to
run against production.

Or by hand:

```sql
select column_name from information_schema.columns
 where table_name = 'subscriptions' and column_name = 'stripe_event_at';
-- 1 row

select routine_name from information_schema.routines
 where routine_name in ('apply_stripe_subscription', 'mark_stripe_payment_failed');
-- 2 rows

select count(*) from public.stripe_webhook_events;
-- 0
```

## 2. Create the Stripe account

<https://dashboard.stripe.com/register>. Complete the business profile far
enough that live mode can be activated later; test mode works immediately.

## 3. Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel

Supabase → Project Settings → API → `service_role` (**not** the anon key).

Vercel → Project → Settings → Environment Variables → Production.

Read the warning at the top of this document again. This is that step.

## 4. Set `NEXT_PUBLIC_SITE_URL` in Vercel

```
NEXT_PUBLIC_SITE_URL=https://www.atturel.com
```

Checkout's success and cancel URLs and the billing portal's return URL are all
built from this. If it is wrong, customers pay and are returned to a domain
that does not serve the app.

---

## 5. Create the product and its two prices

Stripe → **Product catalogue** → _Add product_.

| Field       | Value                                                      |
| ----------- | ---------------------------------------------------------- |
| Name        | `Atturel Pro`                                              |
| Description | Optional. It appears on the Checkout page and the invoice. |

Add **two recurring prices to that same product** — not two products:

|                | Monthly   | Annual    |
| -------------- | --------- | --------- |
| Price          | `19.00`   | `190.00`  |
| Currency       | `USD`     | `USD`     |
| Billing period | Monthly   | Yearly    |
| Type           | Recurring | Recurring |

Copy each price id (`price_…`, from the price row, **not** the product's
`prod_…`):

| Price       | Environment variable       |
| ----------- | -------------------------- |
| $19 / month | `STRIPE_PRICE_PRO_MONTHLY` |
| $190 / year | `STRIPE_PRICE_PRO_YEARLY`  |

These two numbers also appear in `src/lib/billing/plans.ts`, which is what the
pricing page and the account screen display. **Stripe is what actually charges.**
If you change a price in Stripe, change it there too — `plans.test.ts` pins both
numbers, so a mismatch is a failing test rather than a surprised customer.

## 6. Get the API keys

Stripe → **Developers → API keys**.

| Key             | Environment variable                 | Notes                                                                                                                                                        |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secret key      | `STRIPE_SECRET_KEY`                  | `sk_test_…` now, `sk_live_…` at step 12. Server only — it must never appear in `.env.production`, which is committed.                                        |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional. **Nothing reads it today** — checkout is Stripe-hosted, so no Stripe.js runs in the browser. Set it or leave it blank; it is validated and unused. |

## 7. Add the webhook endpoint

Stripe → **Developers → Webhooks** → _Add endpoint_.

**Endpoint URL** — exactly this path, which is fixed by the route file at
`src/app/api/stripe/webhook/route.ts`:

```
https://www.atturel.com/api/stripe/webhook
```

**Events to send** — these eight, and no others:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
```

Anything else is acknowledged with `{"handled": false}` and ignored, so
subscribing to more is harmless — but it makes the dashboard harder to read
during an incident.

Then reveal the endpoint's **Signing secret** (`whsec_…`) and set:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Every delivery is verified against this before it is parsed. A wrong value means
every event is rejected with 400 and no plan ever changes.

## 8. Configure the Customer Portal

Stripe → **Settings → Billing → Customer portal**.

This step is easy to skip and it fails in a way that looks like a bug in the
app: until the portal has been saved once, `billingPortal.sessions.create`
returns _"No configuration provided"_ and the Manage subscription button shows
an error. The app names that specific cause rather than a generic failure, but
the fix is only available here.

Turn on:

- **Invoice history** — customers can download their invoices.
- **Update payment method** — how a `past_due` account recovers.
- **Cancel subscription** → **at end of billing period**. Immediate cancellation
  takes away time somebody has paid for; the account screen is written for the
  end-of-period behaviour and says "Access ends" with the date.
- **Update subscription** → allow switching between the two Pro prices, so
  monthly ⇄ annual does not need support.

Set the **default redirect link** to `https://www.atturel.com/settings/billing`.

Press **Save**. The portal is not configured until you have.

## 9. Set every Vercel variable

Vercel → Project → Settings → Environment Variables → **Production**. Redeploy
after saving — Next.js inlines `NEXT_PUBLIC_*` at build time, so a variable
added without a redeploy does not reach the built app.

| Variable                             | Required | Value                         |
| ------------------------------------ | -------- | ----------------------------- |
| `STRIPE_SECRET_KEY`                  | Yes      | `sk_test_…`, then `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET`              | Yes      | `whsec_…` from step 7         |
| `STRIPE_PRICE_PRO_MONTHLY`           | Yes      | `price_…` for $19/month       |
| `STRIPE_PRICE_PRO_YEARLY`            | Yes      | `price_…` for $190/year       |
| `SUPABASE_SERVICE_ROLE_KEY`          | **Yes**  | Supabase service role key     |
| `NEXT_PUBLIC_SITE_URL`               | Yes      | `https://www.atturel.com`     |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No       | Unused today                  |

What each missing value does, so a half-configured deployment is diagnosable:

| Missing                                | Behaviour                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                    | `features.billing` is false. Pricing and Plan render, upgrade says "Payments are not connected on this deployment." Nothing else changes. |
| `STRIPE_WEBHOOK_SECRET`                | The webhook answers **503**. Checkout still works, so a payment succeeds and the plan never changes.                                      |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | That interval returns "That plan is not available yet." The other still sells.                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`            | The webhook answers **500** on every delivery. Stripe retries for three days; set the key and the backlog replays itself.                 |

The app builds and boots with none of them set. That is deliberate — running
without payments is a supported state, not an error.

---

## 10. End-to-end test in test mode

With test keys and test price ids in Vercel:

1. **Check the wiring.** Sign in → **Settings → Capabilities**. _Payments_
   should read **Connected**.
2. **Buy something.** **Settings → Plan** → _Upgrade to Pro_, or the public
   `/pricing` page. Card `4242 4242 4242 4242`, any future expiry, any CVC, any
   postcode.
3. **Watch the return.** You land on `/settings/billing?checkout=success`. The
   banner says _"Confirming your payment with Stripe…"_ and then _"You are on
   Atturel Pro."_ That banner does **not** trust the redirect: it asks the
   server to ask Stripe what the subscription actually is.
4. **Check the screen.** Plan reads **Pro**, status **Active**, Billing
   **$19 per month**, and **Renews** with a date about a month out.
5. **Check Stripe.** Payments → one succeeded payment. Customers → **one**
   customer, carrying `user_id` in its metadata.
6. **Check the webhook.** Developers → Webhooks → your endpoint. Recent
   deliveries are **200**. `checkout.session.completed` and
   `customer.subscription.created` should both be there.
7. **Check the database.**

   ```sql
   select plan, status, billing_interval, current_period_end,
          stripe_customer_id, stripe_subscription_id, stripe_event_at
     from public.subscriptions where user_id = '<your user id>';
   -- pro | active | monthly | <date> | cus_… | sub_… | <timestamp>

   select id, type, processed_at, outcome
     from public.stripe_webhook_events order by received_at desc limit 10;
   -- every row has a processed_at
   ```

8. **Check entitlement.** Try something Free cannot do: add a sixth person
   (Free stops at five), or analyse a transcript in a debrief. Both should now
   be allowed.
9. **Test the portal.** _Manage subscription_ → Stripe portal opens, showing
   the invoice and the card.
10. **Test cancellation.** Cancel in the portal. Back on Settings → Plan the
    status becomes **Canceling** and the date is labelled **Access ends**. You
    keep Pro until then — that is correct, not a bug.
11. **Test resubscription.** Renew in the portal; the status returns to
    **Active**.
12. **Test a failed payment.** In the portal, replace the card with
    `4000 0000 0000 0341` (attaches successfully, then fails on charge). Trigger
    a renewal with a Stripe **test clock**, or send the event by hand:

    ```bash
    stripe trigger invoice.payment_failed
    ```

    Status becomes **Payment failed**. Access is deliberately **not** revoked —
    Stripe retries for weeks, and cutting somebody off on one decline is how an
    expired card becomes a cancellation.

13. **Test annual.** Repeat step 2 with the Yearly toggle. Billing should read
    **$190 per year**.

To replay events locally instead:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# use the whsec_ it prints as STRIPE_WEBHOOK_SECRET in .env.local
```

---

## 11. Activate live mode

Stripe → **Activate payments**. Business details, bank account, tax
information. Stripe reviews it; this can take a day.

## 12. Switch to live keys

Test mode and live mode share nothing — not products, not prices, not webhook
endpoints, not customers.

1. **Recreate the product and both prices in live mode** (step 5 again, with the
   live/test toggle set to live). The price ids are different.
2. **Recreate the webhook endpoint in live mode** (step 7 again). The signing
   secret is different.
3. **Reconfigure the Customer Portal in live mode** (step 8 again). Live mode
   has its own configuration and starts unconfigured.
4. In Vercel, replace all four values at once — `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`,
   `STRIPE_PRICE_PRO_YEARLY`.

   A mixed set is the failure mode to avoid: a live secret key with test price
   ids returns "No such price", and live keys with the test webhook secret means
   every delivery is rejected as a bad signature.

5. **Redeploy.**

## 13. The first real purchase

Use a real card on an account you own, and do not use an owner or pilot account
— those are refused at checkout by design, because an owner who upgraded would
be paying for their own product.

Then confirm all six:

|                             | Where                                 | What you should see                                                            |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Stripe recorded the payment | Payments                              | One succeeded payment, $19.00                                                  |
| The webhook succeeded       | Developers → Webhooks                 | 200 for `checkout.session.completed` and `customer.subscription.created`       |
| The database updated        | SQL editor                            | `plan='pro'`, `status='active'`, `current_period_end` set (query in step 10.7) |
| The user became Pro         | Settings → Plan                       | **Pro**, Active, $19 per month, Renews _date_                                  |
| The portal works            | Settings → Plan → Manage subscription | The Stripe portal, with the invoice                                            |
| Cancellation works          | The portal → Cancel                   | Plan reads **Canceling**, **Access ends** _date_, access retained until then   |

Refund yourself from the Stripe dashboard afterwards if you would rather not
keep the charge.

---

## Things that are already decided, so you do not have to

- **The founding-customer offer is off** (`FOUNDING_OFFER.enabled = false` in
  `src/lib/billing/plans.ts`). It advertised $29/month with no Stripe price
  behind it, so it would have charged whatever `STRIPE_PRICE_PRO_MONTHLY` is
  while displaying a different number — and after the repricing to $19, its
  "discount" was above list price. Turning it back on needs a real
  `STRIPE_PRICE_PRO_FOUNDING`, a `priceIdFor` branch for it, and a founding
  price below $19. Two tests fail if any of that is skipped.
- **Tax is not collected.** `automatic_tax` is off. Turning Stripe Tax on is a
  dashboard setting plus a one-line change in
  `src/app/(app)/settings/billing/actions.ts`, and it has registration
  obligations attached — a decision, not a default.
- **Promotion codes are accepted at checkout.** Create them in Stripe →
  Product catalogue → Coupons; nothing in the app needs to know.
- **No trial is configured.** The code handles `trialing` correctly throughout
  if you add one to the price in Stripe.
- **Invitation codes still work and are not required to buy.** Anyone can sign
  up and subscribe. Pilot invitations remain a separate, additional path that
  grants full access without payment.

## Decisions still yours to make

None of these block taking money. All of them are commercial rather than
technical, which is why they are listed rather than decided.

**Four capabilities are declared Pro-only and gated nowhere.** `plans.ts` says
Free does not get them; no code checks:

| Capability            | State today                                                  |
| --------------------- | ------------------------------------------------------------ |
| `relationshipAtlas`   | Built. Reachable at `/atlas` on any plan.                    |
| `calendarIntegration` | Built. Connectable from Settings on any plan.                |
| `weeklyIntelligence`  | Not built. An email template exists; nothing sends it.       |
| `deepResearch`        | Not built. A capability flag and a meter kind, no call site. |

The pricing page no longer advertises any of them — selling something a free
account already has is worse than not selling it — and
`src/lib/billing/enforcement.test.ts` fails if one reappears in a plan's
highlights while ungated.

Gating the first two is one `checkCapability` call at each entry point. It is
left undone deliberately: it would take capability away from accounts that have
it today, and that is a decision about what Free is for. Three options, in
descending order of how much they change:

1. **Gate them.** Pro gets a second reason to exist beyond headroom. Existing
   free users lose two features they currently use.
2. **Move them to Free properly** — set the flags false-to-true on Free so the
   configuration matches reality, and lean on quotas as the whole difference.
3. **Leave as is.** The flags stay aspirational, the copy stays quiet, and the
   test keeps them from being sold by accident.

**The Free/Pro quota ratios are inherited, not chosen.** Free gets 3 researched
people, 3 briefs, 20 coach questions and 5 people; Pro gets 60, 150, 600 and
unlimited. Those were set before there was a price. At $19 they are worth a
second look once there is usage data — `limit_reached` is already tracked, and
`entitlement_overrides` lets support raise a ceiling for one account without a
deploy.

**Free gets one debrief a month, and that is probably too few.** `debrief` and
`transcriptAnalysis` both meter against `transcript_analysis`, which Free sets
to 1 — so a free account can debrief once per calendar month and the second
attempt is refused. The debrief is the step that produces the relationship
record the whole product is built on, so this is the ceiling most likely to stop
somebody before they have seen why Pro is worth $19. The free highlight now
states the limit rather than implying it is unlimited; raising it is a one-line
change in `PLANS.free.quotas`.

**Voice transcription now has a ceiling where it had none.** It called a paid
speech-to-text provider with no check at all. Free is 5 a month and Pro 300,
anchored to the debrief they feed rather than chosen freely. Revisit both with
usage data; `limit_reached` is already tracked.

**There is no trial.** The code handles `trialing` correctly everywhere; adding
one is a setting on the Stripe price.

## What cannot be done from the repository

These need a person with dashboard access, which is the whole of what is left:

1. Creating the Stripe account and activating live payments.
2. Creating the product and the two prices (test mode and again in live mode).
3. Creating the webhook endpoint and reading its signing secret.
4. Configuring the Customer Portal (test mode and again in live mode).
5. Setting the environment variables in Vercel and redeploying.
6. Running the migration in step 1 against the production database.
7. Making a real purchase with a real card.

Everything else — checkout, the portal, the webhook, entitlements, the pricing
page, the account screen, the failure states — is implemented and tested.
