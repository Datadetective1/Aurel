# Architecture

## The shape

Next.js App Router, Server Components for reads, Server Actions for writes.
There is no REST layer for the app's own use — three route handlers exist and
each has a reason it cannot be an action:

| Route | Why it is a route |
| --- | --- |
| `/auth/callback` | Supabase redirects a browser here with a code |
| `/api/stripe/webhook` | Stripe posts a signed body from outside |
| `/dev/emails` | Renders raw HTML, and 404s in production |

Everything else is a Server Component reading through the request-scoped
Supabase client, or a Server Action writing through it.

## Why no API layer

Every read already runs on the server with the user's session attached. An API
route in between would add a serialisation boundary, a second place to enforce
authorisation, and a second place to get it wrong. Row level security applies
identically either way, so the layer would buy nothing and cost a duplicate
guard on every endpoint.

Where a public API is eventually wanted — the V2 brief mentions API and MCP
access — it should be a genuinely separate surface with its own token model,
not the app's internals exposed.

## Layers

```
Server Component  ──reads──▶  supabase/server.ts  ──▶  Postgres + RLS
Server Action     ──writes─▶        (same client)
        │
        └──▶ entitlements ──▶ checkCapability() before the work
        └──▶ ai/provider  ──▶ model prompt OR grounded composer
        └──▶ recordUsage() after the work succeeds
```

`checkCapability()` before and `recordUsage()` after is deliberate ordering. A
generation that fails must not burn a paying customer's quota, and metering the
attempt rather than the result is how that happens.

## The AI boundary

`src/lib/ai/provider.ts` decides once, at module level, whether a real model is
reachable. Nothing downstream asks again. Every capability ships two
implementations behind one call:

```ts
runPrompt(module, input)
  → model available? generateObject against the schema
  → otherwise?       module.compose(input), deterministic
```

Both return the same validated shape, and the artifact records which ran
(`grounded_fallback`). The UI reads that flag rather than guessing, which is why
the product can say "Composed directly from your relationship record" instead of
implying reasoning that did not happen.

This is not a degraded mode bolted on. It is the reason the product is honest:
the deterministic path forced every capability to be expressible as evidence
composition, which in turn is what made the citations real.

## Untrusted content

External pages are data, never instructions. `fenceUntrusted()` wraps fetched
text in a random per-call nonce and the system prompt states that nothing inside
the fence is an instruction. The nonce is per-call because a fixed delimiter can
be closed by content that has seen it before.

The fetcher (`src/lib/sources/fetch.ts`) resolves DNS itself and refuses
loopback, RFC1918, CGNAT, link-local, IPv4-mapped IPv6 and the cloud metadata
address — revalidating after every redirect rather than trusting the first hop,
because a public hostname that 302s to `169.254.169.254` is the whole attack.
Responses are size-capped while streaming, not after.

## Workspaces

Every domain row carries both `workspace_id` (where it lives) and `user_id` (who
wrote it), plus a `visibility` of private or shared.

Today each user has exactly one personal workspace, so the two policy clauses
collapse to "your own rows" and behaviour is identical to a flat per-user model.
The reason to build it now rather than later: when team workspaces ship, a
manager joining a workspace still cannot read a member's private notes. Adding
that boundary after real data exists is a migration nobody wants to run.

## Rendering

Marketing and auth pages are static. App pages are dynamic — they read a
session, and a cached relationship briefing would be worse than useless.

Client components are the exception, not the default. They appear where there is
genuine interaction: the assessment runner, the command palette, forms with
optimistic state, the theme switch. Anything that needs a value only knowable
after hydration derives it from `useHasMounted()` rather than writing it back
through an effect, which keeps the React Compiler's rules satisfiable without
suppressions.
