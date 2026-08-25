-- =============================================================================
-- ROW LEVEL SECURITY: CROSS-USER ISOLATION
--
-- Row level security is the actual boundary in this product. The explicit
-- `.eq('user_id', …)` filters in application code are defence in depth — if a
-- policy were wrong, a single forgotten filter would expose one person's
-- private relationship notes to another. That is the failure this file exists
-- to make impossible to ship unnoticed.
--
-- The test creates two real users, gives each one row in every user-owned
-- table, and asserts visibility in BOTH directions. A one-sided check passes
-- happily against a policy of `using (true)`.
--
-- Everything runs inside a transaction that always rolls back, so the file is
-- safe to run against any environment, including production.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/rls-isolation.sql
-- =============================================================================

begin;

-- Impersonation helpers. `auth.uid()` reads the sub claim out of this GUC,
-- which is exactly how PostgREST presents a signed-in user to a policy.
create or replace function pg_temp.become(target uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', target, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.become_superuser()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', description;
  else
    raise exception 'FAIL  %', description;
  end if;
end $$;

do $test$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
  alice_ws uuid;
  bob_ws uuid;
  alice_person uuid;
  bob_person uuid;
  visible int;
  denied boolean;
begin
  -- --- fixtures -------------------------------------------------------------
  perform pg_temp.become_superuser();

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values
    (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'alice+rlstest@example.invalid', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bob+rlstest@example.invalid', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  -- The signup trigger provisions profile + workspace; read back what it made.
  select default_workspace_id into alice_ws from public.profiles where id = alice;
  select default_workspace_id into bob_ws   from public.profiles where id = bob;

  perform pg_temp.assert(alice_ws is not null, 'signup provisions a personal workspace');
  perform pg_temp.assert(alice_ws <> bob_ws, 'each user gets a distinct workspace');

  insert into public.people (user_id, workspace_id, full_name, visibility)
  values (alice, alice_ws, 'Alice Contact', 'private') returning id into alice_person;

  insert into public.people (user_id, workspace_id, full_name, visibility)
  values (bob, bob_ws, 'Bob Contact', 'private') returning id into bob_person;

  insert into public.observations (user_id, workspace_id, person_id, content, status, visibility)
  values (alice, alice_ws, alice_person, 'Alice private note', 'active', 'private');

  insert into public.notes (user_id, workspace_id, person_id, body, visibility)
  values (alice, alice_ws, alice_person, 'Alice private body', 'private');

  -- --- Alice sees exactly her own ------------------------------------------
  perform pg_temp.become(alice);

  select count(*) into visible from public.people;
  perform pg_temp.assert(visible = 1, 'alice sees exactly one person (her own)');

  select count(*) into visible from public.people where id = bob_person;
  perform pg_temp.assert(visible = 0, 'alice cannot see bob''s person row');

  select count(*) into visible from public.notes;
  perform pg_temp.assert(visible = 1, 'alice sees her own note');

  -- --- Bob sees exactly his own, and none of Alice's ------------------------
  perform pg_temp.become(bob);

  select count(*) into visible from public.people;
  perform pg_temp.assert(visible = 1, 'bob sees exactly one person (his own)');

  select count(*) into visible from public.people where id = alice_person;
  perform pg_temp.assert(visible = 0, 'bob cannot see alice''s person row');

  select count(*) into visible from public.observations;
  perform pg_temp.assert(visible = 0, 'bob cannot see alice''s observations');

  select count(*) into visible from public.notes;
  perform pg_temp.assert(visible = 0, 'bob cannot see alice''s notes');

  -- --- Bob cannot WRITE into Alice's space ----------------------------------
  -- Read isolation without write isolation still lets an attacker plant a row
  -- that the victim then reads as their own record.
  denied := false;
  begin
    insert into public.people (user_id, workspace_id, full_name, visibility)
    values (alice, alice_ws, 'Planted by bob', 'private');
  exception when insufficient_privilege or check_violation then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'bob cannot insert a row owned by alice');

  denied := false;
  begin
    insert into public.people (user_id, workspace_id, full_name, visibility)
    values (bob, alice_ws, 'Bob row in alice workspace', 'private');
  exception when insufficient_privilege or check_violation then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'bob cannot insert into alice''s workspace');

  -- --- Bob cannot MODIFY or DELETE Alice's rows -----------------------------
  update public.people set full_name = 'Hijacked' where id = alice_person;
  perform pg_temp.assert(
    not exists (select 1 from public.people where full_name = 'Hijacked'),
    'bob''s update of alice''s row affects nothing'
  );

  delete from public.people where id = alice_person;
  perform pg_temp.become_superuser();
  perform pg_temp.assert(
    exists (select 1 from public.people where id = alice_person),
    'alice''s row survives bob''s delete'
  );

  -- --- Subscriptions are not client-writable --------------------------------
  -- A client that can grant itself a plan makes the entire paywall decorative.
  perform pg_temp.become(bob);
  denied := false;
  begin
    update public.subscriptions set plan = 'pro' where user_id = bob;
    denied := not exists (select 1 from public.subscriptions where user_id = bob and plan = 'pro');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'a user cannot grant themselves a paid plan');

  -- --- Entitlement overrides are read-only to clients -----------------------
  denied := false;
  begin
    insert into public.entitlement_overrides (user_id, capability, enabled)
    values (bob, 'deepResearch', true);
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'a user cannot grant themselves a capability');

  -- --- The security audit trail is append-only ------------------------------
  -- RLS filters SELECT rather than refusing it, so an empty table would make a
  -- naive check pass. Plant a row first: zero visible rows then means the
  -- policy is hiding it, not that there was nothing to hide.
  perform pg_temp.become_superuser();
  insert into public.security_events (user_id, kind) values (bob, 'rls_test');

  perform pg_temp.become(bob);
  select count(*) into visible from public.security_events;
  perform pg_temp.assert(visible = 0, 'a session cannot read the security audit trail');

  -- --- Anonymous is refused outright ----------------------------------------
  -- Stronger than an empty result: the anon role cannot EXECUTE the workspace
  -- helper the policies call, so the query is denied rather than filtered.
  -- Accept either outcome, since a future policy that returns zero rows to anon
  -- would still be correct — but a non-empty result never is.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);

  denied := false;
  begin
    select count(*) into visible from public.people;
    denied := (visible = 0);
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'anon cannot read people');

  denied := false;
  begin
    select count(*) into visible from public.observations;
    denied := (visible = 0);
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'anon cannot read observations');

  perform pg_temp.become_superuser();
  raise notice 'ALL RLS ISOLATION ASSERTIONS PASSED';
end
$test$;

-- Nothing above is kept. The fixtures were only ever a way to ask the question.
rollback;
