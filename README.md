# Atturel

**Walk into every room prepared.**

Atturel is a professional relationship intelligence system. It records what you
learn about the people you work with, keeps that memory honest by separating
what is confirmed from what is inferred, and turns it into preparation for your
next important conversation.

The product answers one question:

> Given **who** I am meeting, the **context**, our **relationship**, our
> **history**, the **room**, my **objective** and the **evidence** available —
> what should I do next?

---

## The two ideas everything else follows from

**1. Nothing is presented as fact unless it is one.**

Every claim carries an evidence level and a provenance, and the two are separate
axes:

| Evidence level | Means |
| --- | --- |
| `confirmed` | The user stated it, or it is corroborated |
| `observed` | Seen directly in a source or interaction |
| `inferred` | Atturel's reasoning, labelled as such |
| `unknown` | Deliberately surfaced. The product says what it does not know. |

| Provenance | Means |
| --- | --- |
| `records` | From your records |
| `interactions` | From previous interactions |
| `public_research` | From public research, with a link |
| `assessment` | From the Interaction Profile |
| `inference` | Atturel's inference |

Collapsing these into one label would lose the thing that makes a record
trustworthy: *how sure* and *where from* are different questions.

**2. Memory belongs to the user.**

Nothing an AI proposes enters the relationship record until a person confirms
it. Observations arrive as `proposed` and stay there.

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the [CORE] values
npm run dev
```

You need a Supabase project. Apply `supabase/migrations/*.sql` in filename
order.

Everything else is optional. With no AI key, no search key, no mail provider and
no Stripe account, the product still works end to end — briefs are composed
deterministically from your records and the UI says so. See
[docs/HUMAN_ACTIONS.md](docs/HUMAN_ACTIONS.md) for what each credential turns on.

```bash
npm run dev          # development server
npm test             # unit tests
npm run typecheck
npm run lint
npm run test:e2e     # Playwright, needs a running server
```

Verify the security boundary:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls-isolation.sql
```

Two users, isolation asserted in both directions, transaction rolled back. Safe
to run anywhere.

---

## Architecture in one page

**Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Supabase**

Server Components read data; Server Actions write it. There is no API layer for
the app's own use — the only route handlers are the auth callback, the Stripe
webhook, and a development-only email preview.

```
src/
  app/
    (marketing)/     public pages
    (auth)/          sign in, sign up, recovery
    onboarding/      profile, Interaction Profile, calibration
    (app)/           Today · People · Meetings · Atlas · Ask Atturel · Settings
    api/stripe/      the only writer of subscription state
  lib/
    ai/              provider abstraction, prompts, untrusted-content fencing
    assessment/      the 96-item instrument and its scoring
    billing/         plans, entitlements, metering, Stripe
    email/           layout primitives and transactional templates
    research/        fetch, extract, resolve identity, propose memory
    sources/         SSRF-hardened fetching and URL parsing
    brand/           every user-visible brand string, in one file
```

### Security

- **Row level security is the boundary.** Explicit `user_id` filters in
  application code are defence in depth, not the mechanism. Policy helpers live
  in a `private` schema that PostgREST does not expose.
- **External content is untrusted data.** Fetched pages are nonce-fenced before
  reaching a model, with explicit operator rules stating that content inside the
  fence is never an instruction.
- **The fetcher resolves DNS and refuses private address space** — loopback,
  RFC1918, CGNAT, IPv4-mapped IPv6, and cloud metadata endpoints — revalidating
  on every redirect rather than trusting the first hop.
- **A client can never grant itself entitlement.** `subscriptions` and
  `entitlement_overrides` are readable by their owner and writable only by the
  service role.

### AI

Every capability ships twice: a model prompt **and** a deterministic evidence
composer. Which one ran is recorded on the artifact and shown in the UI. This is
not a fallback bolted on — it is why the product is honest about what it knows,
and why it works at all without a key.

Extraction is heavily guarded. A headline like
*"Satya Nadella Once Gave Up His Green Card For Love"* must not become
`current_role: "Once Gave Up His Green Card"`. Title vocabulary gates, prose
validation, and connector restrictions exist because that exact failure happened
during development, and a confidently wrong claim about a real person is the
worst thing this product could produce.

### Design

Two first-class themes: **Pearl** (warm ivory, editorial) and **Obsidian**
(graphite). Neither is the default the other degrades from. One accent family —
brass — used as a marker, never as a flood fill; primary actions are
high-contrast ink, which is what keeps the brass reading as precious.

---

## What this deliberately is not

- **Not a CRM.** It does not ask you to maintain a database. It becomes useful
  with one person and one meeting.
- **Not a personality-scoring tool for HR.** No hiring, firing, promotion or
  compensation scoring — not as a missing feature, but as a boundary.
- **Not a scraper.** It reads links you provide and public pages that permit it,
  and records "paywall" or "login required" as an honest outcome.
- **Never inferring protected characteristics.** Race, religion, sexuality,
  gender identity, health, disability, pregnancy, politics, union membership and
  criminal history are out of scope by construction.

The Interaction Profile is an original 96-item ipsative instrument, balanced by
construction. It has **not** been validated against a population, and the
product does not claim it has.

---

## Documentation

| | |
| --- | --- |
| [HUMAN_ACTIONS.md](docs/HUMAN_ACTIONS.md) | Everything that needs a person: credentials, legal, purchases, DNS |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit and why |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Schema, the evidence model, workspace ownership |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Providers, prompts, the grounded composer, injection defence |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, themes, typography, the Aperture |
| [PRIVACY_AND_SAFETY.md](docs/PRIVACY_AND_SAFETY.md) | Commitments and how each is enforced |
| [TESTING.md](docs/TESTING.md) | What is covered, and what is not |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Getting it live |

---

**Atturel** — AT-uh-rel, from *attune* + *relational*. The name is configuration:
`src/lib/brand/index.ts` holds every user-visible brand string, and a test fails
the build if the name is hard-coded anywhere else.
