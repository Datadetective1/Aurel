-- =============================================================================
-- DRIFT REPAIR. Applied to production on 27 Aug 2026 as the Supabase migration
-- "create_pilot_invitation" (version 20260827143506), between 0015 and 0016,
-- but never committed to this directory. Recovered verbatim from
-- supabase_migrations.schema_migrations on 10 Sep 2026 so a fresh database
-- built from this folder matches production.
--
-- Idempotent: `create or replace`, and the grants are repeatable. Applying it
-- to production again changes nothing.
-- =============================================================================

-- Issue an invitation. Re-checks owner status inside the function rather than
-- trusting the caller: the server action's check is the gate, this is the
-- backstop, and it is what makes granting EXECUTE to authenticated safe.
create or replace function public.create_pilot_invitation(
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
as $fn$
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
$fn$;

revoke all on function public.create_pilot_invitation(text, text, integer, timestamptz, uuid) from public;
grant execute on function public.create_pilot_invitation(text, text, integer, timestamptz, uuid) to authenticated;
