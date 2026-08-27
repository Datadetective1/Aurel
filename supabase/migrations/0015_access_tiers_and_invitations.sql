-- ACCESS TIERS AND PILOT INVITATIONS
-- =============================================================================
-- Who gets the whole product without hitting the free tier's quotas.
--
-- Three tiers, and the important one is STANDARD: it changes nothing. Ordinary
-- accounts resolve exactly as they do today, through the same plan definitions
-- and the same quota arithmetic. OWNER and PILOT lift the quota ceiling and
-- turn every capability on; they do not touch metering, which keeps recording
-- every unit of work and every vendor cost exactly as before. Knowing what the
-- pilot costs is the entire reason to run one.
--
-- SECURITY MODEL, in one line: no client may write to any table here.
--
-- access_grants and pilot_invitations carry read policies and no write policies
-- at all, which under RLS means every insert, update and delete from a browser
-- or a user-scoped server action is refused. The only path that can create a
-- grant is redeem_pilot_invitation() below -- SECURITY DEFINER, and it writes
-- the literal 'pilot'. There is no argument it accepts that produces 'owner'.
-- Owner is assignable only by something holding the service role or a psql
-- connection, which is to say by a person with the keys.
-- =============================================================================

create type access_tier as enum ('standard', 'pilot', 'owner');

-- One row per account. Absent means standard, so the common case costs nothing
-- to represent and a revoked grant leaves an auditable row behind rather than
-- disappearing.
create table public.access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier access_tier not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  -- 'manual' when set by hand, 'invitation' when redeemed.
  source text not null default 'manual',
  invitation_id uuid,
  revoked_at timestamptz,
  note text
);

create index access_grants_active_idx on public.access_grants (tier)
  where revoked_at is null;

-- Only the hash is stored. The code itself exists in the owner's hands and in
-- the response that created it, and nowhere else -- a leaked database backup
-- does not hand anybody a working invitation.
create table public.pilot_invitations (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  -- Who it was for, in the owner's words. Never the code.
  label text,
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index pilot_invitations_open_idx on public.pilot_invitations (created_at desc)
  where revoked_at is null;

-- Who redeemed what, and when. The unique constraint is also what makes a
-- second attempt by the same person a no-op rather than a second consumption.
create table public.invitation_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.pilot_invitations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invitation_id, user_id)
);

create index invitation_redemptions_user_idx on public.invitation_redemptions (user_id);

-- --- row level security ------------------------------------------------------

alter table public.access_grants enable row level security;
alter table public.pilot_invitations enable row level security;
alter table public.invitation_redemptions enable row level security;

-- An account may see its own tier. That is all it may do.
create policy "access_grants: read own" on public.access_grants
  for select using (user_id = (select auth.uid()));

-- Deliberately NO policies on pilot_invitations. Not even select: a user who
-- could read code_hash could attack it offline, and one who could list rows
-- could enumerate outstanding invitations. Service role only.

create policy "invitation_redemptions: read own" on public.invitation_redemptions
  for select using (user_id = (select auth.uid()));

-- No insert/update/delete policy exists on any of the three tables. Under RLS
-- that is a refusal, and it is the guarantee that a browser cannot promote
-- itself however creatively it calls the API.

-- --- redemption --------------------------------------------------------------

-- The only path from authenticated user to pilot access.
--
-- SECURITY DEFINER because the tables refuse the caller. It takes a hash, never
-- a code, so the raw invitation never reaches the database or its logs. Every
-- outcome is a returned string rather than an exception: the caller needs to
-- tell a user why their code did not work, and an exception would surface as a
-- generic failure.
create or replace function public.redeem_pilot_invitation(code_hash_input text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  invitation public.pilot_invitations%rowtype;
  caller uuid := (select auth.uid());
  inserted integer;
begin
  if caller is null then
    return 'unauthenticated';
  end if;

  -- FOR UPDATE holds the row for the rest of the transaction, so two people
  -- redeeming the last remaining use of a code cannot both pass the count
  -- check. This is what makes single-use actually single-use.
  select * into invitation
    from public.pilot_invitations
   where code_hash = code_hash_input
   for update;

  if not found then return 'invalid'; end if;
  if invitation.revoked_at is not null then return 'revoked'; end if;
  if invitation.expires_at is not null and invitation.expires_at < now() then
    return 'expired';
  end if;
  if invitation.redemption_count >= invitation.max_redemptions then
    return 'exhausted';
  end if;

  -- Somebody who already has access should not spend a redemption to learn
  -- that, least of all an owner pasting a code to test it.
  if exists (
    select 1 from public.access_grants g
     where g.user_id = caller
       and g.revoked_at is null
       and g.tier in ('pilot', 'owner')
  ) then
    return 'already_granted';
  end if;

  insert into public.invitation_redemptions (invitation_id, user_id)
  values (invitation.id, caller)
  on conflict (invitation_id, user_id) do nothing;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    -- This person has redeemed this code before and had the grant revoked
    -- since. Re-granting is fine; consuming a second use is not.
    update public.access_grants
       set tier = 'pilot', revoked_at = null, granted_at = now()
     where user_id = caller;
    if not found then
      insert into public.access_grants (user_id, tier, source, invitation_id, granted_by)
      values (caller, 'pilot', 'invitation', invitation.id, invitation.created_by);
    end if;
    return 'ok';
  end if;

  update public.pilot_invitations
     set redemption_count = redemption_count + 1
   where id = invitation.id;

  insert into public.access_grants (user_id, tier, source, invitation_id, granted_by)
  values (caller, 'pilot', 'invitation', invitation.id, invitation.created_by)
  on conflict (user_id) do update
     set tier = 'pilot',
         revoked_at = null,
         granted_at = now(),
         source = 'invitation',
         invitation_id = excluded.invitation_id;

  return 'ok';
end;
$fn$;

revoke all on function public.redeem_pilot_invitation(text) from public;
grant execute on function public.redeem_pilot_invitation(text) to authenticated;

-- --- owner-side helpers ------------------------------------------------------

-- Grant or revoke by email, for the owner working in SQL. Kept as a function so
-- the operation is one line and cannot half-apply.
create or replace function public.set_access_tier(
  target_email text,
  new_tier access_tier,
  note_text text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target uuid;
begin
  select id into target from auth.users where lower(email) = lower(target_email);
  if target is null then return 'no_such_user'; end if;

  if new_tier = 'standard' then
    update public.access_grants set revoked_at = now() where user_id = target;
    return 'revoked';
  end if;

  insert into public.access_grants (user_id, tier, source, note)
  values (target, new_tier, 'manual', note_text)
  on conflict (user_id) do update
     set tier = excluded.tier,
         revoked_at = null,
         granted_at = now(),
         source = 'manual',
         note = excluded.note;

  return 'granted';
end;
$fn$;

-- Service role only. An authenticated user must never reach a function that
-- takes a tier as an argument.
revoke all on function public.set_access_tier(text, access_tier, text) from public;
revoke all on function public.set_access_tier(text, access_tier, text) from authenticated;
revoke all on function public.set_access_tier(text, access_tier, text) from anon;
