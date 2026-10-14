-- =============================================================================
-- 0023: PILOT INVITATION RPC PRIVILEGES
--
-- ROOT CAUSE. Supabase's default privileges for schema `public` grant EXECUTE
-- on every new function directly to `anon`, `authenticated` and
-- `service_role`. Migrations 0015 and 0015b ran `revoke ... from public`,
-- which removes the PUBLIC pseudo-role's grant but not those direct role
-- grants. So both SECURITY DEFINER invitation functions stayed executable by
-- `anon` -- each still refused an anonymous caller in its own body (auth.uid()
-- is null), but an elevated function reachable without signing in is one
-- missed check away from a hole.
--
-- THE FIX follows the pattern 0010 already set for privileged helpers:
--
--   private.create_pilot_invitation / private.redeem_pilot_invitation
--     The SECURITY DEFINER bodies, copied verbatim from production. The
--     `private` schema is not exposed by the API, and `anon` has no usage on
--     it. EXECUTE: `authenticated` only.
--
--   public.create_pilot_invitation / public.redeem_pilot_invitation
--     Same names, same signatures, same return types -- so the server actions'
--     `supabase.rpc(...)` calls are unchanged -- now SECURITY INVOKER one-line
--     wrappers. EXECUTE: `authenticated` only. Not `anon`, not `service_role`
--     (no server path uses it, and auth.uid() is null under it anyway).
--
-- Behaviour is unchanged: both bodies still take the caller from auth.uid(),
-- creation still requires an active owner grant, redemption still binds to
-- the caller and accepts no recipient argument, and codes remain hashes.
--
-- No table, row, policy or other function is touched.
-- =============================================================================

-- --- the privileged bodies, out of the API schema --------------------------

create or replace function private.create_pilot_invitation(
  code_hash_input text,
  label_input text,
  max_redemptions_input integer,
  expires_at_input timestamptz,
  created_by_input uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  caller uuid := (select auth.uid());
  new_id uuid;
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;

  -- The caller must be an owner, whatever they passed as created_by.
  if not exists (
    select 1 from public.access_grants g
     where g.user_id = caller
       and g.revoked_at is null
       and g.tier = 'owner'
  ) then
    raise exception 'not_permitted';
  end if;

  insert into public.pilot_invitations
    (code_hash, label, max_redemptions, expires_at, created_by)
  values
    (code_hash_input, label_input, greatest(coalesce(max_redemptions_input, 1), 1),
     expires_at_input, caller)
  returning id into new_id;

  return new_id;
end;
$function$;

create or replace function private.redeem_pilot_invitation(code_hash_input text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  invitation public.pilot_invitations%rowtype;
  caller uuid := (select auth.uid());
  inserted integer;
begin
  if caller is null then
    return 'unauthenticated';
  end if;

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
$function$;

revoke all on function private.create_pilot_invitation(text, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.redeem_pilot_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_pilot_invitation(text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function private.redeem_pilot_invitation(text)
  to authenticated;

-- --- the API entry points: same contract, no elevated privilege -------------

create or replace function public.create_pilot_invitation(
  code_hash_input text,
  label_input text,
  max_redemptions_input integer,
  expires_at_input timestamptz,
  created_by_input uuid
)
returns uuid
language sql
security invoker
set search_path = public
as $function$
  select private.create_pilot_invitation(
    code_hash_input, label_input, max_redemptions_input, expires_at_input, created_by_input
  );
$function$;

create or replace function public.redeem_pilot_invitation(code_hash_input text)
returns text
language sql
security invoker
set search_path = public
as $function$
  select private.redeem_pilot_invitation(code_hash_input);
$function$;

-- CREATE OR REPLACE keeps the existing ACL, which includes the direct anon
-- and service_role grants this migration exists to remove.
revoke all on function public.create_pilot_invitation(text, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.redeem_pilot_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_pilot_invitation(text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.redeem_pilot_invitation(text)
  to authenticated;
