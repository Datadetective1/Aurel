-- =============================================================================
-- FOLLOW-THROUGH
--
-- "It remembers the things you say you'll do" becomes "and brings them back
-- when they matter": one short daily email of confirmed open loops that are
-- due, overdue, or about to be. Two profile preferences and one delivery
-- ledger, which is what makes a scheduled job unable to send the same day
-- twice.
-- =============================================================================

alter table public.profiles
  -- On by default, like the existing email_notifications it sits under. Both
  -- must be true for a digest to go out; turning off "useful email" turns
  -- this off with it.
  add column if not exists follow_through_email boolean not null default true,
  -- Hour of the user's own day, 0-23. Honoured when the schedule runs hourly;
  -- a once-a-day schedule sends when it runs, and the setting says so.
  add column if not exists follow_through_hour smallint not null default 8;

alter table public.profiles
  add constraint profiles_follow_through_hour_range
  check (follow_through_hour between 0 and 23);

-- One row per user per local day for the scheduled send. The unique index is
-- the idempotency: two overlapping runs cannot both reserve the same day, and
-- a run that is retried finds its own row. Manual sends ("send it to me now")
-- are recorded too but do not consume the day.
create table public.follow_through_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The user's own calendar day, as YYYY-MM-DD, so a run at 13:00 UTC and a
  -- run at 23:00 UTC agree on which day they served.
  local_date date not null,
  trigger text not null default 'scheduled' check (trigger in ('scheduled', 'manual')),
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'skipped', 'failed')),
  loop_count integer not null default 0,
  -- The provider's message id, or a reason when not sent. Never content.
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index follow_through_deliveries_daily_unique
  on public.follow_through_deliveries (user_id, local_date)
  where trigger = 'scheduled';
create index follow_through_deliveries_user_idx
  on public.follow_through_deliveries (user_id, created_at desc);

-- Readable by the owner (Settings can say "last sent Tuesday"); written only by
-- the service role from the scheduled job, and by the owner's own session for
-- a manual send.
alter table public.follow_through_deliveries enable row level security;
create policy "follow_through_deliveries: read own" on public.follow_through_deliveries
  for select using (user_id = (select auth.uid()));
create policy "follow_through_deliveries: insert own manual" on public.follow_through_deliveries
  for insert with check (user_id = (select auth.uid()) and trigger = 'manual');
create policy "follow_through_deliveries: update own manual" on public.follow_through_deliveries
  for update using (user_id = (select auth.uid()) and trigger = 'manual')
  with check (user_id = (select auth.uid()) and trigger = 'manual');
-- Deleting the account must be able to take the ledger with it.
create policy "follow_through_deliveries: delete own" on public.follow_through_deliveries
  for delete using (user_id = (select auth.uid()));

-- delete_my_data keeps up.
create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.artifact_sources where user_id = uid;
  delete from public.ai_feedback where user_id = uid;
  delete from public.decision_people where user_id = uid;
  delete from public.decisions where user_id = uid;
  delete from public.observation_sources where user_id = uid;
  delete from public.observations where user_id = uid;
  delete from public.commitments where user_id = uid;
  delete from public.notes where user_id = uid;
  delete from public.interaction_participants where user_id = uid;
  delete from public.interactions where user_id = uid;
  delete from public.ai_artifacts where user_id = uid;
  delete from public.meeting_attendees where user_id = uid;
  delete from public.external_calendar_events where user_id = uid;
  delete from public.meetings where user_id = uid;
  delete from public.person_topics where user_id = uid;
  delete from public.topics where user_id = uid;
  delete from public.people where user_id = uid;
  delete from public.organizations where user_id = uid;
  delete from public.integration_accounts where user_id = uid;
  delete from public.assessment_responses where user_id = uid;
  delete from public.assessments where user_id = uid;
  delete from public.daily_reflections where user_id = uid;
  delete from public.weekly_reflections where user_id = uid;
  delete from public.follow_through_deliveries where user_id = uid;
  delete from public.usage_events where user_id = uid;
  delete from public.analytics_events where user_id = uid;
  delete from public.profiles where id = uid;
end;
$fn$;
