-- =============================================================================
-- AUREL 0001 - FOUNDATION
-- Extensions, shared enums, updated_at plumbing, profiles and the Interaction
-- Profile assessment tables.
--
-- RLS CONVENTION: every user-owned table carries a `user_id` column directly,
-- including child tables that could in principle be reached through a join.
-- The denormalisation is deliberate: it keeps every policy a single indexed
-- equality check against auth.uid(), with no recursive policy evaluation and no
-- way for a missing join predicate to widen access.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- --- shared enums ------------------------------------------------------------

create type evidence_level as enum ('confirmed', 'observed', 'inferred', 'unknown');
create type observation_status as enum ('proposed', 'active', 'dismissed');
create type observation_source_kind as enum ('user', 'debrief', 'interaction', 'ai_inference', 'import');
create type observation_category as enum (
  'communication', 'decision', 'trust', 'friction', 'priority', 'preference', 'context', 'other'
);

create type relationship_type as enum (
  'manager', 'report', 'skip_level', 'peer', 'cross_functional', 'customer', 'prospect',
  'vendor', 'partner', 'candidate', 'mentor', 'external', 'other'
);

create type meeting_status as enum ('upcoming', 'completed', 'cancelled');
create type meeting_kind as enum (
  'one_on_one', 'executive_review', 'project_review', 'customer_meeting', 'sales_conversation',
  'negotiation', 'difficult_conversation', 'feedback_conversation', 'performance_conversation',
  'interview', 'networking', 'presentation', 'vendor_discussion', 'team_meeting', 'other'
);
create type attendee_role as enum ('decision_maker', 'influencer', 'contributor', 'informed', 'presenter', 'other');

create type interaction_kind as enum ('meeting', 'call', 'email', 'message', 'informal', 'other');
create type commitment_owner as enum ('user', 'person', 'shared');
create type commitment_status as enum ('open', 'done', 'dropped');

create type coaching_style as enum ('concise', 'balanced', 'detailed', 'challenging', 'supportive');
create type theme_preference as enum ('pearl', 'obsidian', 'system');
create type calibration_rating as enum ('very_accurate', 'mostly_accurate', 'partly_accurate', 'not_accurate');
create type assessment_status as enum ('in_progress', 'completed', 'abandoned');

create type plan_tier as enum ('free', 'pro', 'team');

-- --- updated_at --------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- =============================================================================
-- PROFILES
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  full_name text,
  preferred_name text,
  avatar_url text,
  job_title text,
  company text,
  job_function text,
  seniority text,
  timezone text not null default 'UTC',
  pronouns text,

  onboarding_stage text not null default 'welcome',
  onboarding_completed_at timestamptz,

  intents text[] not null default '{}',
  known_frameworks jsonb not null default '{}'::jsonb,
  coaching_context text[] not null default '{}',

  theme theme_preference not null default 'system',
  coaching_style coaching_style not null default 'balanced',
  email_notifications boolean not null default true,

  demo_seeded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_full_name_len check (full_name is null or char_length(full_name) <= 120),
  constraint profiles_company_len check (company is null or char_length(company) <= 160)
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row automatically on signup so the app never has to guess
-- whether it exists. SECURITY DEFINER because it runs before the user has a session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- INTERACTION PROFILE (assessment)
-- =============================================================================

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Instrument version. Scores are only comparable within a version.
  instrument_version text not null,
  status assessment_status not null default 'in_progress',

  -- dimension slug -> 0..100
  scores jsonb not null default '{}'::jsonb,
  archetype text,
  narrative jsonb,

  -- Legitimate confidence signals, not model certainty.
  coverage numeric(4,3),
  consistency numeric(4,3),

  calibration calibration_rating,
  calibration_note text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessments_coverage_range check (coverage is null or (coverage >= 0 and coverage <= 1)),
  constraint assessments_consistency_range check (consistency is null or (consistency >= 0 and consistency <= 1))
);

create index assessments_user_idx on public.assessments (user_id, created_at desc);
create index assessments_user_status_idx on public.assessments (user_id, status);

create trigger assessments_touch before update on public.assessments
  for each row execute function public.touch_updated_at();

create table public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  round_index integer not null,
  block_id text not null,
  most_item_id text not null,
  least_item_id text not null,
  latency_ms integer,

  created_at timestamptz not null default now(),

  unique (assessment_id, round_index),
  constraint responses_distinct_choices check (most_item_id <> least_item_id),
  constraint responses_round_nonneg check (round_index >= 0)
);

create index assessment_responses_assessment_idx on public.assessment_responses (assessment_id, round_index);
create index assessment_responses_user_idx on public.assessment_responses (user_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_responses enable row level security;

create policy "profiles: read own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles
  for delete using ((select auth.uid()) = id);

create policy "assessments: read own" on public.assessments
  for select using ((select auth.uid()) = user_id);
create policy "assessments: insert own" on public.assessments
  for insert with check ((select auth.uid()) = user_id);
create policy "assessments: update own" on public.assessments
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "assessments: delete own" on public.assessments
  for delete using ((select auth.uid()) = user_id);

create policy "assessment_responses: read own" on public.assessment_responses
  for select using ((select auth.uid()) = user_id);
create policy "assessment_responses: insert own" on public.assessment_responses
  for insert with check ((select auth.uid()) = user_id);
create policy "assessment_responses: update own" on public.assessment_responses
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "assessment_responses: delete own" on public.assessment_responses
  for delete using ((select auth.uid()) = user_id);
