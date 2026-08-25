-- =============================================================================
-- V2: ENTITLEMENTS AND BILLING METERING
--
-- Two separate concerns that are commonly conflated:
--   analytics_events  - product behaviour, privacy-scrubbed, for understanding use
--   usage_meters      - billable consumption, for quota enforcement and margin
--
-- Keeping them apart means quota accounting never depends on analytics being
-- enabled, and analytics can be sampled or dropped without breaking billing.
-- =============================================================================

-- Expensive operations are metered. Storing a person is deliberately NOT one:
-- relationship memory only compounds if users add people freely.
create type meter_kind as enum (
  'person_research',
  'deep_research',
  'meeting_brief',
  'quick_brief',
  'transcript_analysis',
  'document_analysis',
  'ai_coach_message',
  'message_adaptation',
  'source_ingest'
);

create table public.usage_meters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  kind meter_kind not null,
  quantity integer not null default 1,

  -- Billing period this consumption counts against, so quota resets are a
  -- simple indexed equality rather than date arithmetic at read time.
  period_start date not null,

  -- Internal economics only. Never surfaced to the user.
  cost_units numeric(10,4) not null default 0,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,

  -- Correlates a meter row back to what produced it.
  subject_kind text,
  subject_id uuid,

  occurred_at timestamptz not null default now(),

  constraint usage_meters_quantity_positive check (quantity > 0)
);

create index usage_meters_quota_idx on public.usage_meters (user_id, kind, period_start);
create index usage_meters_workspace_idx on public.usage_meters (workspace_id, occurred_at desc);
create index usage_meters_cost_idx on public.usage_meters (period_start, kind);

-- Per-account overrides, so a founding customer or a support case can be granted
-- extra quota without a code change or a plan migration.
create table public.entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  -- null limit means unlimited for this capability.
  limit_value integer,
  enabled boolean not null default true,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, capability)
);
create index entitlement_overrides_user_idx on public.entitlement_overrides (user_id);

-- Founding-customer promotion state. Simple and configurable, not a promotions engine.
alter table public.subscriptions
  add column is_founding boolean not null default false,
  add column founding_number integer,
  add column price_protected_until timestamptz,
  add column billing_interval text;

create unique index subscriptions_founding_number_unique on public.subscriptions (founding_number)
  where founding_number is not null;

-- Counts consumption in the current period. SECURITY INVOKER so RLS applies.
create or replace function public.usage_in_period(target_kind meter_kind, period date)
returns integer
language sql
stable
security invoker
set search_path = public
as $fn$
  select coalesce(sum(quantity), 0)::integer
    from public.usage_meters
   where user_id = auth.uid()
     and kind = target_kind
     and period_start = period;
$fn$;

revoke all on function public.usage_in_period(meter_kind, date) from public, anon;
grant execute on function public.usage_in_period(meter_kind, date) to authenticated;

-- --- RLS ----------------------------------------------------------------------

alter table public.usage_meters enable row level security;
create policy "usage_meters: read own" on public.usage_meters
  for select using (user_id = (select auth.uid()));
create policy "usage_meters: insert own" on public.usage_meters
  for insert with check (
    user_id = (select auth.uid())
    and workspace_id in (select public.current_workspace_ids())
  );

-- Entitlement overrides are readable by the user but writable only by the
-- service role: a client that could grant itself capabilities would make the
-- whole entitlement layer decorative.
alter table public.entitlement_overrides enable row level security;
create policy "entitlement_overrides: read own" on public.entitlement_overrides
  for select using (user_id = (select auth.uid()));