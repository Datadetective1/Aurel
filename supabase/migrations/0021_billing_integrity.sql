-- =============================================================================
-- 0021: BILLING INTEGRITY
--
-- Three things the first paying customer needs before they pay:
--
--   1. stripe_events     a durable ledger, so no Stripe event is ever applied
--                        twice, and a concurrent duplicate cannot be
--                        acknowledged while the original is still failing.
--   2. stripe_state_at   when the canonical subscription row was last read
--                        from Stripe, so an older read never overwrites a
--                        newer one when events arrive out of order.
--   3. account_deletions a minimal record that an account was deleted and
--                        what was done about its billing -- enough to answer
--                        "why was I charged?" without keeping any of the
--                        relationship record.
--
-- Plus the transcription meter in seconds (see lib/billing/transcription).
--
-- Additive only. Nothing is dropped or rewritten. Every new table is
-- service-role only: RLS on, no policies.
-- =============================================================================

-- --- 1. the event ledger -----------------------------------------------------

create table if not exists public.stripe_events (
  id text primary key,                         -- evt_...
  type text not null,
  livemode boolean not null,
  event_created_at timestamptz not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  -- No foreign key: the ledger outlives the account it concerned.
  user_id uuid,
  error_code text,
  received_at timestamptz not null default now()
);

create index if not exists stripe_events_status_idx
  on public.stripe_events (status, claimed_at);

alter table public.stripe_events enable row level security;

/**
 * Claim an event for processing, atomically.
 *
 *   'claimed'      first delivery, or a retry of one that failed or stalled
 *   'duplicate'    already processed (or deliberately ignored)
 *   'in_progress'  another delivery holds it right now; the caller must
 *                  answer with a retryable status, never a 2xx
 *
 * A claim older than five minutes is treated as abandoned (a function that
 * timed out mid-event) and may be re-claimed.
 */
create or replace function public.claim_stripe_event(
  p_id text,
  p_type text,
  p_livemode boolean,
  p_created timestamptz
)
returns text
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  existing record;
begin
  insert into public.stripe_events (id, type, livemode, event_created_at)
  values (p_id, p_type, p_livemode, p_created)
  on conflict (id) do nothing;

  if found then
    return 'claimed';
  end if;

  select status, claimed_at into existing
    from public.stripe_events
   where id = p_id
   for update;

  if existing.status in ('processed', 'ignored') then
    return 'duplicate';
  end if;

  if existing.status = 'processing' and existing.claimed_at > now() - interval '5 minutes' then
    return 'in_progress';
  end if;

  update public.stripe_events
     set status = 'processing',
         claimed_at = now(),
         attempts = attempts + 1,
         error_code = null
   where id = p_id;
  return 'claimed';
end;
$fn$;

revoke all on function public.claim_stripe_event(text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, boolean, timestamptz)
  to service_role;

-- --- 2. ordering guard on the canonical row ---------------------------------

alter table public.subscriptions
  add column if not exists stripe_state_at timestamptz;

-- --- 3. the deletion audit ---------------------------------------------------

create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  -- The deleted account's id, kept as a plain value so the row survives the
  -- deletion it records. Not a foreign key, by design.
  deleted_user_id uuid not null,
  requested_via text not null check (requested_via in ('web', 'ios', 'support')),
  plan_at_deletion text,
  access_tier_at_deletion text,
  billing_provider text check (billing_provider in ('stripe', 'apple', 'none')),
  stripe_customer_id text,
  stripe_subscriptions_canceled text[] not null default '{}',
  stripe_invoices_voided text[] not null default '{}',
  -- 'none' | 'canceled' | 'already_inactive' | 'apple_user_managed'
  billing_outcome text not null,
  data_deleted_at timestamptz,
  auth_deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_deletions_user_idx
  on public.account_deletions (deleted_user_id);
create index if not exists account_deletions_customer_idx
  on public.account_deletions (stripe_customer_id);

alter table public.account_deletions enable row level security;

-- --- 4. transcription measured in seconds -----------------------------------

-- The existing `voice_transcription` meter counts calls. This one counts
-- seconds of audio, which is what transcription is billed by, and what a
-- future plan allowance would be expressed in.
alter type meter_kind add value if not exists 'transcription_seconds';
