-- =============================================================================
-- PERSON PHOTO SUGGESTIONS
--
-- PREPARED, NOT APPLIED. Written 13 Oct 2026 for review; it has not been run
-- against production. The application detects whether this table exists and
-- hides the suggestion flow until it does, so deploying the code first is safe.
--
-- Additive only: one new table and one nullable column. Nothing existing is
-- altered, rewritten or dropped.
--
-- The trust model a face follows:
--
--   UPLOAD    the user supplies a photo (exists since 0017, unchanged)
--   SUGGEST   Atturel finds a candidate on a page already confirmed to be
--             about this person, and stores it privately as a suggestion
--   CONFIRM   only the user's "Use photo" makes it the person's face;
--             "Not this person" records the refusal so it is never re-offered
--   FALLBACK  no trusted photo is initials, as before
--
-- Nothing is ever assigned silently. The suggestion row keeps where the image
-- was found, so a confirmed face can always answer "where did this come from".
-- =============================================================================

create table if not exists public.person_photo_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visibility record_visibility not null default 'private',
  person_id uuid not null references public.people(id) on delete cascade,

  -- Where the candidate was found. `image_url` is the public image address;
  -- `source_url` the page it appeared on, which must already be a confirmed
  -- source for this person. Kept for provenance, never hotlinked.
  image_url text not null,
  source_url text not null,
  source_label text,
  source_id uuid references public.sources(id) on delete set null,
  provider text not null,

  -- The private copy shown for review, in the avatars bucket under the
  -- owner's folder. Removed when the suggestion is rejected.
  storage_path text,

  status text not null default 'suggested',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint person_photo_suggestions_status check (status in ('suggested', 'confirmed', 'rejected')),
  constraint person_photo_suggestions_image_len check (char_length(image_url) between 1 and 2048),
  constraint person_photo_suggestions_source_len check (char_length(source_url) between 1 and 2048),
  constraint person_photo_suggestions_unique unique (person_id, image_url)
);

create index if not exists person_photo_suggestions_person_idx
  on public.person_photo_suggestions (user_id, person_id, status);
create index if not exists person_photo_suggestions_workspace_idx
  on public.person_photo_suggestions (workspace_id, visibility);

create trigger person_photo_suggestions_touch before update on public.person_photo_suggestions
  for each row execute function public.touch_updated_at();

-- Which suggestion, if any, the current face came from. Null for uploads.
alter table public.people
  add column if not exists avatar_suggestion_id uuid
    references public.person_photo_suggestions(id) on delete set null;

-- Same policy shape as every other domain table (see 0007, 0017).
alter table public.person_photo_suggestions enable row level security;

create policy "person_photo_suggestions: read" on public.person_photo_suggestions for select using (
  user_id = (select auth.uid())
  or (visibility = 'shared' and workspace_id in (select private.current_workspace_ids()))
);
create policy "person_photo_suggestions: insert" on public.person_photo_suggestions for insert with check (
  user_id = (select auth.uid())
  and workspace_id in (select private.current_workspace_ids())
);
create policy "person_photo_suggestions: update" on public.person_photo_suggestions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and workspace_id in (select private.current_workspace_ids()));
create policy "person_photo_suggestions: delete" on public.person_photo_suggestions for delete
  using (user_id = (select auth.uid()));
