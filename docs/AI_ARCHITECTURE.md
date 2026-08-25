# AI architecture

## Every capability ships twice

```ts
runPrompt(module, input)
```

Each prompt module carries three things: a Zod schema, a model prompt, and
`compose(input)` — a deterministic function producing the same validated shape
from the same evidence.

If a model is configured, `generateObject` runs against the schema. If not,
`compose` runs. Callers cannot tell which, and never branch on it.

The artifact records `grounded_fallback`, and the UI surfaces it:

> Composed directly from your relationship record.

versus

> Generated from your relationship record.

**This is not a fallback bolted on.** Writing the deterministic path first
forced every capability to be expressible as composition over cited evidence.
That constraint is why the citations are real rather than decorative — a model
free to write prose would have produced better sentences and worse claims.

## Prompt modules

| Module | Produces |
| --- | --- |
| `meeting-brief` | Who, what matters, likely friction, what to open with, what is unknown |
| `coaching` | Daily focus, relationship summary, weekly reflection, profile narrative |
| `debrief` | Structured recall after an interaction, plus proposed memory |
| `source-extraction` | Professional facts from a fetched page, with excerpts |
| `message-adaptation` | The user's own message, adjusted for the recipient |

Every schema requires citations. A generation that cannot cite is a generation
that does not ship.

## Untrusted content

External pages are data. Never instructions.

```ts
fenceUntrusted(text)   // random nonce per call
UNTRUSTED_CONTENT_RULES
```

The nonce is generated per call rather than fixed, because a fixed delimiter can
be closed by content that has encountered it before. The operator rules state
explicitly that nothing inside the fence is an instruction, that it may be
hostile, and that it can only ever be evidence about a person.

## Extraction is aggressively guarded

This is where the product could do real harm, so the guards are strict enough to
be occasionally annoying.

A headline —

> *Satya Nadella Once Gave Up His Green Card For Love*

— produced `current_role: "Once Gave Up His Green Card"` at organisation
`"Love"`. A confidently wrong claim about a real person is the worst output this
system can produce, so:

- `TITLE_TOKENS` — a candidate role must contain recognised title vocabulary
- `NOT_A_TITLE` — narrative verbs disqualify it outright
- `isCleanProse()` — rejects JSON fragments, wikitext, markup residue
- `matchCurrentRole()` — the name must appear within a bounded window of the
  role, joined by a real copula
- `matchRoleAtKnownOrg()` — only confirms an employer the user already asserted

The tag stripper is quote-aware, because a naive `<[^>]*>` breaks on a `>`
inside an attribute value and leaks raw JSON into what the UI then calls a fact.

## Identity resolution

Before any fact is attached, the source must be established as being about *this
person*. Signals are scored — name, employer, title, domain, URL, email — and
the outcome is one of `confirmed`, `probable`, `ambiguous`, `no_match`,
`conflicting`, `unreviewed`.

`ambiguous` and `conflicting` are first-class outcomes. Where several plausible
people exist, candidates are stored and the user is asked. Silently merging two
people with the same name is the failure mode this whole subsystem exists to
prevent.

## Cost and quota

`checkCapability()` before the work, `recordUsage()` after it succeeds. In that
order: a failed generation must not burn a paying customer's quota.

`usage_meters` records provider, model and token counts for internal margin
accounting. None of that is ever shown to a user — a product that displays its
own unit economics has confused its interests with theirs.

## Configuring a provider

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
```

Once set, the AI path becomes primary for meeting intelligence: structured
records plus retrieved evidence plus relationship memory plus reasoning. The
deterministic composer stays as the graceful fallback and continues to run
whenever a generation fails validation.
