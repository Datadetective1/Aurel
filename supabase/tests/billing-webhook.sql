-- =============================================================================
-- STRIPE WEBHOOK: ORDERING, IDEMPOTENCY AND THE PAYMENT BOUNDARY
--
-- The webhook is the only thing allowed to grant a paid plan, and everything
-- that makes that safe lives in the database rather than in the handler:
-- apply_stripe_subscription() holds a row lock, refuses an event older than the
-- one already applied, and is EXECUTE-able by the service role alone.
--
-- Those are exactly the properties that unit tests cannot check, because they
-- are properties of Postgres — a mocked client will happily agree that a
-- revoked function was called. This file asks the database.
--
-- Everything runs inside a transaction that always rolls back, so it is safe to
-- run against any environment, including production.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/billing-webhook.sql
-- =============================================================================

begin;

create or replace function pg_temp.become(target uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', target, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', target::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.become_superuser()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FAILED: %', description;
  end if;
  raise notice 'ok  %', description;
end $$;

/** Whether the current role may execute a function at all. */
create or replace function pg_temp.refuses(statement text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege or others then
      raise notice 'ok  %', description;
      return;
  end;
  raise exception 'FAILED: % -- the statement was allowed', description;
end $$;

do $test$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
  outcome text;
begin
  insert into auth.users (id, email) values
    (alice, 'alice-billing@example.test'),
    (bob,   'bob-billing@example.test');

  -- --- the row every account starts with ------------------------------------
  perform pg_temp.assert(
    (select plan from public.subscriptions where user_id = alice) = 'free',
    'the signup trigger gives a new account a free subscription'
  );

  -- --- applying subscription state -------------------------------------------
  outcome := public.apply_stripe_subscription(
    alice, '2026-09-01T10:00:00Z', 'pro', 'active',
    'cus_alice', 'sub_alice', 'price_monthly',
    '2026-10-01T10:00:00Z', false, null, 'monthly', 0, 0);

  perform pg_temp.assert(outcome = 'applied', 'an active subscription is applied');
  perform pg_temp.assert(
    (select plan || '/' || status || '/' || billing_interval
       from public.subscriptions where user_id = alice) = 'pro/active/monthly',
    'plan, status and interval are all written'
  );

  -- --- out of order delivery -------------------------------------------------
  -- Stripe does not promise ordering. An event created BEFORE the one already
  -- applied describes a state Stripe has moved past, and applying it would
  -- silently cancel a live subscription.
  outcome := public.apply_stripe_subscription(
    alice, '2026-09-01T09:00:00Z', 'free', 'canceled',
    'cus_alice', 'sub_alice', 'price_monthly',
    null, false, null, null, 0, 0);

  perform pg_temp.assert(outcome = 'stale', 'an older event is refused');
  perform pg_temp.assert(
    (select plan from public.subscriptions where user_id = alice) = 'pro',
    'and leaves the newer state untouched'
  );

  -- A newer one is applied, and a redelivery of it is harmless.
  outcome := public.apply_stripe_subscription(
    alice, '2026-09-01T11:00:00Z', 'free', 'canceled',
    'cus_alice', 'sub_alice', 'price_monthly',
    null, true, null, null, 0, 0);
  perform pg_temp.assert(outcome = 'applied', 'a newer event is applied');

  outcome := public.apply_stripe_subscription(
    alice, '2026-09-01T11:00:00Z', 'free', 'canceled',
    'cus_alice', 'sub_alice', 'price_monthly',
    null, true, null, null, 0, 0);
  perform pg_temp.assert(
    outcome = 'applied'
      and (select status from public.subscriptions where user_id = alice) = 'canceled',
    'redelivering the same event reaches the same state'
  );

  -- --- identifiers are never nulled out --------------------------------------
  perform public.apply_stripe_subscription(
    alice, '2026-09-01T12:00:00Z', 'pro', 'active',
    null, null, 'price_monthly',
    '2026-11-01T00:00:00Z', false, null, 'monthly', 0, 0);
  perform pg_temp.assert(
    (select stripe_customer_id from public.subscriptions where user_id = alice) = 'cus_alice',
    'an event without a customer id does not erase the stored one'
  );

  -- --- the founding promotion ------------------------------------------------
  perform public.apply_stripe_subscription(
    bob, '2026-09-01T10:00:00Z', 'pro', 'active',
    'cus_bob', 'sub_bob', 'price_yearly',
    '2027-09-01T00:00:00Z', false, null, 'yearly', 0, 0);
  perform pg_temp.assert(
    not (select is_founding from public.subscriptions where user_id = bob),
    'a founding cap of 0 assigns no founding place'
  );

  perform public.apply_stripe_subscription(
    bob, '2026-09-01T13:00:00Z', 'pro', 'active',
    'cus_bob', 'sub_bob', 'price_yearly',
    '2027-09-01T00:00:00Z', false, null, 'yearly', 250, 12);
  perform pg_temp.assert(
    (select is_founding and founding_number is not null and price_protected_until is not null
       from public.subscriptions where user_id = bob),
    'an open promotion assigns a numbered, time-limited founding place'
  );

  -- --- failed payments are status-only and narrowly scoped -------------------
  perform pg_temp.assert(
    public.mark_stripe_payment_failed('cus_alice', 'sub_alice') = 'applied',
    'a failed payment marks the matching subscription past_due'
  );
  perform pg_temp.assert(
    (select status from public.subscriptions where user_id = alice) = 'past_due'
      and (select plan from public.subscriptions where user_id = alice) = 'pro',
    'and changes nothing but the status -- access is not revoked on one decline'
  );
  perform pg_temp.assert(
    public.mark_stripe_payment_failed('cus_bob', 'sub_SOMETHING_ELSE') = 'no_match',
    'an invoice naming a different subscription does not touch this one'
  );
  perform pg_temp.assert(
    public.mark_stripe_payment_failed('cus_nobody') = 'no_match',
    'an unknown customer is reported, not raised'
  );

  update public.subscriptions set status = 'canceled' where user_id = bob;
  perform pg_temp.assert(
    public.mark_stripe_payment_failed('cus_bob', 'sub_bob') = 'no_match',
    'an account that has already left is not dragged back to past_due'
  );

  -- --- the event ledger ------------------------------------------------------
  insert into public.stripe_webhook_events (id, type, event_created_at)
    values ('evt_test_ledger', 'invoice.paid', now());
  insert into public.stripe_webhook_events (id, type, event_created_at)
    values ('evt_test_ledger', 'invoice.paid', now())
    on conflict (id) do nothing;
  perform pg_temp.assert(
    (select count(*) from public.stripe_webhook_events where id = 'evt_test_ledger') = 1,
    'the ledger holds one row per Stripe event id, so a redelivery is a no-op'
  );

  -- --- the boundary ----------------------------------------------------------
  -- The whole point. A signed-in user who could reach any of this could write
  -- themselves a paid plan, and the paywall would be decorative.
  perform pg_temp.become(alice);

  perform pg_temp.refuses(
    format('select public.apply_stripe_subscription(%L, now(), %L, %L, %L, %L, %L, now(), false, null, %L, 0, 0)',
           alice, 'pro', 'active', 'c', 's', 'p', 'monthly'),
    'a signed-in user cannot call apply_stripe_subscription'
  );

  perform pg_temp.refuses(
    'select public.mark_stripe_payment_failed(''cus_alice'')',
    'a signed-in user cannot call mark_stripe_payment_failed'
  );

  update public.subscriptions set plan = 'pro', status = 'active' where user_id = alice;
  perform pg_temp.become_superuser();
  perform pg_temp.assert(
    (select plan from public.subscriptions where user_id = alice) = 'pro'
      and (select status from public.subscriptions where user_id = alice) = 'past_due',
    'a signed-in user cannot update their own subscription row'
  );

  perform pg_temp.become(alice);
  perform pg_temp.refuses(
    format('insert into public.subscriptions (user_id, plan, status) values (%L, ''pro'', ''active'')', gen_random_uuid()),
    'a signed-in user cannot insert a subscription row'
  );
  perform pg_temp.refuses(
    'insert into public.stripe_webhook_events (id, type, event_created_at) values (''evt_forged'', ''x'', now())',
    'a signed-in user cannot forge a webhook ledger entry'
  );
  perform pg_temp.assert(
    (select count(*) from public.stripe_webhook_events) = 0,
    'and cannot read the billing event stream at all'
  );
  perform pg_temp.assert(
    (select count(*) from public.subscriptions where user_id <> alice) = 0,
    'and cannot see anybody else''s subscription'
  );
  perform pg_temp.assert(
    (select count(*) from public.subscriptions where user_id = alice) = 1,
    'while still being able to read their own'
  );

  perform pg_temp.become_superuser();
  raise notice 'ALL BILLING WEBHOOK ASSERTIONS PASSED';
end
$test$;

-- Nothing above is kept. The fixtures were only ever a way to ask the question.
rollback;
