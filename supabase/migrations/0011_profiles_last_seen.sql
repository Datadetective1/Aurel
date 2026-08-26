-- Retention measurement for the pilot.
--
-- Additive and nullable: no existing row changes meaning, and nothing reads it
-- except the session-boundary check that writes it. It records when the account
-- was last active, not what it did -- the analytics_events table already carries
-- behaviour, and duplicating it here would be storing the same thing twice.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Last time this account loaded a signed-in page. Written at most once every 30 minutes; a gap larger than the session window emits a return_session analytics event. Retention only -- never user content.';
