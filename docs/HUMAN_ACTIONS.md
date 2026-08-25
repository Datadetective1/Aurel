# Human actions

Everything in this file needs a person. Not because the work is hard, but
because it requires a credential, a payment, a legal judgement, or a signature —
things that cannot and should not be automated on someone's behalf.

Nothing here blocks the product from running. Atturel works today without a
single item on this list: it degrades honestly instead, and the
**Settings → Capabilities** screen tells the user exactly which parts are off.

Ordered by what actually gates a launch.

---

## 1. Before anyone else uses this

### 1.1 Legal review of Terms and Privacy — **required**

`src/lib/brand/index.ts` carries `legal.policiesLegallyReviewed: false`, and the
policy pages say plainly that they are awaiting review. They were written as
accurate descriptions of real behaviour, which is the right starting point for a
lawyer — but they are not legal advice and were not written by a lawyer.

A reviewer needs to look at, at minimum:

- The claim that Atturel never infers protected characteristics. It is enforced
  in prompts and in the data model; it still needs signing off as a public
  commitment.
- Data-processing basis for storing information about **third parties** — the
  colleagues a user records — who never agreed to anything. This is the sharpest
  question in the product and deserves the most attention.
- Retention and deletion. `delete_my_data()` removes every row the user owns;
  confirm that satisfies your obligations, including backups.
- Whether you need a DPA, and in which jurisdictions.

Then set `policiesLegallyReviewed: true` and fill in `legal.entityAddress` and
`legal.jurisdiction`.

### 1.2 Register the entity and settle the name

`brand.legalEntity` is currently `Atturel Labs` and `brand.domain` is
`atturel.app`. Both are placeholders until:

- a trademark search clears **ATTUREL** in your classes and markets
- the domain is actually registered
- the company exists

The brand registry exists precisely so this stays a one-file change. Do not
commission a logo, order stationery, or start building SEO authority on the name
before the search comes back.

### 1.3 Decide what you are promising about AI

If you configure a model provider (§2.1), user relationship data is sent to that
provider. Confirm their data-retention terms, whether they train on API traffic,
and that your privacy policy describes it correctly.

---

## 2. Credentials

Each of these turns on one capability. All are optional. Set them in your host's
environment settings — **never** in `.env.production`, which is committed.

### 2.1 AI provider — turns on generated guidance

**Blocked in production today: no model is configured, so every AI feature is
running on the deterministic composer.** That path is real and evidence-backed,
and the UI says "Composed directly from your records" rather than implying
reasoning that did not happen — but nothing here should be described as an
active AI feature until this key is set.

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
```

Without this the product uses its deterministic evidence composer. Briefs are
still real and still cited; they reason less. The UI says
"Composed directly from your relationship record" rather than pretending.

### 2.2 Search provider — turns on automatic source discovery

**This is the one genuinely blocked production capability.** Everything around
it is built and tested; only the credential is missing.

| | |
| --- | --- |
| **Service** | Brave Search API (reference implementation) or Serper |
| **Why required** | Turning a *name* into candidate URLs needs a web index. There is no legitimate way to do that without a search API — the alternative is scraping a search engine, which violates its terms. |
| **Sign-up** | https://brave.com/search/api/ — or https://serper.dev |
| **Credential** | An API subscription token from the dashboard |
| **Env** | `SEARCH_PROVIDER=brave` and `BRAVE_SEARCH_API_KEY=…`<br>(or `SEARCH_PROVIDER=serper` and `SERPER_API_KEY=…`) |

**Already implemented** — nothing here is left for you:

- Provider abstraction with two real implementations (Brave, Serper), resolved
  from env at call time
- The full discovery → rank → fetch → extract → identity-resolve → fact →
  memory-proposal pipeline
- `research_jobs` rows recording stage, sources considered/accepted, facts
  created and cost units
- Entitlements and usage metering on `person_research`
- Loading, empty, error and rate-limited states in the UI
- A deterministic `SEARCH_PROVIDER=mock` provider for automated tests, which
  **refuses to run when NODE_ENV is production** so it can never fabricate
  evidence for a real user

**How to verify afterwards:**

1. Set the two variables and redeploy.
2. Settings → Capabilities: "Finding sources automatically" flips from
   *Configuration required* to **Connected**, naming the provider.
3. Add a person with a name and company but **no** profile URL.
4. Press **Research public footprint**. Without the key this returns "paste a
   link instead"; with it, sources are discovered, fetched and cited.

Until then the product does not pretend: the capability screen says
configuration is required, and the research panel tells the user to paste a
link — which genuinely works and produces the same source-backed footprint.

**Pasting a link needs no credential and is fully working today.** Only
discovery from a name alone is gated.

### 2.3 Email delivery

```
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=hello@yourdomain
```

You must verify the sending domain with the provider before mail leaves. Until
the key is set, messages are written to the server log with subject and
recipient only — never the body, which contains private relationship content.

Preview every template at `/dev/emails` (development only).

### 2.4 Stripe

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
```

Steps that need a person:

1. Create the Pro product and its monthly/yearly prices in the Stripe dashboard.
   Prices in `src/lib/billing/plans.ts` are display copy — Stripe is the source
   of truth for what is charged. **Keep them in agreement.**
2. Add a webhook endpoint pointing at `/api/stripe/webhook`, subscribed to:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Set `SUPABASE_SERVICE_ROLE_KEY` — the webhook writes subscription state with
   it, and without it a successful payment will not grant a plan.
5. Decide whether the founding offer runs. `FOUNDING_OFFER` in
   `src/lib/billing/plans.ts` controls the cap and the price-protection window.
   The blurb promises **12 months**, not lifetime; if you change one, change the
   other.

Test with `stripe listen --forward-to localhost:3000/api/stripe/webhook` before
going live.

### 2.5 Calendar integration

Register an OAuth client with Google and/or Microsoft, request **read-only**
calendar scope, and complete each provider's verification process. Expect this
to take longer than the code did.

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 2.6 Supabase service role

```
SUPABASE_SERVICE_ROLE_KEY=...
```

Needed for exactly two things: the Stripe webhook, and deleting the auth record
during account deletion. Without it, account deletion still removes **all** of a
user's data — only the empty login shell remains, and the UI says so.

This key bypasses row level security. It must never appear in
`NEXT_PUBLIC_*`, in the browser bundle, or in a committed file.

---

## 3. Deployment

### 3.1 Database

Apply `supabase/migrations/*.sql` in filename order to a fresh project. They are
ordered and dependent.

Then verify the boundary actually holds:

```
psql "$DATABASE_URL" -f supabase/tests/rls-isolation.sql
```

It creates two users, checks isolation in both directions, and rolls back. It is
safe against any environment. If it fails, do not launch — row level security is
the security model here, not a convenience.

### 3.2 Environment

`.env.production` contains only values that are public by design: the Supabase
URL and publishable key, both of which already ship in the JavaScript every
visitor downloads. Host environment settings override it.

Everything secret goes in the host's environment settings.

### 3.3 Domain and DNS

Point the domain at the deployment, then set `NEXT_PUBLIC_SITE_URL`. Several
things read it: OAuth redirect URLs, Stripe return URLs, email links, canonical
metadata. A wrong value here produces working pages with broken links out.

Also add the Supabase Auth redirect URL for the production domain, or sign-in
emails will send users to localhost.

---

## 4. Judgement calls left open

These are deliberately unresolved. Each is a decision about what the product
*is*, and an agent should not make them for you.

**Pricing.** `$29` founding, `$49` Pro, Teams unpriced. These are placeholders
chosen to be plausible, not researched. Teams needs a per-seat number before it
can be sold.

**The founding cap.** 250 places. Real scarcity is fine; invented scarcity is
not. The billing page only shows remaining places where payments are actually
connected — keep it that way.

**Whether to ship Teams at all.** The private/shared boundary is in the schema
and enforced by policy, so a member's private notes stay private from an admin.
The product surface for it is not built.

**Data retention.** Nothing expires today. A relationship record that never
forgets is the point of the product; it is also a growing liability. Decide
whether inactive accounts should age out.

**Whether the assessment should be published.** The Interaction Profile is an
original 96-item ipsative instrument, balanced by construction. It has **not**
been validated against a population, and nothing in the product claims it has.
Do not let marketing copy start calling it validated.

---

## What is deliberately *not* here

Some things were considered and rejected rather than deferred:

- **LinkedIn scraping.** Not built, and not a gap to be filled later. Automating
  login, circumventing rate limits, or replicating their dataset would violate
  their terms and put users at risk of account bans.
- **Bypassing paywalls, CAPTCHAs, or robots directives.** The source fetcher
  respects access controls and records "paywall" or "login required" as an
  honest outcome instead of working around it.
- **Any hiring, firing, promotion or compensation scoring.** Not a missing
  feature. Building it would create employment-discrimination exposure and is
  outside what this product is for.
