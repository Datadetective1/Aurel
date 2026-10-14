-- =============================================================================
-- 0024: ONE REDEMPTION PER USER PER INVITATION, PERMANENTLY
--
-- ROOT CAUSE. invitation_redemptions already holds the right fact: a row per
-- (invitation_id, user_id), unique, never deleted by the product. But
-- redeem_pilot_invitation treated a conflict on that row -- "this user has
-- redeemed this invitation before" -- as a reason to RE-GRANT pilot access.
-- So a pilot whose grant the owner had revoked could present the same
-- multi-use code again and be restored, without consuming capacity.
--
-- THE FIX. That branch now refuses ('already_redeemed') and writes nothing.
-- No schema change: the invariant
--
--     a given user redeems a given invitation at most once, ever
--
-- is the existing UNIQUE (invitation_id, user_id). Every other line of the
-- function is unchanged: the invitation stays usable by other users while it
-- has capacity, single-use codes behave as before, the owner's set_access_tier
-- path and newly issued invitations still restore access deliberately.
--
-- Function body only. No table, row, policy or grant is changed; the grants
-- are restated so this file is complete on its own.
-- =============================================================================

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
    -- This user already redeemed this invitation. The redemption row is
    -- permanent (unique on invitation_id, user_id), so a revoked grant is
    -- never restored by presenting the same code again. Nothing is written.
    return 'already_redeemed';
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

revoke all on function private.redeem_pilot_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function private.redeem_pilot_invitation(text)
  to authenticated;
