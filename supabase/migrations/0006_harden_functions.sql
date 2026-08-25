-- Hardening pass in response to the database linter.

-- 1. Pin the search_path on the shared trigger function. Without this, a role
--    with a mutable search_path could shadow `now()` and influence the value
--    written by the trigger.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- 2. The signup trigger functions are SECURITY DEFINER by necessity (they run
--    before the user has a session). They are trigger functions and are never
--    meant to be reachable over PostgREST, so remove the RPC surface entirely.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_user_subscription() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;