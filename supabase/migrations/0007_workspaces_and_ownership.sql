-- =============================================================================
-- V2 REFACTOR: WORKSPACE OWNERSHIP
-- Introduces the private/shared boundary before any real data exists.
--
-- Model:
--   * every user gets exactly one PERSONAL workspace on signup
--   * domain rows carry BOTH workspace_id (where it lives) and user_id (who
--     authored it) plus a `visibility` of private | shared
--   * a row is readable if you authored it, OR it is shared and you are a member
--     of its workspace
--
-- For a personal workspace the two clauses collapse to "your own rows", so
-- today's behaviour is unchanged. When team workspaces ship, a manager joining a
-- workspace still cannot read a member's PRIVATE notes — which is the whole
-- point of doing this now rather than later.
-- =============================================================================

create type workspace_kind as enum ('personal', 'team', 'enterprise');
create type workspace_role as enum ('owner', 'admin', 'member');
create type record_visibility as enum ('private', 'shared');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind workspace_kind not null default 'personal',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_len check (char_length(name) between 1 and 160)
);
create index workspaces_owner_idx on public.workspaces (owner_id);
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- SECURITY DEFINER so RLS on workspace_members cannot recurse when the helper is
-- called from inside another table's policy. STABLE so Postgres evaluates it
-- once per statement rather than per row.
create or replace function public.current_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$fn$;

create or replace function public.is_workspace_member(target uuid)
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

revoke all on function public.current_workspace_ids() from public, anon;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.current_workspace_ids() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- --- personal workspace provisioning -----------------------------------------

create or replace function public.ensure_personal_workspace(target_user uuid, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare ws uuid;
begin
  select w.id into ws
    from public.workspaces w
   where w.owner_id = target_user and w.kind = 'personal'
   limit 1;

  if ws is null then
    insert into public.workspaces (name, kind, owner_id)
    values (coalesce(nullif(trim(display_name), ''), 'Personal') || '''s workspace', 'personal', target_user)
    returning id into ws;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws, target_user, 'owner')
    on conflict do nothing;
  end if;

  return ws;
end;
$fn$;

revoke all on function public.ensure_personal_workspace(uuid, text) from public, anon, authenticated;

-- Extend the signup trigger to also provision the workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  display text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  ws uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, display)
  on conflict (id) do nothing;

  ws := public.ensure_personal_workspace(new.id, coalesce(display, split_part(new.email, '@', 1)));

  update public.profiles set default_workspace_id = ws where id = new.id;
  return new;
end;
$fn$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- --- profiles gain a default workspace ---------------------------------------

alter table public.profiles add column default_workspace_id uuid references public.workspaces(id) on delete set null;

-- --- backfill for users that already exist ------------------------------------

do $backfill$
declare r record; ws uuid;
begin
  for r in select u.id, coalesce(p.full_name, split_part(u.email, '@', 1)) as display
             from auth.users u left join public.profiles p on p.id = u.id
  loop
    ws := public.ensure_personal_workspace(r.id, r.display);
    update public.profiles set default_workspace_id = ws where id = r.id;
  end loop;
end
$backfill$;

-- --- add workspace_id + visibility to domain tables ---------------------------

do $migrate$
declare
  t text;
  -- Tables that will eventually be shareable inside a team workspace.
  shareable text[] := array[
    'organizations','people','topics','person_topics','interactions','interaction_participants',
    'meetings','meeting_attendees','observations','observation_sources','commitments','notes',
    'ai_artifacts','artifact_sources','ai_feedback'
  ];
begin
  foreach t in array shareable
  loop
    execute format(
      'alter table public.%I add column workspace_id uuid references public.workspaces(id) on delete cascade', t);
    execute format(
      'alter table public.%I add column visibility record_visibility not null default ''private''', t);

    -- Backfill: everything existing belongs to its author's personal workspace.
    execute format(
      'update public.%I s set workspace_id = p.default_workspace_id from public.profiles p where p.id = s.user_id', t);

    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('create index %I on public.%I (workspace_id, visibility)', t || '_workspace_idx', t);
  end loop;
end
$migrate$;

-- --- rewrite RLS ---------------------------------------------------------------

alter table public.workspaces enable row level security;
create policy "workspaces: read own memberships" on public.workspaces
  for select using (id in (select public.current_workspace_ids()));
create policy "workspaces: owner updates" on public.workspaces
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.workspace_members enable row level security;
create policy "workspace_members: read own workspaces" on public.workspace_members
  for select using (workspace_id in (select public.current_workspace_ids()));

do $rls$
declare
  t text;
  shareable text[] := array[
    'organizations','people','topics','person_topics','interactions','interaction_participants',
    'meetings','meeting_attendees','observations','observation_sources','commitments','notes',
    'ai_artifacts','artifact_sources','ai_feedback'
  ];
begin
  foreach t in array shareable
  loop
    execute format('drop policy if exists "%s: read own" on public.%I', t, t);
    execute format('drop policy if exists "%s: insert own" on public.%I', t, t);
    execute format('drop policy if exists "%s: update own" on public.%I', t, t);
    execute format('drop policy if exists "%s: delete own" on public.%I', t, t);

    -- Readable if you wrote it, or it is shared into a workspace you belong to.
    execute format($p$
      create policy "%s: read" on public.%I for select using (
        user_id = (select auth.uid())
        or (visibility = 'shared' and workspace_id in (select public.current_workspace_ids()))
      )$p$, t, t);

    -- You may only create rows authored by you, in a workspace you belong to.
    execute format($p$
      create policy "%s: insert" on public.%I for insert with check (
        user_id = (select auth.uid())
        and workspace_id in (select public.current_workspace_ids())
      )$p$, t, t);

    -- Only the author may modify or delete. Sharing grants read, never write.
    execute format($p$
      create policy "%s: update" on public.%I for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and workspace_id in (select public.current_workspace_ids()))
      $p$, t, t);

    execute format($p$
      create policy "%s: delete" on public.%I for delete using (user_id = (select auth.uid()))
      $p$, t, t);
  end loop;
end
$rls$;