# Privacy and safety

This product stores information about people who never agreed to be in it. That
is the central ethical fact of a relationship intelligence system, and every
commitment below exists because of it.

Each one lists **where it is enforced**, because a commitment with no mechanism
behind it is marketing.

---

## 1. Protected characteristics are never inferred

Race, ethnicity, religion, sexual orientation, gender identity, medical
conditions, disability, mental health, pregnancy, age, political affiliation,
union membership, immigration status and criminal history are out of scope for
**anyone** — the user and the people they record.

**Enforced by:**
- Explicit prohibition in every prompt that touches a person
  (`src/lib/ai/prompts/shared.ts`)
- No column exists to hold any of it. The `fact_kind` enum has no member that
  could carry it.
- Extraction discards material about private life even when a source contains
  it (`src/lib/ai/prompts/source-extraction.ts`)

## 2. No employment decisions

No hiring, firing, promotion or compensation scoring. No "suitability" rating.
No ranking of people against each other.

**Enforced by:** absence, and by prompt prohibition. `relevance` on a person is
user-declared and describes *how much this relationship matters to you* — never
a judgement of the person. `relationship_pulse()` measures the **user's own**
follow-through and contact cadence, and the UI says so in as many words: *"This
reflects your contact cadence and follow-through — not how the other person
feels."*

This is a boundary, not a missing feature. Building it would create employment
discrimination exposure and is outside what the product is for.

## 3. Nothing is presented as more certain than it is

Every claim carries an evidence level and a provenance, shown wherever the claim
is shown.

**Enforced by:**
- `evidence_level` is `not null` on observations and professional facts
- A fact with no rows in `fact_sources` can never be presented above `inferred`
- The composer emits an explicit "What Atturel does not know" section rather
  than omitting gaps
- Where output came from the deterministic composer rather than a model, the
  interface says so — it does not imply reasoning that did not happen

## 4. Memory belongs to the user

Nothing an AI proposes enters the relationship record until a person accepts it.

**Enforced by:** observations are created with `status = 'proposed'`. Only an
explicit user action promotes one to `active`. Proposed rows never appear as
established memory.

## 5. Access controls are respected, never circumvented

**Enforced by:**
- No LinkedIn automation, scraping, or dataset replication. Not built, and not a
  gap to be filled.
- Logins, paywalls and CAPTCHAs are recorded as honest outcomes —
  `login_required`, `paywall` — rather than worked around
- `robots` directives are honoured
- The fetcher identifies itself in its user agent

## 6. Identity is resolved, never assumed

Silently merging two people with the same name is the worst failure this product
could have: it would attach a stranger's public record to a colleague and then
brief the user on it.

**Enforced by:** `identity_match_status` includes `ambiguous` and `conflicting`
as first-class outcomes. Where research finds several plausible people, the
candidates are stored and the user is asked. `identity_locked` stops research
guessing again after a user says "wrong person".

## 7. The record is portable and destructible

**Enforced by:** `exportMyData()` returns every table the user owns as JSON, not
a summary. `delete_my_data()` removes every row they own. Both are one click in
Settings → Privacy & data, with no support ticket and no retention period.

Deleting a source removes any fact that had no other supporting evidence.
Observations the user personally confirmed are kept, because they vouched for
them.

## 8. Logs and analytics never carry content

**Enforced by:**
- Analytics record counts, enum values and booleans — never names, notes,
  transcripts or message bodies
- Email logging records subject and a redacted recipient, never the body
- Stripe and provider errors log a status code and an error *name*, never the
  response body, which echoes customer data back
- Security events store a hashed IP, never the address
- `usage_meters` carries a kind and a quantity, and is deliberately separate
  from analytics so quota accounting can never leak relationship data

## 9. The boundary is the database

Row level security, not application code. Explicit `user_id` filters exist as
defence in depth, but the policies are what stop a mistake becoming a breach.

Policy helper functions live in a `private` schema that PostgREST does not
expose, because a `SECURITY DEFINER` function executable by `authenticated` in
the `public` schema is reachable at `/rest/v1/rpc/…`.

**Verified by:** `supabase/tests/rls-isolation.sql` — two users, isolation
asserted in both directions, run against a real database.

---

## What is still open

- **The policies have not been reviewed by a lawyer.** They say so, in the UI,
  and `brand.legal.policiesLegallyReviewed` is `false`. See
  [HUMAN_ACTIONS.md](HUMAN_ACTIONS.md).
- **No data retention policy.** Nothing expires. A record that never forgets is
  the point of the product and also a growing liability.
- **The Interaction Profile is not validated.** It is an original 96-item
  ipsative instrument, balanced by construction, with no population validation.
  The product does not claim otherwise, and marketing copy must not start to.
- **Third-party rights.** The people in someone's record have rights in several
  jurisdictions and no account here. This needs legal input, not engineering.
