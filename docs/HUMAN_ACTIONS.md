# Human actions

Everything here needs you. Not because the work is unfinished, but because it
needs a credential, a payment, a legal judgement, or a signature.

**The product runs today without a single item on this list.** It degrades
honestly instead, and Settings → Capabilities tells the user exactly which parts
are off.

---

## Activation at a glance

| # | Capability | Blocked by | Free tier? | Code status |
| --- | --- | --- | --- | --- |
| 1 | **AI reasoning** | — | — | **Live — OpenAI** |
| 2 | **Automatic research** | API key | **Yes — 2,000/mo free** | Complete |
| 3 | Document ingestion | — | — | **Live** |
| 4 | Calendar | OAuth client **+ code** | Yes | **Not built** |
| 5 | Billing | Stripe account | Yes (test mode) | Complete |
| 6 | Email | API key + domain | **Yes — 3,000/mo free** | Complete |

Items 2, 5 and 6 are credential-only: paste the variables, redeploy, done.
Item 4 needs implementation as well — see §4 for why I have not written it
blind.

Set every variable in **Vercel → Project → Settings → Environment Variables**
(Production), never in `.env.production`, which is committed.

---

## 1. AI reasoning — **live, nothing needed**

Running on **OpenAI `gpt-4.1-mini`** via the Responses API, from `OPENAI_API_KEY`
alone. Settings → Capabilities names the provider and model actually in use.

**A key is the whole configuration.** `AI_PROVIDER` and `AI_MODEL` are optional
and should normally stay unset — the provider is inferred from whichever key is
present, and the model default follows from the provider.

```
OPENAI_API_KEY=sk-...
```

> **Do not leave `AI_PROVIDER=grounded` set.** It is the off switch, and it wins
> over any key. The old `.env.example` shipped it as a default, which is exactly
> why adding the key the first time appeared to do nothing.

**Why `gpt-4.1-mini`.** The prompts are structured extraction at low temperature
over evidence we supply, not open-ended reasoning — a fast, cheap,
temperature-respecting model fits, and keeps a brief quick enough to read before
the meeting starts. To change it, set `AI_MODEL`. To move to Anthropic, set
`ANTHROPIC_API_KEY` instead; with both set, Anthropic wins unless `AI_PROVIDER`
says otherwise.

| | |
| --- | --- |
| **Console** | https://platform.openai.com/api-keys |
| **Spend cap** | https://platform.openai.com/settings/organization/limits |
| **Free tier** | None ongoing. New accounts may get a small trial credit; after that it is pay-as-you-go against a prepaid balance. |
| **Cost** | Per token. A meeting brief is roughly 4–8k input and 1–2k output tokens — well under a cent each on `gpt-4.1-mini`. **Set a monthly cap before real use.** |

**The one thing still worth doing:** set that spend cap. Nothing in the product
can do it, and nothing in the product limits your bill — the plan quotas limit
*users*, not spend.

**Verify**

```
npx tsx scripts/ai-check.ts
```

Prints the resolved provider and model, then round-trips the three real
production schemas — meeting brief, debrief, source extraction — against the
live model. It prints no key material. In the product:

1. Settings → Capabilities: **AI reasoning** → **Connected**, naming the model.
2. Any meeting brief → **Rebuild**. The evidence footer stops saying *"Composed
   directly from the records below. No language model was involved."*
3. Settings → Plan → *This month*: the meters accrue.

If the provider errors or times out, the brief falls back to the composer and
logs `ai.fell_back_to_grounded`. The user still gets a brief — but a run of that
line in the logs means AI is effectively off, not that it is degrading
gracefully. It is the line to watch.

---

## 2. Automatic professional research

Pasting a link already works and needs no credential. What is gated is turning
a *name* into candidate URLs, which needs a web index. There is no legitimate
way to do that without a search API — the alternative is scraping a search
engine, which violates its terms.

| | |
| --- | --- |
| **Service** | Brave Search API (recommended) or Serper |
| **Sign-up** | https://api-dashboard.search.brave.com/register → **Subscriptions** → choose *Data for Search*<br>or https://serper.dev → *API Key* |
| **Free tier** | **Brave: yes** — 2,000 queries/month free, one query per second. A card is required to activate even the free plan.<br>**Serper:** 2,500 one-off trial credits, no card. |
| **Cost** | Beyond Brave's free tier, roughly \$3–5 per 1,000 queries depending on plan. One *Research person* run costs **one** query. |

```
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=BSA...
```

or

```
SEARCH_PROVIDER=serper
SERPER_API_KEY=...
```

**Already built — nothing engineering-side is left:** provider abstraction with
two implementations, the discovery → rank → fetch → extract → identity-resolve
→ fact → memory-proposal pipeline, research jobs recording stages and cost,
entitlements and metering, and every loading, empty, error and rate-limited
state.

**Verify after configuring**

1. Settings → Capabilities: **Finding sources automatically** shows
   **Connected** and names the provider.
2. Add a person with a name and company but **no profile URL**.
3. Press **Research public footprint**.
   - Before: *"paste a link instead"*.
   - After: sources are discovered, fetched, identity-checked and cited.
4. Settings → Plan: *People researched* increments.

---

## 3. Document ingestion — **live, nothing needed**

PDF, Word `.docx` and plain text, up to 10 MB, on the free plan (2/month).
Person page → **Attach a document**. A scanned PDF with no text layer is
refused by name rather than saved as an empty source.

---

## 4. Calendar — needs code as well as credentials

**I have not built this, and I want to be straight about why.**

The database tables exist (`integration_accounts`, `external_calendar_events`)
and the capability screen reports it honestly as *Unavailable*. But there is no
OAuth flow, no token encryption, no sync, and no attendee-to-person matching.

Writing an OAuth integration I cannot execute even once would mean shipping
several hundred lines of unverifiable code into the security-sensitive part of
the product — token storage and refresh. I would rather tell you it is missing
than have you discover it is subtly wrong.

If you want it, the credential half is:

| | |
| --- | --- |
| **Service** | Google Cloud (Calendar API) and/or Microsoft Entra ID |
| **Setup** | https://console.cloud.google.com/apis/credentials → *Create OAuth client ID* → Web application<br>Enable **Google Calendar API** under *APIs & Services → Library* |
| **Scope** | `https://www.googleapis.com/auth/calendar.readonly` — read-only, nothing else |
| **Free tier** | Yes. Calendar API has no charge at this volume. |
| **Cost** | None directly. Google **verification** is required before outside users can connect, and takes weeks. |
| **Redirect URI** | `https://<your-domain>/auth/google/callback` |

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Say the word and I will build it — but it needs the credentials in place first
so it can be tested against a real account rather than guessed at.

---

## 5. Billing

Checkout, the billing portal, the webhook, entitlements, metering and the
founding-customer offer are all implemented. Only the account is missing.

| | |
| --- | --- |
| **Service** | Stripe |
| **Sign-up** | https://dashboard.stripe.com/register |
| **Keys** | https://dashboard.stripe.com/apikeys |
| **Webhook** | https://dashboard.stripe.com/webhooks → *Add endpoint* |
| **Free tier** | Test mode is free and unlimited. Live mode has no monthly fee. |
| **Cost** | Per transaction, around 2.9% + 30¢ in the US; varies by country. |

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
SUPABASE_SERVICE_ROLE_KEY=...
```

Steps in order:

1. Create the **Pro** product and its monthly and yearly prices. Prices in
   `src/lib/billing/plans.ts` are display copy — **Stripe is the source of
   truth for what is charged. Keep them in agreement.**
2. Add a webhook endpoint at `https://<your-domain>/api/stripe/webhook`
   subscribed to exactly: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **`SUPABASE_SERVICE_ROLE_KEY` is required.** The webhook is the only thing
   allowed to grant a plan, and it writes with the service role. Without it a
   payment succeeds and nothing happens. Get it from
   Supabase → Project Settings → API → `service_role`.
5. Decide whether the founding offer runs. `FOUNDING_OFFER` in
   `src/lib/billing/plans.ts` sets the cap and the protection window. The copy
   promises **12 months**, not lifetime — if you change one, change the other.

**Verify after configuring**

1. Settings → Capabilities: **Payments** shows **Connected**.
2. Settings → Plan shows **Upgrade**. In test mode use card `4242 4242 4242 4242`.
3. After checkout the plan flips to **Pro** — driven by the webhook, not the
   redirect. If it does not, the webhook secret or the service role key is wrong.
4. `stripe listen --forward-to localhost:3000/api/stripe/webhook` to test locally.

---

## 6. Email

Templates, the transport, and the send call sites are all implemented. A
welcome email fires on signup and a security notice on password change. With no
key configured they are written to the server log — subject and a redacted
recipient only, never the body.

| | |
| --- | --- |
| **Service** | Resend |
| **Sign-up** | https://resend.com/signup |
| **API key** | https://resend.com/api-keys |
| **Domain** | https://resend.com/domains → *Add domain*, then add the DNS records it gives you |
| **Free tier** | **Yes** — 3,000 emails/month, 100/day, one custom domain. |
| **Cost** | \$20/month beyond the free tier. |

```
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=hello@yourdomain.com
```

**The sending domain must be verified before any mail leaves.** DNS propagation
takes minutes to hours. `EMAIL_FROM_ADDRESS` must be on the verified domain.

**Verify after configuring**

1. Settings → Capabilities: **Email** shows **Connected** and names the sender.
2. Sign up a fresh account — the welcome email arrives.
3. Preview every template locally at `/dev/emails` (development only; it 404s
   in production).

---

## 7. Before anyone else uses this

### 7.1 Legal review of Terms and Privacy — **the real launch blocker**

`brand.legal.policiesLegallyReviewed` is `false`, and both pages say plainly
that they await review. They accurately describe real behaviour, which is the
right starting point for a lawyer — but they are not legal advice.

A reviewer needs to consider at minimum:

- The commitment never to infer protected characteristics. It is enforced in
  prompts and in the data model; it still needs signing off as a public promise.
- **The basis for storing information about third parties** — the colleagues a
  user records, who never agreed to anything. This is the sharpest question in
  the product.
- Retention and deletion, including backups. `delete_my_data()` removes every
  row a user owns.
- Whether you need a DPA, and where.

Then set `policiesLegallyReviewed: true` and fill in `legal.entityAddress` and
`legal.jurisdiction`.

### 7.2 The name

`ATTUREL` has not been trademark-cleared and `atturel.app` is not registered.
The brand registry keeps a rename to one file — do not commission a logo or
build SEO authority on it until a search comes back clean.

### 7.3 What you are promising about AI

This is now live, not hypothetical: relationship data — including notes about
third parties who never agreed to anything — is being sent to OpenAI's API on
every brief, debrief and coach question. Confirm OpenAI's retention terms and
their position on training from API traffic, and make sure the privacy policy
names them. Right now it does not name any provider.

---

## What is deliberately not here

Considered and rejected, not deferred:

- **LinkedIn scraping.** Automating login, circumventing rate limits or
  replicating their dataset would violate their terms and risk user bans.
- **Bypassing paywalls, CAPTCHAs or robots directives.** The fetcher records
  "paywall" or "login required" as an honest outcome instead.
- **Hiring, firing, promotion or compensation scoring.** Not a missing feature.
