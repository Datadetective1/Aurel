-- Calendar V1, read-only.
--
-- Two tables with distinct jobs, which the original schema already anticipated:
-- external_calendar_events is the provider mirror -- what the calendar said,
-- kept idempotent on (integration_id, external_id) -- and meetings is the
-- Atturel meeting with an objective and a brief. A meeting is materialised only
-- when the user presses Prepare, so a calendar of standups does not become a
-- hundred empty Atturel meetings.

-- A tenant that disables user consent is not an error, it is a state with a
-- specific remedy, and the UI has to be able to say so.
alter type public.integration_status add value if not exists 'admin_consent_required';

alter table public.external_calendar_events
  -- Which calendar within the account. Needed to sync more than the default.
  add column if not exists calendar_id text,
  -- Provider-neutral timezone of the event as scheduled, so a moved meeting
  -- reads correctly for the person who scheduled it.
  add column if not exists time_zone text,
  add column if not exists meeting_url text,
  -- Series identity. A moved single occurrence keeps the series id but gets its
  -- own external_id, which is what stops it duplicating the series.
  add column if not exists recurrence_id text,
  add column if not exists is_recurring boolean not null default false,
  -- 'confirmed' | 'cancelled'. A cancelled event is kept rather than deleted:
  -- the user may already have prepared for it and deserves to see it was called
  -- off rather than have it vanish.
  add column if not exists status text not null default 'confirmed',
  -- The provider's own change marker, so an unchanged event is skipped without
  -- comparing every field.
  add column if not exists provider_updated_at timestamptz,
  -- Set when the provider marks the event private or sensitive. Body and
  -- location are then not stored at all -- see the sync notes.
  add column if not exists is_private boolean not null default false,
  add column if not exists is_all_day boolean not null default false,
  -- Short context only, and never for a private event.
  add column if not exists description text;

-- Idempotency, enforced by the database rather than by the sync code
-- remembering to check. The same provider event can only ever be one row.
create unique index if not exists external_calendar_events_unique_event
  on public.external_calendar_events (integration_id, external_id);

create index if not exists external_calendar_events_upcoming
  on public.external_calendar_events (user_id, starts_at)
  where status = 'confirmed';

alter table public.integration_accounts
  -- Provider change marker for incremental sync: Graph deltaLink, Google
  -- syncToken. Opaque to us, so it is stored as text and never parsed.
  add column if not exists sync_cursor text,
  -- Which calendar we sync. Null means the account's default.
  add column if not exists calendar_id text,
  -- Rate limiting our own polling, independent of provider limits.
  add column if not exists last_sync_attempt_at timestamptz;

comment on column public.integration_accounts.access_token_encrypted is
  'AES-256-GCM ciphertext. Never leaves the server, never logged. See lib/crypto.ts.';
comment on column public.integration_accounts.refresh_token_encrypted is
  'AES-256-GCM ciphertext. Never leaves the server, never logged. See lib/crypto.ts.';
comment on column public.external_calendar_events.description is
  'Short context only, truncated, and never populated for an event the provider marked private.';
