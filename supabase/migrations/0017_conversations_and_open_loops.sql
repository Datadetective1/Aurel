-- =============================================================================
-- CONVERSATIONS, OPEN LOOPS, DECISIONS, FACES
--
-- Extends what is already here rather than building beside it:
--
--   * `interactions` becomes the Conversation object. It has carried a
--     transcript column since 0002 and every debrief already writes one row.
--     What it lacked was where the words came from, whether extraction has
--     run, and a home for the topics and the review moment.
--
--   * `commitments` becomes the Open Loop. A loop is a commitment, an
--     unanswered question or a promised follow-up; the states gain Later and
--     Cancelled; and everything a model extracts now arrives as `proposed`
--     until a person confirms it -- the same gate observations have always
--     had. Rows that exist today were written by the user or by a debrief the
--     user submitted, so they backfill as confirmed.
--
--   * `decisions` is new. "What did we decide" was answerable only by reading
--     a debrief artifact's JSON, which nothing rendered.
--
--   * Avatars get a private storage bucket. `people.avatar_url` has existed
--     since 0002 and nothing could set it.
-- =============================================================================

-- --- enums ---------------------------------------------------------------------

create type conversation_source as enum (
  'typed_notes',
  'voice_note',
  'uploaded_audio',
  'pasted_transcript',
  'uploaded_transcript',
  'meeting_recording',
  'imported'
);

create type conversation_processing_status as enum ('pending', 'processing', 'ready', 'failed');

create type review_status as enum ('proposed', 'confirmed', 'rejected');

create type loop_kind as enum ('commitment', 'question', 'follow_up');

-- New loop states. `dropped` stays for rows that already carry it and is read
-- as Cancelled by the application; nothing new is written with it.
alter type commitment_status add value if not exists 'later';
alter type commitment_status add value if not exists 'cancelled';

-- --- interactions -> conversations -----------------------------------------------

alter table public.interactions
  add column if not exists source_kind conversation_source not null default 'typed_notes',
  add column if not exists processing_status conversation_processing_status not null default 'ready',
  -- Length of the audio or the meeting, when known. Never derived from text.
  add column if not exists duration_seconds integer,
  add column if not exists topics text[] not null default '{}',
  -- When the user finished reviewing what was extracted. Null means the
  -- review panel still shows.
  add column if not exists reviewed_at timestamptz,
  -- The generation that produced the summary and proposals, so "why does it
  -- think that" is answerable from the row.
  add column if not exists artifact_id uuid references public.ai_artifacts(id) on delete set null,
  -- The user affirmed that the people in a recording knew it was being
  -- recorded. Stored so the product can say what was asked, not to police it.
  add column if not exists consent_confirmed boolean not null default false,
  -- Where the extraction failed, one short reason the page can show.
  add column if not exists processing_error text;

create index if not exists interactions_user_status_idx
  on public.interactions (user_id, processing_status, occurred_at desc);

alter table public.interactions
  add constraint interactions_duration_sane
  check (duration_seconds is null or duration_seconds between 0 and 86400);

-- --- commitments -> open loops ---------------------------------------------------

alter table public.commitments
  add column if not exists kind loop_kind not null default 'commitment',
  -- Existing rows were written by the user or by a debrief the user submitted.
  -- The default keeps them visible; new extractions override it to 'proposed'.
  add column if not exists review_status review_status not null default 'confirmed',
  -- Model confidence that this is a real commitment rather than discussion.
  -- 0 to 1. Null for rows the user wrote themselves.
  add column if not exists confidence numeric(3,2),
  -- The words that support it. A loop with no excerpt was typed, not extracted.
  add column if not exists excerpt text,
  -- Set by "Later". The loop leaves Today until this date.
  add column if not exists deferred_until date,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.commitments
  add constraint commitments_confidence_range
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add constraint commitments_excerpt_len
  check (excerpt is null or char_length(excerpt) <= 600);

create index if not exists commitments_user_review_idx
  on public.commitments (user_id, review_status, status, due_on nulls last);
create index if not exists commitments_interaction_idx
  on public.commitments (interaction_id);

-- --- decisions -------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visibility record_visibility not null default 'private',

  description text not null,
  -- Why, when the conversation said why. Never inferred.
  context text,
  decided_on date not null default current_date,

  interaction_id uuid references public.interactions(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,

  review_status review_status not null default 'proposed',
  confidence numeric(3,2),
  excerpt text,
  reviewed_at timestamptz,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint decisions_description_len check (char_length(description) between 1 and 500),
  constraint decisions_context_len check (context is null or char_length(context) <= 1000),
  constraint decisions_excerpt_len check (excerpt is null or char_length(excerpt) <= 600),
  constraint decisions_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);
create index decisions_user_idx on public.decisions (user_id, review_status, decided_on desc);
create index decisions_interaction_idx on public.decisions (interaction_id);
create index decisions_workspace_idx on public.decisions (workspace_id, visibility);
create trigger decisions_touch before update on public.decisions
  for each row execute function public.touch_updated_at();

-- Who a decision concerns. Many-to-many, because "what did we decide with
-- Ravi" has to work when Ravi was one of four people in the room.
create table public.decision_people (
  decision_id uuid not null references public.decisions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visibility record_visibility not null default 'private',
  created_at timestamptz not null default now(),
  primary key (decision_id, person_id)
);
create index decision_people_person_idx on public.decision_people (person_id);
create index decision_people_user_idx on public.decision_people (user_id);
create index decision_people_workspace_idx on public.decision_people (workspace_id, visibility);

-- Same policy shape as every other domain table (see 0007).
do $rls$
declare t text;
begin
  foreach t in array array['decisions', 'decision_people']
  loop
    execute format('alter table public.%I enable row level security', t);
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
end
$rls$;

-- Artifact citations can point at a decision, like they point at a commitment.
alter table public.artifact_sources
  add column if not exists decision_id uuid references public.decisions(id) on delete set null;

-- --- faces -------------------------------------------------------------------------

-- A path inside the private `avatars` bucket. Kept separate from avatar_url,
-- which remains for an external image the user pasted. The application signs
-- the path at render time; the URL is never stored because it expires.
alter table public.people add column if not exists avatar_path text;
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Each user owns the folder named by their id and nothing else. Read is also
-- owner-only: photos of colleagues are relationship data, not public assets.
create policy "avatars: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: insert own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- --- search ------------------------------------------------------------------------

-- Decisions join the palette and Ask. Interactions were already searchable;
-- the application now routes them to the conversation page.
create or replace function public.search_everything(q text, max_results integer default 20)
returns table (
  entity text,
  id uuid,
  title text,
  subtitle text,
  person_id uuid,
  occurred_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  with needle as (select nullif(trim(q), '') as v)
  select r.entity, r.id, r.title, r.subtitle, r.person_id, r.occurred_at, r.rank
  from (
    select 'person'::text as entity, p.id as id, p.full_name as title,
           (coalesce(p.job_title, '') || case when o.name is not null then ' - ' || o.name else '' end) as subtitle,
           p.id as person_id, p.last_interaction_at as occurred_at,
           (similarity(p.full_name, (select v from needle)) + 0.35)::real as rank
      from public.people p
      left join public.organizations o on o.id = p.organization_id
     where p.archived_at is null
       and (p.full_name ilike '%' || (select v from needle) || '%'
            or p.job_title ilike '%' || (select v from needle) || '%')

    union all
    select 'organization', o.id, o.name, coalesce(o.domain, ''), null::uuid, null::timestamptz,
           (similarity(o.name, (select v from needle)) + 0.2)::real
      from public.organizations o
     where o.name ilike '%' || (select v from needle) || '%'

    union all
    select 'meeting', m.id, m.title, coalesce(m.objective, ''), null::uuid, m.scheduled_at,
           (similarity(m.title, (select v from needle)) + 0.25)::real
      from public.meetings m
     where m.title ilike '%' || (select v from needle) || '%'
        or m.objective ilike '%' || (select v from needle) || '%'

    union all
    select 'interaction', i.id, i.title, coalesce(i.summary, ''), null::uuid, i.occurred_at,
           (similarity(i.title, (select v from needle)) + 0.15)::real
      from public.interactions i
     where i.title ilike '%' || (select v from needle) || '%'
        or i.summary ilike '%' || (select v from needle) || '%'
        or i.transcript ilike '%' || (select v from needle) || '%'
        or i.raw_notes ilike '%' || (select v from needle) || '%'

    union all
    select 'commitment', c.id, c.description, c.status::text, c.person_id, c.due_on::timestamptz,
           (similarity(c.description, (select v from needle)) + 0.1)::real
      from public.commitments c
     where c.review_status = 'confirmed'
       and c.description ilike '%' || (select v from needle) || '%'

    union all
    select 'decision', d.id, d.description, coalesce(d.context, ''), null::uuid, d.decided_on::timestamptz,
           (similarity(d.description, (select v from needle)) + 0.1)::real
      from public.decisions d
     where d.review_status = 'confirmed'
       and (d.description ilike '%' || (select v from needle) || '%'
            or d.context ilike '%' || (select v from needle) || '%')

    union all
    select 'note', n.id, left(n.body, 120), ''::text, n.person_id, n.created_at,
           similarity(left(n.body, 200), (select v from needle))::real
      from public.notes n
     where n.body ilike '%' || (select v from needle) || '%'

    union all
    select 'observation', ob.id, ob.content, ob.evidence_level::text, ob.person_id, ob.last_reinforced_at,
           similarity(ob.content, (select v from needle))::real
      from public.observations ob
     where ob.status = 'active'
       and ob.content ilike '%' || (select v from needle) || '%'
  ) r
  where (select v from needle) is not null
  order by r.rank desc nulls last, r.occurred_at desc nulls last
  limit greatest(1, least(coalesce(max_results, 20), 50));
$fn$;

-- The pulse counts only loops the user has confirmed. A proposal the user has
-- not looked at yet is not an overdue promise.
create or replace function public.relationship_pulse(target_person uuid)
returns table (
  score integer,
  days_since_contact integer,
  open_commitments integer,
  overdue_commitments integer,
  interaction_count integer,
  has_upcoming boolean
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with stats as (
    select
      (select extract(day from now() - p.last_interaction_at)::integer
         from public.people p where p.id = target_person) as days_since,
      (select count(*)::integer from public.commitments c
        where c.person_id = target_person and c.status = 'open' and c.review_status = 'confirmed') as open_c,
      (select count(*)::integer from public.commitments c
        where c.person_id = target_person and c.status = 'open' and c.review_status = 'confirmed'
          and c.due_on is not null and c.due_on < current_date) as overdue_c,
      (select count(*)::integer from public.interaction_participants ip
        where ip.person_id = target_person) as inter_count,
      (select exists (
        select 1 from public.meeting_attendees ma
        join public.meetings m on m.id = ma.meeting_id
        where ma.person_id = target_person and m.status = 'upcoming'
          and (m.scheduled_at is null or m.scheduled_at >= now())
      )) as upcoming
  )
  select
    greatest(0, least(100,
      70
      - least(40, coalesce(stats.days_since, 90) / 3)
      - (stats.overdue_c * 12)
      - (greatest(0, stats.open_c - 2) * 4)
      + least(20, stats.inter_count * 4)
      + (case when stats.upcoming then 10 else 0 end)
    ))::integer,
    coalesce(stats.days_since, -1),
    stats.open_c,
    stats.overdue_c,
    stats.inter_count,
    stats.upcoming
  from stats;
$fn$;

-- --- demo and deletion keep up ---------------------------------------------------------

create or replace function public.clear_demo_data()
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

  delete from public.decisions where user_id = uid and is_demo;
  delete from public.observations where user_id = uid and is_demo;
  delete from public.commitments where user_id = uid and is_demo;
  delete from public.notes where user_id = uid and is_demo;
  delete from public.interactions where user_id = uid and is_demo;
  delete from public.meetings where user_id = uid and is_demo;
  delete from public.ai_artifacts where user_id = uid and is_demo;
  delete from public.people where user_id = uid and is_demo;
  delete from public.organizations where user_id = uid and is_demo;
  delete from public.topics where user_id = uid and is_demo;

  update public.profiles set demo_seeded_at = null where id = uid;
end;
$fn$;

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
  delete from public.usage_events where user_id = uid;
  delete from public.analytics_events where user_id = uid;
  -- Photos are removed by the deletion action through the Storage API:
  -- storage.objects refuses direct SQL deletes (storage.protect_delete). See
  -- 0018, which is where this was discovered and corrected.
  delete from public.profiles where id = uid;
end;
$fn$;
