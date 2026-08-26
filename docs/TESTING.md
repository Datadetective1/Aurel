# Testing

```bash
npm test          # unit — 274 tests, ~2s
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
| `brief grammar` | "leave today having get approval". A nine-phrasing matrix, because generated prose reads fine until it does not. |
| `brand-centralisation` | The name must not be hard-coded outside the registry, and the former codename must not survive in copy. |
| `email` | Hostile display names must not inject markup; security mail must have no unsubscribe link; preheaders must not carry note content. |
| `email/send` | Sender resolution. Production set `ATTUREL_EMAIL_FROM` while the code read only `EMAIL_FROM_ADDRESS`, fell back to a hardcoded address on an unregistered domain, and Settings reported Email as connected while every send would have been refused. Also pins that a rejected message and a dead request resolve rather than throw, and that the provider's error body — which echoes the request — stays out of the log. |
| `internal-links` | Two links shipped to routes that were never written, each with a finished server action behind it and no page. Next prefetches links, so both 404s landed in the browser console rather than under a cursor. Every internal target is now checked against the route tree. |
| `env` | Provider resolution. `OPENAI_API_KEY` alone activated nothing, because `AI_PROVIDER` still said `grounded` and `AI_MODEL` still named a Claude id — a 404 the retry loop would have swallowed as a fallback. |
| `debrief/normaliseCommitment` | A model answered with a display name where a uuid belongs, every insert failed the cast, and the unchecked result meant both commitments vanished while the UI reported the debrief saved. |
| `format` | A person header read *"Last spoke tomorrow"* — a past-tense claim about a conversation that had not happened, from a debrief dated by its meeting's `scheduled_at`. |

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

`tests/e2e/critical-flow.spec.ts` — sign-up → onboarding → person → meeting →
brief. Creates a throwaway account through the real form. Two alternatives were
rejected: a committed `storageState` would put a live session token in the
repository, and a fixed shared account makes tests order-dependent.

It **skips** where the auth provider refuses unattended sign-up — email
confirmation required, send rate limit, address rejected — because a red
pipeline that means "not configured" trains people to ignore red pipelines. It
still fails loudly on a form validation error, which is a real product bug; the
two are told apart explicitly.

**The flow itself has been walked end to end by hand** against a pre-confirmed
account, and it works: sign-in redirects an un-onboarded user to onboarding, the
timezone control stores IANA while showing a city and the correct local time,
all 24 assessment rounds score into a profile with a calibration step, a new
person and meeting can be created, and the brief generates. What is gated is
automating it, not whether it works.

That walkthrough found three real bugs, all fixed:

1. **The sign-up form has a required name field** the test never filled, so the
   form sat invalid and the inner wait consumed the whole test budget — which
   surfaced as "test timed out" rather than the actual cause.
2. **The assessment could strand you.** Answering out of order is allowed, so
   you can reach round 24 with gaps behind you. The finish button is not shown
   until all 24 are answered and "Next" is disabled on the last round, leaving
   an enabled "Back" and no explanation. There is now a "Go to round N" action
   and a line saying how many remain. The live region also claimed "Moving to
   the next round" on the final round, where nothing moves.
3. **An imperative objective was spliced into a noun-phrase frame**, producing
   "A clear answer on leave with a decision on the platform investment". The
   composer now picks a frame that fits the grammar of what the user wrote.

E2E runs against `next build`, not the dev server. Prerendering, Suspense
boundaries and environment validation have each broken this project while dev
was green.

### Accessibility

`tests/e2e/accessibility.spec.ts` runs axe-core against every public page in
both themes and both viewports, at WCAG 2.1 A and AA, plus checks for a working
skip link, a single `main` landmark, and a visible focus ring on first Tab.

`tests/e2e/accessibility-app.spec.ts` does the same for the signed-in pages,
which is where the interaction-dense screens live. It needs an account, so it
runs only when `E2E_EMAIL` and `E2E_PASSWORD` are set and skips otherwise.

The person page and its two forms are included by discovering a person id from
`/people` at runtime. They were originally left out because they need an id,
which meant the screens most likely to carry a violation were the only ones
never checked. The sweep prints how many pages it covered and whether the
person pages were among them — on an account with nobody recorded it would
otherwise pass just as green while skipping them.

Last run: 16 pages clean in both themes at both viewports, against production,
and the assessment — the most complex screen in the product — clean as well.

Between them they found real violations on **every public page in both themes**
plus two signed-in pages, all fixed:

- **`--ink-faint` failed AA wherever it carried words** (3.19:1 in Pearl).
  Its own comment said "decorative and large text only" — and it was used for
  12px body copy anyway, repeatedly, by me. A comment is not an enforcement
  mechanism. It is now the faintest tone that is still legible as text
  (≥4.5:1 worst case), and the scale gives up some separation to get there.
- **Inline prose links were distinguished by colour alone**, with underline on
  hover only. They now carry a permanent underline.
- **Avatar initials failed AA in Pearl.** A status colour that clears 4.5:1 on
  the page background does not necessarily clear it once the background is
  tinted toward that same hue — both sides move together. Accent initials
  measured 4.24:1 on their own 14% tint. There are now `--*-strong` tokens for
  text sitting on a tint of its own colour.
- **Reduced motion cancelled `animation-duration` but not `animation-delay`.**
  With `fill-mode: both`, an un-cancelled delay holds the element at
  `opacity: 0` — so someone who asked for no motion still got staggered
  content that was invisible for up to 0.7s. That is the opposite of the
  accommodation, and it is what axe was actually reporting when it flagged the
  hero: it was sampling a half-faded pixel.

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
- **axe is automated; a real audit is not.** axe-core runs over every public
  page in both themes and both viewports, but it catches perhaps a third to a
  half of real barriers. It can tell you a control has no accessible name; it
  cannot tell you the name is misleading. Nothing here has been tested with an
  actual screen reader, or by anyone who uses one.
- **Email rendering is verified in a browser, not in Outlook.** The layout uses
  tables and inline styles precisely because Outlook is unforgiving; a real
  client test is still a real client test.
