-- Organizations, people, topics, observations (the evidence model), interactions,
-- meetings, commitments and notes. Every table carries user_id for flat RLS.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  domain text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_len check (char_length(name) between 1 and 160)
);
create index organizations_user_idx on public.organizations (user_id, name);
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,

  full_name text not null,
  preferred_name text,
  job_title text,
  email text,
  pronouns text,
  timezone text,
  avatar_url text,

  relationship_type relationship_type not null default 'peer',
  -- How much this relationship matters to the user, 1 (low) to 5 (critical).
  -- User-declared only: Aurel never silently scores people.
  relevance smallint not null default 3,

  notes text,
  first_interaction_at timestamptz,
  last_interaction_at timestamptz,

  is_demo boolean not null default false,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint people_full_name_len check (char_length(full_name) between 1 and 160),
  constraint people_relevance_range check (relevance between 1 and 5)
);
create index people_user_idx on public.people (user_id, full_name);
create index people_user_last_interaction_idx on public.people (user_id, last_interaction_at desc nulls last);
create index people_user_org_idx on public.people (user_id, organization_id);
create index people_user_active_idx on public.people (user_id) where archived_at is null;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, label),
  constraint topics_label_len check (char_length(label) between 1 and 80)
);
create index topics_user_idx on public.topics (user_id, label);

create table public.person_topics (
  person_id uuid not null references public.people(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, topic_id)
);
create index person_topics_user_idx on public.person_topics (user_id);
create index person_topics_topic_idx on public.person_topics (topic_id);

-- =============================================================================
-- INTERACTIONS - things that actually happened
-- =============================================================================

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid,

  kind interaction_kind not null default 'meeting',
  title text not null,
  occurred_at timestamptz not null default now(),

  summary text,
  raw_notes text,
  transcript text,
  outcome text,
  -- User's own read on how it went, 1 (poorly) to 5 (very well). Optional.
  went_well smallint,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interactions_title_len check (char_length(title) between 1 and 200),
  constraint interactions_went_well_range check (went_well is null or went_well between 1 and 5)
);
create index interactions_user_time_idx on public.interactions (user_id, occurred_at desc);
create trigger interactions_touch before update on public.interactions
  for each row execute function public.touch_updated_at();

create table public.interaction_participants (
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (interaction_id, person_id)
);
create index interaction_participants_person_idx on public.interaction_participants (person_id);
create index interaction_participants_user_idx on public.interaction_participants (user_id);

-- =============================================================================
-- MEETINGS - planned interactions the user prepares for
-- =============================================================================

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  scheduled_at timestamptz,
  duration_minutes integer,
  kind meeting_kind not null default 'other',
  status meeting_status not null default 'upcoming',

  objective text,
  stakes text,
  extra_context text,
  -- User-declared importance, 1 to 5. Drives Today ordering, transparently.
  importance smallint not null default 3,

  external_provider text,
  external_event_id text,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meetings_title_len check (char_length(title) between 1 and 200),
  constraint meetings_importance_range check (importance between 1 and 5),
  constraint meetings_duration_sane check (duration_minutes is null or duration_minutes between 1 and 1440)
);
create index meetings_user_time_idx on public.meetings (user_id, scheduled_at);
create index meetings_user_status_idx on public.meetings (user_id, status, scheduled_at);
create unique index meetings_external_unique on public.meetings (user_id, external_provider, external_event_id)
  where external_event_id is not null;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

alter table public.interactions
  add constraint interactions_meeting_fk foreign key (meeting_id)
  references public.meetings(id) on delete set null;
create index interactions_meeting_idx on public.interactions (meeting_id);

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role attendee_role not null default 'contributor',
  created_at timestamptz not null default now(),
  primary key (meeting_id, person_id)
);
create index meeting_attendees_person_idx on public.meeting_attendees (person_id);
create index meeting_attendees_user_idx on public.meeting_attendees (user_id);

-- =============================================================================
-- OBSERVATIONS - the evidence model
-- Nothing here is presented as fact unless evidence_level says so, and nothing
-- AI-proposed becomes visible truth until the user promotes it to 'active'.
-- =============================================================================

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,

  content text not null,
  category observation_category not null default 'other',
  evidence_level evidence_level not null default 'inferred',
  status observation_status not null default 'proposed',
  source_kind observation_source_kind not null default 'user',

  -- Set only when this row was proposed by a generation, for traceability.
  origin_artifact_id uuid,

  -- How many independent interactions have reinforced this. Drives promotion
  -- from inferred to observed, and is shown to the user as the reason.
  reinforcement_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_reinforced_at timestamptz not null default now(),

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint observations_content_len check (char_length(content) between 1 and 1000),
  constraint observations_reinforcement_positive check (reinforcement_count >= 1)
);
create index observations_person_idx on public.observations (person_id, status, evidence_level);
create index observations_user_idx on public.observations (user_id, status);
create index observations_user_proposed_idx on public.observations (user_id, created_at desc) where status = 'proposed';
create trigger observations_touch before update on public.observations
  for each row execute function public.touch_updated_at();

-- What an observation is actually based on. An observation with no sources can
-- never be shown above 'inferred'.
create table public.observation_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null references public.observations(id) on delete cascade,
  interaction_id uuid references public.interactions(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  excerpt text,
  created_at timestamptz not null default now(),
  constraint observation_sources_excerpt_len check (excerpt is null or char_length(excerpt) <= 600)
);
create index observation_sources_observation_idx on public.observation_sources (observation_id);
create index observation_sources_user_idx on public.observation_sources (user_id);

-- =============================================================================
-- COMMITMENTS AND NOTES
-- =============================================================================

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  description text not null,
  owner commitment_owner not null default 'user',
  owner_person_id uuid references public.people(id) on delete set null,
  person_id uuid references public.people(id) on delete cascade,
  interaction_id uuid references public.interactions(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete set null,

  due_on date,
  status commitment_status not null default 'open',
  completed_at timestamptz,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commitments_description_len check (char_length(description) between 1 and 500)
);
create index commitments_user_open_idx on public.commitments (user_id, status, due_on nulls last);
create index commitments_person_idx on public.commitments (person_id, status);
create trigger commitments_touch before update on public.commitments
  for each row execute function public.touch_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  interaction_id uuid references public.interactions(id) on delete cascade,
  body text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_body_len check (char_length(body) between 1 and 8000)
);
create index notes_user_idx on public.notes (user_id, created_at desc);
create index notes_person_idx on public.notes (person_id, created_at desc);
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- Applied uniformly: a user may read and write exactly their own rows.
-- =============================================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'organizations','people','topics','person_topics','interactions','interaction_participants',
    'meetings','meeting_attendees','observations','observation_sources','commitments','notes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: read own" on public.%I for select using ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: update own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete using ((select auth.uid()) = user_id)', t, t);
  end loop;
end
$rls$;