-- =============================================================================
-- 0022: PRIVATE, TEMPORARY CAPTURE AUDIO
--
-- Long conversations cannot be one request body, so the app uploads audio in
-- ten-minute segments straight to storage, and each segment is transcribed
-- and deleted on its own. This migration creates that storage and the ledger
-- that lets every object be found and removed.
--
--   capture-audio   a PRIVATE bucket. No policies for the anon or
--                   authenticated roles: no client can list, read, write or
--                   delete in it. Objects are created only through signed
--                   upload URLs that Atturel's server issues for a path under
--                   the caller's own user id, and read and deleted only by the
--                   server's service role. There is never a public URL.
--
--   audio_uploads   one row per segment: whose it is, where it is, its
--                   lifecycle. No audio and no words -- the transcript is
--                   returned to the user and never stored here. Rows survive
--                   the object so cleanup is provable; they are deleted with
--                   the account.
--
-- Additive. Enable in the app with CAPTURE_STORAGE_ENABLED=1 after applying.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capture-audio',
  'capture-audio',
  false,
  20 * 1024 * 1024,
  array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.audio_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null,
  segment_index integer not null check (segment_index >= 0 and segment_index < 100),
  storage_path text not null unique,
  extension text not null,
  declared_bytes integer not null check (declared_bytes > 0),
  declared_seconds integer,
  measured_seconds integer,
  status text not null default 'pending'
    check (status in ('pending', 'transcribed', 'failed', 'deleted')),
  attempts integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  transcribed_at timestamptz,
  object_deleted_at timestamptz,
  unique (user_id, capture_id, segment_index)
);

create index if not exists audio_uploads_cleanup_idx
  on public.audio_uploads (created_at)
  where object_deleted_at is null;

-- Service-role only. The server checks ownership explicitly on every call.
alter table public.audio_uploads enable row level security;
