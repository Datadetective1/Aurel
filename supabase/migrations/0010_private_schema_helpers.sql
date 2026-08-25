-- =============================================================================
-- Move the workspace RLS helpers out of the PostgREST-exposed schema.
--
-- They must stay SECURITY DEFINER (otherwise evaluating them inside a policy on
-- workspace_members recurses) and must stay EXECUTE-able by `authenticated`
-- (policy expressions run as the calling role). Both of those together mean they
-- would be reachable at /rest/v1/rpc/... while they live in `public`.
--
-- Relocating them to a schema PostgREST does not expose keeps the policy
-- behaviour identical while removing the RPC surface entirely.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$fn$;

create or replace function private.is_workspace_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target and user_id = auth.uid()
  );
$fn$;

revoke all on function private.current_workspace_ids() from public, anon;
revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.current_workspace_ids() to authenticated, service_role;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;

-- --- repoint every policy at the private helper -------------------------------

do $repoint$
declare
  t text;
  shareable text[] := array[
    'organizations','people','topics','person_topics','interactions','interaction_participants',
    'meetings','meeting_attendees','observations','observation_sources','commitments','notes',
    'ai_artifacts','artifact_sources','ai_feedback'
  ];
  sourcey text[] := array[
    'sources','source_person_links','professional_facts','fact_sources',
    'research_jobs','identity_candidates'
  ];
begin
  foreach t in array shareable
  loop
    execute format('drop policy if exists "%s: read" on public.%I', t, t);
    execute format('drop policy if exists "%s: insert" on public.%I', t, t);
    execute format('drop policy if exists "%s: update" on public.%I', t, t);
    execute format('drop policy if exists "%s: delete" on public.%I', t, t);

    execute format($p$
      create policy "%s: read" on public.%I for select using (
        user_id = (select auth.uid())
        or (visibility = 'shared' and workspace_id in (select private.current_workspace_ids()))
      )$p$, t, t);

    execute format($p$
      create policy "%s: insert" on public.%I for insert with check (
        user_id = (select auth.uid())
        and workspace_id in (select private.current_workspace_ids())
      )$p$, t, t);

    execute format($p$
      create policy "%s: update" on public.%I for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and workspace_id in (select private.current_workspace_ids()))
      $p$, t, t);

    execute format($p$
      create policy "%s: delete" on public.%I for delete using (user_id = (select auth.uid()))
      $p$, t, t);
  end loop;

  foreach t in array sourcey
  loop
    execute format('drop policy if exists "%s: read" on public.%I', t, t);
    execute format('drop policy if exists "%s: insert" on public.%I', t, t);
    execute format('drop policy if exists "%s: update" on public.%I', t, t);
    execute format('drop policy if exists "%s: delete" on public.%I', t, t);

    execute format($p$
      create policy "%s: read" on public.%I for select using (
        user_id = (select auth.uid())
        or workspace_id in (select private.current_workspace_ids())
      )$p$, t, t);

    execute format($p$
      create policy "%s: insert" on public.%I for insert with check (
        user_id = (select auth.uid())
        and workspace_id in (select private.current_workspace_ids())
      )$p$, t, t);

    execute format($p$
      create policy "%s: update" on public.%I for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
      $p$, t, t);

    execute format($p$
      create policy "%s: delete" on public.%I for delete using (user_id = (select auth.uid()))
      $p$, t, t);
  end loop;
end
$repoint$;

drop policy if exists "workspaces: read own memberships" on public.workspaces;
create policy "workspaces: read own memberships" on public.workspaces
  for select using (id in (select private.current_workspace_ids()));

drop policy if exists "workspace_members: read own workspaces" on public.workspace_members;
create policy "workspace_members: read own workspaces" on public.workspace_members
  for select using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists "usage_meters: insert own" on public.usage_meters;
create policy "usage_meters: insert own" on public.usage_meters
  for insert with check (
    user_id = (select auth.uid())
    and workspace_id in (select private.current_workspace_ids())
  );

-- The public wrappers no longer have callers.
drop function if exists public.current_workspace_ids();
drop function if exists public.is_workspace_member(uuid);