# Testing

```bash
npm test          # unit — 134 tests, ~1s
npm run typecheck
npm run lint
npm run test:e2e  # Playwright, desktop + Pixel 7, against `next build`
psql "$DATABASE_URL" -f supabase/tests/rls-isolation.sql
```

## What is tested, and why that

The suite is not aiming at a coverage number. Each test exists because
something was got wrong, or because getting it wrong would be expensive and
silent. Several were written *after* a bug, and the comment above them says so.

### Correctness that would be invisible if broken

| Area | The failure it prevents |
| --- | --- |
| `assessment/instrument` | Block construction must place each dimension in exactly 12 of 24 blocks. An unbalanced ipsative instrument produces confidently wrong profiles and nobody notices. |
| `assessment/scoring` | Normalisation constant derived from the instrument, not guessed. Items are rejected if they do not belong to their claimed block. |
| `source-extraction` | *"Satya Nadella Once Gave Up His Green Card For Love"* became `current_role: "Once Gave Up His Green Card" at "Love"`. Title vocabulary gates, prose validation and connector restrictions all date from that. |
| `sources/url` | Prepending `https://` to input that already has a scheme turns `file:///etc/passwd` into a fetchable URL. |
| `brief grammar` | "leave today having get approval". A five-phrasing matrix, because generated prose reads fine until it does not. |
| `brand-centralisation` | The name must not be hard-coded outside the registry, and the former codename must not survive in copy. |
| `email` | Hostile display names must not inject markup; security mail must have no unsubscribe link; preheaders must not carry note content. |

### A note on that last guard

The codename check was **silently disarmed for a while**:

```ts
const FORMER_CODENAME = new RegExp('\bAurel', 'i')  // backspace, not \b
```

In a normal string literal `'\b'` is U+0008. The regex compiled, the test
passed, and it matched nothing. It now uses `String.raw`. A test that cannot
fail is worse than no test, because it also stops anyone looking.

### End-to-end

`tests/e2e/public.spec.ts` — everything reachable without an account. Needs no
credentials, so it runs on any fork.

- Every private route redirects a signed-out visitor
- `/sign-up?plan=pro` prerenders (a missing Suspense boundary broke a
  production build once; dev stayed green)
- Both themes render and neither body is transparent
- No page scrolls horizontally at 360px
- The dev-only email preview is not served on a production build

`tests/e2e/critical-flow.spec.ts` — sign-up → onboarding → person → meeting.
Creates a throwaway account through the real form. Two alternatives were
rejected: a committed `storageState` would put a live session token in the
repository, and a fixed shared account makes tests order-dependent. It **skips**
where email confirmation is required, because a red pipeline that means "not
configured" trains people to ignore red pipelines.

E2E runs against `next build`, not the dev server. Prerendering, Suspense
boundaries and environment validation have each broken this project while dev
was green.

### Security

`supabase/tests/rls-isolation.sql` creates two users and asserts isolation in
**both** directions — a one-sided check passes happily against `using (true)`.
It also asserts that neither user can write into the other's space, grant
themselves a plan or a capability, or read the security audit trail. Everything
runs in a transaction that rolls back, so it is safe against any environment.

Last run: all assertions passed. `anon` is refused outright rather than filtered
— it cannot execute the workspace policy helper at all.

## What is not tested

Stated plainly, because a gap you know about is manageable and one you assume
away is not.

- **The Stripe webhook has no automated test.** Signature verification needs a
  real signing secret. Use `stripe listen --forward-to
  localhost:3000/api/stripe/webhook` before going live, and exercise a full
  subscribe → cancel → resubscribe cycle.
- **No visual regression baseline.** Screens were reviewed by hand in both
  themes at desktop and phone width. That catches what a human notices and
  misses what a diff would.
- **No load testing.** Query shapes are indexed for the access patterns the app
  actually uses, but nothing has been run at volume.
- **No accessibility audit tool in the pipeline.** Semantics come from the
  platform — real radios, real labels, `FormField` wiring `aria-describedby` —
  and focus states are visible throughout. That is not the same as an audit.
- **Email rendering is verified in a browser, not in Outlook.** The layout uses
  tables and inline styles precisely because Outlook is unforgiving; a real
  client test is still a real client test.
