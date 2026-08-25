-- =============================================================================
-- V2: SOURCE INTELLIGENCE
-- The evidence graph:
--   SOURCE -> extraction -> IDENTITY RESOLUTION -> PROFESSIONAL FACT
--                                               -> OBSERVATION (proposed)
--                                               -> user confirmation -> MEMORY
--
-- Nothing Aurel claims about a person may exist without a row here to point at.
-- =============================================================================

create type source_type as enum (
  'public_web', 'user_url', 'user_note', 'user_pasted_text', 'document', 'pdf',
  'transcript', 'calendar', 'email', 'contact', 'crm', 'company_bio', 'conference',
  'article', 'podcast', 'video', 'github', 'social_public', 'licensed_enrichment', 'other'
);

create type source_access_status as enum (
  'analyzed', 'limited_access', 'login_required', 'paywall',
  'content_unavailable', 'identity_uncertain', 'unsupported', 'error', 'pending'
);

create type source_processing_status as enum ('pending', 'fetching', 'extracting', 'complete', 'failed');

-- Deliberately explicit about *not knowing*. `ambiguous` and `conflicting` are
-- first-class outcomes: silently merging two people with the same name is the
-- single worst failure this product could have.
create type identity_match_status as enum ('confirmed', 'probable', 'ambiguous', 'no_match', 'conflicting', 'unreviewed');

create type fact_kind as enum (
  'current_role', 'current_organization', 'prior_role', 'education', 'expertise',
  'theme', 'publication', 'appearance', 'location', 'communication_signal', 'other'
);

create type research_job_status as enum ('queued', 'running', 'complete', 'failed', 'cancelled', 'no_results');

-- =============================================================================
-- SOURCES
-- =============================================================================

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visibility record_visibility not null default 'private',

  source_type source_type not null default 'other',
  source_url text,
  source_title text,
  publisher text,
  author text,
  published_at timestamptz,
  retrieved_at timestamptz,

  -- Extracted plain text, NOT the raw page. Storing whole copyrighted pages
  -- indefinitely is both a legal and a storage problem; the extract plus the
  -- link back to the original is what evidence actually needs.
  extracted_text text,
  -- Short quotable spans used to support specific facts.
  excerpt text,
  -- sha256 of the normalised extract, for dedupe and change detection.
  content_hash text,

  access_status source_access_status not null default 'pending',
  processing_status source_processing_status not null default 'pending',
  failure_reason text,

  -- Anything adapter-specific: http status, mime, word count, provider ids.
  metadata jsonb not null default '{}'::jsonb,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sources_extract_size check (extracted_text is null or char_length(extracted_text) <= 200000),
  constraint sources_excerpt_size check (excerpt is null or char_length(excerpt) <= 2000)
);

create index sources_workspace_idx on public.sources (workspace_id, created_at desc);
create index sources_user_idx on public.sources (user_id, created_at desc);
create index sources_type_idx on public.sources (workspace_id, source_type);
-- Dedupe: the same URL fetched twice in a workspace should be reused, not refetched.
create unique index sources_workspace_url_unique on public.sources (workspace_id, source_url)
  where source_url is not null;
create index sources_hash_idx on public.sources (content_hash) where content_hash is not null;

create trigger sources_touch before update on public.sources
  for each row execute function public.touch_updated_at();

-- A source may reference several people (a leadership page, a panel writeup),
-- and each association carries its own identity confidence.
create table public.source_person_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,

  identity_match_status identity_match_status not null default 'unreviewed',
  -- 0..1. Only ever set alongside the signals that produced it.
  identity_match_confidence numeric(4,3),
  -- Which signals matched: name, employer, title, domain, url, email.
  match_signals jsonb not null default '{}'::jsonb,
  -- Set true when a human explicitly confirmed or rejected this association.
  reviewed_by_user boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_id, person_id),
  constraint source_person_confidence_range
    check (identity_match_confidence is null or (identity_match_confidence >= 0 and identity_match_confidence <= 1))
);

create index source_person_links_person_idx on public.source_person_links (person_id, identity_match_status);
create index source_person_links_source_idx on public.source_person_links (source_id);
create index source_person_links_workspace_idx on public.source_person_links (workspace_id);
create trigger source_person_links_touch before update on public.source_person_links
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- PROFESSIONAL FACTS
-- Structured, source-backed claims. Distinct from `observations`, which are about
-- how it is to WORK with someone; facts are about their professional identity.
-- =============================================================================

create table public.professional_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  visibility record_visibility not null default 'private',

  kind fact_kind not null,
  -- Normalised for comparison, e.g. "VP Engineering".
  value text not null,
  -- Optional supporting detail, e.g. dates, organisation for a prior role.
  detail text,

  evidence_level evidence_level not null default 'inferred',
  -- Superseded facts are kept, not deleted: "was Director, now VP" is useful.
  superseded_by uuid references public.professional_facts(id) on delete set null,
  is_current boolean not null default true,

  -- Conflict handling: set when sources disagree and Aurel could not resolve it.
  has_conflict boolean not null default false,

  first_seen_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  -- Drives the freshness indicator; a five-year-old title must not read as current.
  as_of timestamptz,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint professional_facts_value_len check (char_length(value) between 1 and 500)
);

create index professional_facts_person_idx on public.professional_facts (person_id, kind, is_current);
create index professional_facts_workspace_idx on public.professional_facts (workspace_id);
create trigger professional_facts_touch before update on public.professional_facts
  for each row execute function public.touch_updated_at();

-- Which sources support which fact. A fact with zero rows here can never be
-- presented above 'inferred'.
create table public.fact_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fact_id uuid not null references public.professional_facts(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  excerpt text,
  created_at timestamptz not null default now(),
  unique (fact_id, source_id),
  constraint fact_sources_excerpt_len check (excerpt is null or char_length(excerpt) <= 1000)
);
create index fact_sources_fact_idx on public.fact_sources (fact_id);
create index fact_sources_source_idx on public.fact_sources (source_id);
create index fact_sources_workspace_idx on public.fact_sources (workspace_id);

-- Observations may now also be backed by a source, not only an interaction.
alter table public.observation_sources
  add column source_id uuid references public.sources(id) on delete cascade;
create index observation_sources_source_idx on public.observation_sources (source_id);

-- =============================================================================
-- RESEARCH
-- =============================================================================

create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,

  status research_job_status not null default 'queued',
  -- Truthful progress: only stages that actually ran are recorded.
  stage text,
  -- What we searched for, so a rerun is reproducible.
  query jsonb not null default '{}'::jsonb,

  sources_considered integer not null default 0,
  sources_accepted integer not null default 0,
  facts_created integer not null default 0,
  observations_proposed integer not null default 0,

  provider text,
  failure_reason text,
  -- Rough cost accounting for SaaS economics, never shown to the user.
  cost_units numeric(10,4) not null default 0,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_jobs_person_idx on public.research_jobs (person_id, created_at desc);
create index research_jobs_workspace_idx on public.research_jobs (workspace_id, created_at desc);
create trigger research_jobs_touch before update on public.research_jobs
  for each row execute function public.touch_updated_at();

-- When research finds several plausible people, we store the candidates and ask
-- rather than guessing.
create table public.identity_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  research_job_id uuid not null references public.research_jobs(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,

  display_name text not null,
  organization text,
  job_title text,
  profile_url text,
  summary text,
  confidence numeric(4,3),
  signals jsonb not null default '{}'::jsonb,
  selected boolean not null default false,

  created_at timestamptz not null default now(),
  constraint identity_candidates_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);
create index identity_candidates_job_idx on public.identity_candidates (research_job_id);
create index identity_candidates_workspace_idx on public.identity_candidates (workspace_id);

-- --- people gain footprint metadata -------------------------------------------

alter table public.people
  add column profile_url text,
  add column last_researched_at timestamptz,
  add column research_status text,
  add column footprint_summary text,
  -- Set when the user says "this is the wrong person" so research stops guessing.
  add column identity_locked boolean not null default false;

-- =============================================================================
-- RLS
-- =============================================================================

do $rls$
declare
  t text;
  tables text[] := array[
    'sources','source_person_links','professional_facts','fact_sources',
    'research_jobs','identity_candidates'
  ];
begin
  foreach t in array tables
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format($p$
      create policy "%s: read" on public.%I for select using (
        user_id = (select auth.uid())
        or workspace_id in (select public.current_workspace_ids())
      )$p$, t, t);

    execute format($p$
      create policy "%s: insert" on public.%I for insert with check (
        user_id = (select auth.uid())
        and workspace_id in (select public.current_workspace_ids())
      )$p$, t, t);

    execute format($p$
      create policy "%s: update" on public.%I for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
      $p$, t, t);

    execute format($p$
      create policy "%s: delete" on public.%I for delete using (user_id = (select auth.uid()))
      $p$, t, t);
  end loop;
end
$rls$;