# Data model

Postgres 17 on Supabase. Ten forward-only migrations in `supabase/migrations/`.

## The spine

```
auth.users
   └── profiles                  one per user, provisioned by trigger
   └── workspaces                one personal workspace, provisioned by trigger
        └── workspace_members

organizations ──┐
                ├── people ──┬── observations ──── observation_sources
topics ─────────┘            ├── professional_facts ── fact_sources ── sources
                             ├── commitments
                             ├── notes
                             └── interactions / meetings
```

Every domain row carries **three** ownership columns:

| Column | Answers |
| --- | --- |
| `user_id` | who authored it |
| `workspace_id` | where it lives |
| `visibility` | `private` or `shared` |

A row is readable if you authored it, **or** it is shared into a workspace you
belong to. In a personal workspace those collapse to "your own rows".

## Two kinds of knowledge, deliberately separate

**`observations`** — what it is like to *work with* someone. "Asks for
utilisation evidence before agreeing to a headcount change." Earned through
interaction.

**`professional_facts`** — who someone *is* professionally. Role, employer,
education, expertise. Sourced from public material.

They are not merged because they age differently, are sourced differently, and
carry different risk. A wrong fact is embarrassing; a wrong observation shapes
how you treat a colleague.

## Evidence and provenance are orthogonal

`evidence_level` — how sure: `confirmed` · `observed` · `inferred` · `unknown`
Provenance — where from: records · interactions · public research · assessment ·
inference

An observed claim from public research and an observed claim from your own notes
are equally certain and not equally *yours*. Collapsing the two axes into one
badge loses the thing that makes the record trustworthy.

**A fact with no rows in `fact_sources` can never be shown above `inferred`.**
That is the rule the whole evidence model rests on.

## Proposed before active

`observations.status` starts at `proposed`. Nothing an AI suggests is visible as
memory until a person promotes it. `origin_artifact_id` links a proposal back to
the generation that made it, so "why does it think that" is answerable.

## Superseded, not deleted

`professional_facts` keeps history: `superseded_by` and `is_current`. "Was
Director, now VP" is more useful than "VP". `has_conflict` is set when sources
disagree and the system could not resolve it — an honest unresolved state rather
than a silent pick.

`as_of` drives the freshness indicator, and is only set from explicit
publication metadata. Reading a date off an arbitrary `<time>` element once
dated today's findings to 2013.

## Metering is separate from analytics

`analytics_events` — product behaviour, privacy-scrubbed, droppable
`usage_meters` — billable consumption, quota enforcement, cost accounting

Kept apart so quota accounting never depends on analytics being enabled, and
analytics can be sampled without breaking billing. `usage_meters` carries a kind
and a quantity and no content at all.

## What is deliberately not metered

Storing a person. Relationship memory only compounds if people add colleagues
freely; charging per stored person creates "is this one worth a credit?"
hesitation, which attacks the thing that makes the product valuable. The
expensive *actions* are metered instead.

## Functions

| Function | Notes |
| --- | --- |
| `search_everything()` | `SECURITY INVOKER`, so RLS scopes every branch to the caller |
| `relationship_pulse()` | Measures the **user's** cadence and follow-through, never the other person |
| `clear_demo_data()` | Removes demo rows, keeps real ones |
| `delete_my_data()` | Every row the user owns |
| `private.current_workspace_ids()` | `SECURITY DEFINER` to avoid policy recursion; in `private` so PostgREST cannot expose it as RPC |

The last one matters. A `SECURITY DEFINER` function that `authenticated` may
execute is reachable at `/rest/v1/rpc/…` while it lives in `public`. Migration
0010 exists solely to move those two helpers out of reach.
