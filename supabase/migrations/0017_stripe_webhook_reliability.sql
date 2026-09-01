-- =============================================================================
-- STRIPE WEBHOOK RELIABILITY
--
-- Stripe is the authoritative source of billing truth, and it delivers that
-- truth over an unreliable channel: at-least-once, occasionally out of order,
-- and retried for days after a failure. The webhook was correct about the happy
-- path and had nothing to say about any of that. Three additions, no rewrites.
--
--   1. stripe_webhook_events  - the ledger that makes redelivery a no-op.
--   2. subscriptions.stripe_event_at - a watermark, so a late-arriving older
--      event cannot resurrect a state Stripe has already moved past.
--   3. apply_stripe_subscription() - the whole read-decide-write cycle inside
--      one statement holding a row lock, because two Vercel functions handling
--      two events for the same customer at the same moment is not a rare case,
--      it is the normal shape of a plan change.
--
-- Nothing here is destructive. The new column is nullable, the new table starts
-- empty, and an account whose watermark is null accepts the next event it sees.
-- =============================================================================

-- --- 1. event ledger ---------------------------------------------------------

-- Keyed by Stripe's own event id, which is stable across redeliveries. A row
-- appearing is the claim; processed_at is the receipt.
--
-- An unprocessed row is deliberately NOT treated as "someone else has this".
-- It means a previous attempt claimed the event and did not finish, and Stripe
-- is right to retry it -- every handler below is idempotent, so replaying is
-- always safer than dropping.
create table public.stripe_webhook_events (
  id text primary key,
  type text not null,
  -- Stripe's timestamp, not ours. Ours only records when it reached us.
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  -- 'skipped' for events we acknowledge without acting on, so the ledger
  -- distinguishes "handled" from "deliberately ignored" during an incident.
  outcome text
);

create index stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);

-- RETENTION. This table grows by one row per handled event forever, which at
-- Atturel's event volume is a few rows per subscriber per month -- small, but
-- unbounded. Nothing prunes it automatically, because a scheduled job is a
-- piece of infrastructure and a stale ledger is not an outage.
--
-- Deleting rows older than Stripe's own retry window is safe: an event that
-- old can no longer be redelivered, so its receipt can no longer prevent
-- anything. Run it by hand or from pg_cron when the table gets large:
--
--   delete from public.stripe_webhook_events where received_at < now() - interval '30 days';

-- Service role only. There are no policies below, and under RLS that is a
-- refusal: no browser and no user-scoped server action can read the billing
-- event stream or forge an entry in it.
alter table public.stripe_webhook_events enable row level security;

-- --- 2. ordering watermark ---------------------------------------------------

-- The `created` timestamp of the most recent Stripe event applied to this row.
-- Null on every existing account, which reads as "accept the next event".
alter table public.subscriptions
  add column stripe_event_at timestamptz;

comment on column public.subscriptions.stripe_event_at is
  'Stripe event.created of the last event applied. Older events are ignored.';

-- --- 3. atomic apply ---------------------------------------------------------

-- One call, one row lock, one decision.
--
-- SECURITY DEFINER with execute revoked from every role but service_role. The
-- webhook already holds the service role key -- this function does not widen
-- what that key can do, it narrows what the webhook has to get right.
--
-- Returns one of:
--   'stale'      the event is older than what has already been applied
--   'no_account' the user id names nobody
--   'upgraded'   applied, AND this account was on free before
--   'applied'    applied, no plan transition
--
-- The caller logs the difference and acknowledges every one of them: a stale
-- event is correctly handled, not a failure to retry. 'upgraded' is separated
-- from 'applied' so the one event worth counting -- somebody becoming a paying
-- customer -- can be counted exactly once, rather than re-counted on every
-- subsequent subscription update.
create or replace function public.apply_stripe_subscription(
  p_user_id uuid,
  p_event_at timestamptz,
  p_plan plan_tier,
  p_status subscription_status,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_ends_at timestamptz,
  p_billing_interval text,
  -- 0 switches founding assignment off entirely. The promotion is configuration
  -- in lib/billing/plans, and this function is told the answer rather than
  -- holding a second copy of it.
  p_founding_max integer default 0,
  p_founding_protection_months integer default 0
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing public.subscriptions%rowtype;
  taken integer;
  keep_founding boolean := false;
  next_number integer;
  protected_until timestamptz;
begin
  -- FOR UPDATE serialises concurrent deliveries for this account. Everything
  -- from here to the update below sees a state nobody else can move.
  select * into existing from public.subscriptions where user_id = p_user_id for update;

  -- Every account gets a row from the signup trigger, so this is the repair
  -- path for an account that predates it or whose trigger failed -- not the
  -- normal one.
  if not found then
    -- Asked BEFORE the insert, because the foreign key to auth.users would
    -- otherwise raise rather than return: the caller would see an exception,
    -- answer Stripe with a 500, and earn three days of retries for an event
    -- naming a user who does not exist and never will. A deleted account whose
    -- subscription outlives it in Stripe is exactly that case.
    if not exists (select 1 from auth.users where id = p_user_id) then
      return 'no_account';
    end if;

    insert into public.subscriptions (user_id, plan) values (p_user_id, 'free')
    on conflict (user_id) do nothing;
    select * into existing from public.subscriptions where user_id = p_user_id for update;
    if not found then
      return 'no_account';
    end if;
  end if;

  if existing.stripe_event_at is not null and p_event_at < existing.stripe_event_at then
    return 'stale';
  end if;

  -- Founding status is sticky: an account that was given a place keeps it
  -- through a lapse and a resubscribe. Taking it back for a failed card would
  -- be a punitive reading of a promise made at signup.
  if existing.is_founding then
    keep_founding := true;
    next_number := existing.founding_number;
    protected_until := existing.price_protected_until;
  elsif p_founding_max > 0 and p_plan <> 'free' then
    -- The row lock above covers THIS account. Counting and numbering founding
    -- places is a question about every account, so two people subscribing at
    -- the same instant would both read the same count, both pick the same
    -- max()+1, and the second would hit the unique index -- a 500, and three
    -- days of Stripe retries for a promotion nobody needed that urgently.
    --
    -- A transaction-scoped advisory lock serialises just this branch, and only
    -- while the promotion is running. It is released at commit; nothing has to
    -- remember to unlock it. The constant is arbitrary but must stay stable.
    perform pg_advisory_xact_lock(hashtext('atturel.founding_number'));

    select count(*) into taken from public.subscriptions where is_founding;
    if taken < p_founding_max then
      keep_founding := true;
      -- max()+1 rather than count()+1: a revoked or deleted account must not
      -- hand its number to someone else, and the unique index would refuse it.
      select coalesce(max(founding_number), 0) + 1 into next_number
        from public.subscriptions;
      protected_until := now() + make_interval(months => p_founding_protection_months);
    end if;
  end if;

  update public.subscriptions set
    plan                   = p_plan,
    status                 = p_status,
    -- coalesce, not overwrite: a subscription event carries the customer id,
    -- but nothing should be able to null one out.
    stripe_customer_id     = coalesce(p_stripe_customer_id, stripe_customer_id),
    stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
    stripe_price_id        = p_stripe_price_id,
    current_period_end     = p_current_period_end,
    cancel_at_period_end   = p_cancel_at_period_end,
    trial_ends_at          = p_trial_ends_at,
    billing_interval       = p_billing_interval,
    is_founding            = keep_founding,
    founding_number        = case when keep_founding then next_number else founding_number end,
    price_protected_until  = case when keep_founding then protected_until else price_protected_until end,
    stripe_event_at        = p_event_at
  where user_id = p_user_id;

  if existing.plan = 'free' and p_plan <> 'free' then
    return 'upgraded';
  end if;

  return 'applied';
end;
$fn$;

-- Reachable with the service role key and nothing else. `authenticated` is
-- revoked explicitly: a signed-in user who could call this could write
-- themselves a Pro subscription, which is the one thing the whole billing
-- boundary exists to prevent.
revoke all on function public.apply_stripe_subscription(
  uuid, timestamptz, plan_tier, subscription_status, text, text, text,
  timestamptz, boolean, timestamptz, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.apply_stripe_subscription(
  uuid, timestamptz, plan_tier, subscription_status, text, text, text,
  timestamptz, boolean, timestamptz, text, integer, integer
) to service_role;

-- --- 4. failed payment -------------------------------------------------------

-- invoice.payment_failed is a status-only change and must never be allowed to
-- overwrite plan, price or period. It is also the one event that arrives keyed
-- by customer rather than by user, so it gets its own narrow path.
--
-- Deliberately does NOT move the watermark: an invoice event and a subscription
-- event describe different objects, and letting an invoice advance the
-- subscription watermark would cause the next legitimate subscription event to
-- be discarded as stale.
create or replace function public.mark_stripe_payment_failed(
  p_stripe_customer_id text,
  p_stripe_subscription_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  affected integer;
begin
  -- The subscription must be named. This used to accept null as "any
  -- subscription for this customer", which meant a failed ONE-OFF invoice --
  -- a manual charge raised in the dashboard, which carries no subscription
  -- parent -- moved a healthy Pro account to past_due. The caller now refuses
  -- to reach here without an id; the argument stays nullable so an older
  -- deployment calling it cannot suddenly start raising, but null now matches
  -- nothing rather than everything.
  if p_stripe_subscription_id is null then
    return 'no_match';
  end if;

  update public.subscriptions set status = 'past_due'
   where stripe_customer_id = p_stripe_customer_id
     and stripe_subscription_id = p_stripe_subscription_id
     -- Nothing to do for an account already off the paid plans. Marking a
     -- canceled subscription past_due would be inventing a state Stripe is not
     -- reporting, and would show a dunning banner to someone who has left.
     and status in ('trialing', 'active', 'past_due');

  get diagnostics affected = row_count;
  return case when affected > 0 then 'applied' else 'no_match' end;
end;
$fn$;

revoke all on function public.mark_stripe_payment_failed(text, text)
  from public, anon, authenticated;
grant execute on function public.mark_stripe_payment_failed(text, text) to service_role;
