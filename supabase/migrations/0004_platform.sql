-- Integrations, calendar mirror, billing, usage metering, analytics, security log.

create type integration_provider as enum ('google', 'microsoft');
create type integration_status as enum ('connected', 'expired', 'revoked', 'error');
create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);
create type usage_kind as enum ('meeting_brief', 'coach_message', 'message_adaptation', 'debrief', 'person_created');

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider integration_provider not null,
  status integration_status not null default 'connected',

  external_account_email text,
  -- Least-privilege scopes actually granted, recorded so the UI can state
  -- exactly what Aurel can see.
  scopes text[] not null default '{}',

  -- Tokens are encrypted at the application layer before they are written here;
  -- the service role never returns them to a client.
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create index integration_accounts_user_idx on public.integration_accounts (user_id);
create trigger integration_accounts_touch before update on public.integration_accounts
  for each row execute function public.touch_updated_at();

create table public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integration_accounts(id) on delete cascade,
  provider integration_provider not null,

  external_id text not null,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  organizer_email text,
  -- Raw attendee list from the provider; mapped to people rows on import.
  attendees jsonb not null default '[]'::jsonb,

  meeting_id uuid references public.meetings(id) on delete set null,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);
create index external_calendar_events_user_time_idx on public.external_calendar_events (user_id, starts_at);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan plan_tier not null default 'free',
  status subscription_status,

  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,

  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Metering for plan limits. Deliberately carries no content, only a kind and a
-- timestamp, so quota accounting can never leak relationship data.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind usage_kind not null,
  occurred_at timestamptz not null default now()
);
create index usage_events_user_kind_time_idx on public.usage_events (user_id, kind, occurred_at desc);

-- Product analytics. `props` is restricted by application code to non-sensitive
-- scalars (counts, enum values, booleans) - never names, notes or transcripts.
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint analytics_events_name_len check (char_length(name) between 1 and 80)
);
create index analytics_events_user_idx on public.analytics_events (user_id, occurred_at desc);
create index analytics_events_name_idx on public.analytics_events (name, occurred_at desc);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  -- Hashed, never the raw address.
  ip_hash text,
  user_agent text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index security_events_user_idx on public.security_events (user_id, occurred_at desc);

-- --- RLS ---------------------------------------------------------------------

do $rls$
declare t text;
begin
  foreach t in array array[
    'integration_accounts','external_calendar_events','usage_events','analytics_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: read own" on public.%I for select using ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: update own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete using ((select auth.uid()) = user_id)', t, t);
  end loop;
end
$rls$;

-- Subscriptions: readable by the owner, but only the service role (Stripe
-- webhooks) may write. A client must never be able to grant itself a plan.
alter table public.subscriptions enable row level security;
create policy "subscriptions: read own" on public.subscriptions
  for select using ((select auth.uid()) = user_id);

-- Security events: append-only from the user's session, never readable by the
-- client, so an attacker with a session cannot enumerate the audit trail.
alter table public.security_events enable row level security;
create policy "security_events: insert own" on public.security_events
  for insert with check ((select auth.uid()) = user_id);