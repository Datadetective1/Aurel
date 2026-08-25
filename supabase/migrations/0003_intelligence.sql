-- AI artifacts and their evidence trail, feedback, reflections.
-- Every generation is recorded with provider, model and prompt version so output
-- can be attributed, compared across versions, and audited later.

create type artifact_kind as enum (
  'meeting_brief', 'quick_brief', 'debrief', 'relationship_summary', 'message_adaptation',
  'daily_focus', 'weekly_reflection', 'coach_message', 'memory_proposal', 'profile_narrative'
);
create type artifact_subject as enum ('person', 'meeting', 'interaction', 'user', 'none');
create type feedback_rating as enum ('yes', 'partly', 'no');

create table public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  kind artifact_kind not null,
  subject_kind artifact_subject not null default 'none',
  subject_id uuid,

  -- Structured output, validated against a Zod schema before insert.
  content jsonb not null,

  -- Provenance
  prompt_version text not null,
  provider text not null,
  model text not null,
  -- True when produced by the deterministic evidence-composition fallback rather
  -- than a language model. Surfaced in the UI so output is never over-claimed.
  grounded_fallback boolean not null default false,
  latency_ms integer,
  token_usage jsonb,

  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_artifacts_user_kind_idx on public.ai_artifacts (user_id, kind, created_at desc);
create index ai_artifacts_subject_idx on public.ai_artifacts (user_id, subject_kind, subject_id, created_at desc);

alter table public.observations
  add constraint observations_origin_artifact_fk foreign key (origin_artifact_id)
  references public.ai_artifacts(id) on delete set null;

-- The citations behind a generation. This is what "why is Aurel recommending
-- this" renders from - it is never reconstructed after the fact.
create table public.artifact_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.ai_artifacts(id) on delete cascade,

  observation_id uuid references public.observations(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  commitment_id uuid references public.commitments(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,

  label text not null,
  evidence_level evidence_level not null default 'inferred',
  created_at timestamptz not null default now(),
  constraint artifact_sources_label_len check (char_length(label) between 1 and 400)
);
create index artifact_sources_artifact_idx on public.artifact_sources (artifact_id);
create index artifact_sources_user_idx on public.artifact_sources (user_id);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.ai_artifacts(id) on delete cascade,
  rating feedback_rating not null,
  note text,
  created_at timestamptz not null default now(),
  unique (artifact_id, user_id),
  constraint ai_feedback_note_len check (note is null or char_length(note) <= 1000)
);
create index ai_feedback_user_idx on public.ai_feedback (user_id, created_at desc);

create table public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reflection_date date not null,
  responses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reflection_date)
);
create index daily_reflections_user_idx on public.daily_reflections (user_id, reflection_date desc);
create trigger daily_reflections_touch before update on public.daily_reflections
  for each row execute function public.touch_updated_at();

create table public.weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  artifact_id uuid references public.ai_artifacts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index weekly_reflections_user_idx on public.weekly_reflections (user_id, week_start desc);

do $rls$
declare t text;
begin
  foreach t in array array[
    'ai_artifacts','artifact_sources','ai_feedback','daily_reflections','weekly_reflections'
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