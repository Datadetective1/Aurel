-- =============================================================================
-- DRIFT REPAIR. Applied to production on 28 Aug 2026 as the Supabase migration
-- "profile_prompt_snooze" (version 20260828000043), between 0015 and 0016, but
-- never committed to this directory. Recovered verbatim from
-- supabase_migrations.schema_migrations on 10 Sep 2026.
--
-- Idempotent: `add column if not exists`. Applying it to production again
-- changes nothing.
-- =============================================================================

-- When the user last dismissed a progressive profile question.
--
-- A snooze rather than a permanent opt-out: dismissing means "not now", and
-- treating it as "never" would quietly strand every profile at six rounds.
-- Nothing enforces the window in the database; the reader decides.
alter table public.profiles
  add column if not exists profile_prompt_snoozed_until timestamptz;
