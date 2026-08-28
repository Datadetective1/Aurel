-- Responses to the scenario instrument (v2).
--
-- Its own table rather than reusing assessment_responses. That table stores a
-- forced-choice ranking: a block, a MOST item and a LEAST item. A scenario
-- answer is one option out of three, one of which carries no direction at all.
-- Squeezing the second shape into the first -- writing the same option id into
-- both most and least, say -- would make every historical row ambiguous and
-- every future query a guess about which instrument produced it.
--
-- assessments.instrument_version says which instrument an assessment belongs
-- to, so the two can coexist and a legacy profile stays readable as exactly
-- what it was.
create table public.scenario_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id text not null,
  option_id text not null,
  is_depends boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (assessment_id, scenario_id)
);

create index scenario_responses_user_idx on public.scenario_responses (user_id);

alter table public.scenario_responses enable row level security;

create policy "scenario_responses: read own" on public.scenario_responses
  for select using (user_id = (select auth.uid()));
create policy "scenario_responses: insert own" on public.scenario_responses
  for insert with check (user_id = (select auth.uid()));
create policy "scenario_responses: update own" on public.scenario_responses
  for update using (user_id = (select auth.uid()));
create policy "scenario_responses: delete own" on public.scenario_responses
  for delete using (user_id = (select auth.uid()));

alter table public.assessments
  add column if not exists directional_count integer;
