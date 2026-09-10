# Data model

Postgres 17 on Supabase. Forward-only migrations in `supabase/migrations/`.

## The spine

```
auth.users
   └── profiles                  one per user, provisioned by trigger
   └── workspaces                one personal workspace, provisioned by trigger
        └── workspace_members

organizations ──┐
                ├── people ──┬── observations ──── observation_sources
topics ─────────┘            ├── professional_facts ── fact_sources ── sources
                             ├── commitments        (open loops)
                             ├── decisions ── decision_people
                             ├── notes
                             └── interactions       (conversations) / meetings
```

## Conversations, loops and decisions (0017)

A **conversation** is an `interactions` row. The table has carried a transcript
column since 0002; 0017 adds where the words came from (`source_kind`),
whether the reading has run (`processing_status`, `processing_error`), the
topics, the generation that produced the reading (`artifact_id`), and the
moment the user finished reviewing it (`reviewed_at`). Audio is never stored.

An **open loop** is a `commitments` row. 0017 adds `kind` (commitment,
question, follow_up), `review_status` (proposed, confirmed, rejected),
`confidence`, `excerpt`, `deferred_until` and the two new states `later` and
`cancelled`. `dropped` remains on old rows and is read as cancelled.

**Everything a model extracts arrives as `proposed`.** Today, briefs, the person
page, Ask and search read confirmed rows only. Rows that existed before 0017
were written by the user or by a debrief the user submitted, and backfill as
confirmed. Same gate as observations, for the same reason.

A **decision** is its own table: what was decided, why when the words said why,
the day, the conversation it came from, and the people it concerns through
`decision_people`. Decisions cascade from their conversation; confirmed loops
do not, because the user chose them.

Photos live in the private `avatars` bucket under `<user_id>/…`, with
owner-only storage policies. `people.avatar_path` and `profiles.avatar_path`
hold the path; URLs are signed at render time and never stored.
`storage.objects` refuses direct SQL deletes, so the deletion action removes the
folder through the Storage API before `delete_my_data()` runs (0018).

Every domain row carries **three** ownership columns:

| Column         | Answers               |
| -------------- | --------------------- |
| `user_id`      | who authored it       |
| `workspace_id` | where it lives        |
| `visibility`   | `private` or `shared` |

A row is readable if you authored it, **or** it is shared into a workspace you
belong to. In a personal workspace those collapse to "your own rows".

## Two kinds of knowledge, deliberately separate

**`observations`** — what it is like to _work with_ someone. "Asks for
utilisation evidence before agreeing to a headcount change." Earned through
interaction.

**`professional_facts`** — who someone _is_ professionally. Role, employer,
education, expertise. Sourced from public material.

They are not merged because they age differently, are sourced differently, and
carry different risk. A wrong fact is embarrassing; a wrong observation shapes
how you treat a colleague.

## Evidence and provenance are orthogonal

`evidence_level` — how sure: `confirmed` · `observed` · `inferred` · `unknown`
Provenance — where from: records · interactions · public research · assessment ·
inference

An observed claim from public research and an observed claim from your own notes
are equally certain and not equally _yours_. Collapsing the two axes into one
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
expensive _actions_ are metered instead.

## Functions

| Function                          | Notes                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `search_everything()`             | `SECURITY INVOKER`, so RLS scopes every branch to the caller                                    |
| `relationship_pulse()`            | Measures the **user's** cadence and follow-through, never the other person                      |
| `clear_demo_data()`               | Removes demo rows, keeps real ones                                                              |
| `delete_my_data()`                | Every row the user owns                                                                         |
| `private.current_workspace_ids()` | `SECURITY DEFINER` to avoid policy recursion; in `private` so PostgREST cannot expose it as RPC |

The last one matters. A `SECURITY DEFINER` function that `authenticated` may
execute is reachable at `/rest/v1/rpc/…` while it lives in `public`. Migration
0010 exists solely to move those two helpers out of reach.

## Follow-through (0019)

`profiles.follow_through_email` and `profiles.follow_through_hour` sit under
the existing `email_notifications` switch; both must be on. The
`follow_through_deliveries` ledger holds one row per user per **local** day
for scheduled sends, enforced by a partial unique index — that index is the
idempotency, not any memory the job keeps. Manual sends from Settings are
recorded with `trigger = 'manual'` and never consume the day. A failed send
releases its reservation so the next run retries; a deployment with no mail
provider records `skipped` and stops.

Migrations `0015b` and `0015c` are drift repairs: production had two migrations
applied on 27–28 Aug 2026 that were never committed. They were recovered
verbatim from `supabase_migrations.schema_migrations`, are idempotent, and
were not re-run against production.
