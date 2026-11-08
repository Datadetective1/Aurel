-- =============================================================================
-- 0025: APP STORE SUBSCRIPTIONS
--
-- Pro bought inside the iPhone app, through Apple. Two tables:
--
--   1. app_store_subscriptions   one row per Apple subscription (its
--                                originalTransactionId), bound to one
--                                account, never moved to another.
--   2. app_store_notifications   the ledger of App Store Server Notifications
--                                v2, so no notification is applied twice and a
--                                concurrent retry is never acknowledged while
--                                the original is still failing. Mirrors
--                                stripe_events (0021).
--
-- Access is derived from the dates held here (lib/billing/apple), never from
-- a stored status, so a lost notification cannot leave anyone entitled.
--
-- Additive only. Writes are service-role only: RLS on, and the one policy is
-- an account reading its own subscription.
-- =============================================================================

-- --- 1. subscriptions --------------------------------------------------------

create table if not exists public.app_store_subscriptions (
  original_transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  latest_transaction_id text not null,
  latest_purchase_at timestamptz not null,
  environment text not null check (environment in ('Production', 'Sandbox')),
  expires_at timestamptz,
  revoked_at timestamptz,
  auto_renew boolean,
  grace_period_expires_at timestamptz,
  renewal_state_at timestamptz,
  -- Compare-and-swap guard: every write names the version it read.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_store_subscriptions_user_idx
  on public.app_store_subscriptions (user_id);

alter table public.app_store_subscriptions enable row level security;

drop policy if exists "app_store_subscriptions: read own" on public.app_store_subscriptions;
create policy "app_store_subscriptions: read own" on public.app_store_subscriptions
  for select using (user_id = (select auth.uid()));

-- A subscription belongs to the account it was first bound to. The code never
-- changes user_id; this makes sure nothing else can either.
create or replace function public.app_store_subscriptions_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'app_store_subscriptions.user_id is immutable';
  end if;
  if new.original_transaction_id is distinct from old.original_transaction_id then
    raise exception 'app_store_subscriptions.original_transaction_id is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists app_store_subscriptions_guard on public.app_store_subscriptions;
create trigger app_store_subscriptions_guard
  before update on public.app_store_subscriptions
  for each row execute function public.app_store_subscriptions_guard();

-- --- 2. notification ledger ----------------------------------------------------

create table if not exists public.app_store_notifications (
  id text primary key,                         -- notificationUUID
  type text not null,
  subtype text,
  environment text,
  signed_at timestamptz not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  -- No foreign keys: the ledger outlives the account it concerned.
  user_id uuid,
  original_transaction_id text,
  error_code text,
  received_at timestamptz not null default now()
);

create index if not exists app_store_notifications_status_idx
  on public.app_store_notifications (status, claimed_at);

alter table public.app_store_notifications enable row level security;

/**
 * Claim a notification for processing, atomically. Same contract as
 * claim_stripe_event: 'claimed', 'duplicate' or 'in_progress'; a claim older
 * than five minutes is treated as abandoned and may be re-claimed.
 */
create or replace function public.claim_app_store_notification(
  p_id text,
  p_type text,
  p_subtype text,
  p_environment text,
  p_signed timestamptz
)
returns text
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  existing record;
begin
  insert into public.app_store_notifications (id, type, subtype, environment, signed_at)
  values (p_id, p_type, p_subtype, p_environment, p_signed)
  on conflict (id) do nothing;

  if found then
    return 'claimed';
  end if;

  select status, claimed_at into existing
    from public.app_store_notifications
   where id = p_id
   for update;

  if existing.status in ('processed', 'ignored') then
    return 'duplicate';
  end if;

  if existing.status = 'processing' and existing.claimed_at > now() - interval '5 minutes' then
    return 'in_progress';
  end if;

  update public.app_store_notifications
     set status = 'processing',
         claimed_at = now(),
         attempts = attempts + 1,
         error_code = null
   where id = p_id;
  return 'claimed';
end;
$fn$;

revoke all on function public.claim_app_store_notification(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_app_store_notification(text, text, text, text, timestamptz)
  to service_role;

revoke all on function public.app_store_subscriptions_guard() from public, anon, authenticated;
