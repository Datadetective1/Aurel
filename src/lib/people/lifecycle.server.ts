import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { checkPersonLimit } from '@/lib/billing/entitlements'
import { AVATAR_BUCKET } from '@/lib/conversations/avatars'
import { logger } from '@/lib/logger'
import {
  isPersonId,
  literalLike,
  matchDuplicate,
  mentions,
  namesFor,
  type DeletionPreview,
  type DuplicateCandidate,
  type DuplicateInput,
  type DuplicateReason,
} from './lifecycle'

type Client = SupabaseClient<Database>

/**
 * Archive, restore and permanent delete, for the web actions and the phone's
 * routes alike. Every read and write is scoped to the caller's own rows --
 * `user_id` on every query, row level security underneath -- so an id from
 * another account is simply not found.
 *
 * The cascades a delete would trigger on its own are known (see
 * docs/PRODUCT_AUDIT_2026-10.md, Phase 2). The ones that would take
 * something that is not only about this person are defused first:
 *
 *   commitments.person_id   CASCADE  -> unlinked first, so the loops stay
 *   notes.person_id         CASCADE  -> a note that also belongs to a meeting
 *                                       or conversation is unlinked first
 *   sources                 (kept by the database) -> removed afterwards only
 *                                       when nothing else refers to them
 *
 * and the rest is exactly what was about them alone: observations, notes only
 * about them, researched facts, research runs, topics, and their place in
 * meetings, conversations and decisions (the meetings, conversations and
 * decisions themselves stay).
 */

export async function archivePersonRecord(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<'archived' | 'already' | 'not_found'> {
  if (!isPersonId(personId)) return 'not_found'
  const { data: person } = await supabase
    .from('people')
    .select('id, archived_at')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return 'not_found'
  if (person.archived_at) return 'already'
  const { error } = await supabase
    .from('people')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', personId)
    .eq('user_id', userId)
  if (error) {
    logger.warn('person.archive_failed', { code: error.code })
    return 'not_found'
  }
  return 'archived'
}

export type RestoreOutcome =
  | { ok: true; already?: boolean }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'limit'; message: string }

/**
 * Bring someone back. They count toward the plan's active people again, so
 * the limit is checked first -- except for the sample record, which never
 * counts.
 */
export async function restorePersonRecord(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<RestoreOutcome> {
  if (!isPersonId(personId)) return { ok: false, reason: 'not_found' }
  const { data: person } = await supabase
    .from('people')
    .select('id, archived_at, is_demo')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return { ok: false, reason: 'not_found' }
  if (!person.archived_at) return { ok: true, already: true }

  if (!person.is_demo) {
    const limit = await checkPersonLimit()
    if (!limit.allowed) {
      return {
        ok: false,
        reason: 'limit',
        message: `${limit.message} Archive someone else to make room, or upgrade.`,
      }
    }
  }

  const { error } = await supabase
    .from('people')
    .update({ archived_at: null })
    .eq('id', personId)
    .eq('user_id', userId)
  if (error) {
    logger.warn('person.restore_failed', { code: error.code })
    return { ok: false, reason: 'not_found' }
  }
  return { ok: true }
}

/**
 * Sources linked to this person that nothing else refers to: no other
 * person's link, no other person's fact, no other person's observation.
 * Only these leave with the person.
 */
async function sourcesOnlyAbout(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<{ linked: string[]; onlyTheirs: string[] }> {
  const { data: links } = await supabase
    .from('source_person_links')
    .select('source_id')
    .eq('user_id', userId)
    .eq('person_id', personId)
  const linked = [...new Set((links ?? []).map((l) => l.source_id))]
  if (linked.length === 0) return { linked, onlyTheirs: [] }

  const [{ data: otherLinks }, { data: factRefs }, { data: observationRefs }] = await Promise.all([
    supabase
      .from('source_person_links')
      .select('source_id')
      .eq('user_id', userId)
      .neq('person_id', personId)
      .in('source_id', linked),
    supabase
      .from('fact_sources')
      .select('source_id, professional_facts!inner(person_id)')
      .eq('user_id', userId)
      .in('source_id', linked),
    supabase
      .from('observation_sources')
      .select('source_id, observations!inner(person_id)')
      .eq('user_id', userId)
      .in('source_id', linked),
  ])

  const elsewhere = new Set<string>((otherLinks ?? []).map((l) => l.source_id))
  for (const ref of factRefs ?? []) {
    const owner = (ref.professional_facts as { person_id: string } | null)?.person_id
    if (owner !== personId) elsewhere.add(ref.source_id)
  }
  for (const ref of observationRefs ?? []) {
    const owner = (ref.observations as { person_id: string } | null)?.person_id
    if (ref.source_id && owner !== personId) elsewhere.add(ref.source_id)
  }
  return { linked, onlyTheirs: linked.filter((id) => !elsewhere.has(id)) }
}

/** Exactly what a permanent delete would do, counted from the record. */
export async function previewPersonDeletion(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<DeletionPreview | null> {
  if (!isPersonId(personId)) return null
  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, archived_at, avatar_path')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return null

  type PersonTable =
    | 'observations'
    | 'professional_facts'
    | 'research_jobs'
    | 'meeting_attendees'
    | 'interaction_participants'
    | 'decision_people'
    | 'artifact_sources'
  const count = (table: PersonTable) =>
    supabase
      .from(table as 'observations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('person_id', personId)

  const [
    observations,
    facts,
    researchRuns,
    meetings,
    conversations,
    decisions,
    briefCitations,
    { data: notes },
    { data: loops },
    sources,
  ] = await Promise.all([
    count('observations'),
    count('professional_facts'),
    count('research_jobs'),
    count('meeting_attendees'),
    count('interaction_participants'),
    count('decision_people'),
    count('artifact_sources'),
    supabase
      .from('notes')
      .select('id, meeting_id, interaction_id')
      .eq('user_id', userId)
      .eq('person_id', personId),
    supabase
      .from('commitments')
      .select('id, description, status')
      .eq('user_id', userId)
      .or(`person_id.eq.${personId},owner_person_id.eq.${personId}`)
      .order('created_at', { ascending: false })
      .limit(200),
    sourcesOnlyAbout(supabase, userId, personId),
  ])

  const names = namesFor(person)
  const attachedNotes = (notes ?? []).filter((n) => n.meeting_id || n.interaction_id).length

  return {
    person: {
      id: person.id,
      name: person.preferred_name || person.full_name,
      archivedAt: person.archived_at,
    },
    deleted: {
      observations: observations.count ?? 0,
      notes: (notes ?? []).length - attachedNotes,
      facts: facts.count ?? 0,
      sources: sources.onlyTheirs.length,
      researchRuns: researchRuns.count ?? 0,
      photo: Boolean(person.avatar_path),
    },
    unlinked: {
      loops: (loops ?? []).length,
      meetings: meetings.count ?? 0,
      conversations: conversations.count ?? 0,
      decisions: decisions.count ?? 0,
      notes: attachedNotes,
      briefCitations: briefCitations.count ?? 0,
    },
    retainedLoops: (loops ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      status: l.status,
      mentionsPerson: mentions(l.description, names),
    })),
  }
}

export type DeleteOutcome =
  | { ok: true; keptLoops: number; removedSources: number }
  | { ok: false; reason: 'not_found' | 'not_archived' | 'failed' }

/**
 * Delete someone for good. Only an archived person: the two steps are the
 * confirmation. Loops and shared notes are unlinked before the row goes, and
 * linked back if the delete itself fails, so a failure leaves the record as
 * it was.
 */
export async function deletePersonRecord(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<DeleteOutcome> {
  if (!isPersonId(personId)) return { ok: false, reason: 'not_found' }
  const { data: person } = await supabase
    .from('people')
    .select('id, archived_at, avatar_path')
    .eq('id', personId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!person) return { ok: false, reason: 'not_found' }
  if (!person.archived_at) return { ok: false, reason: 'not_archived' }

  const [{ data: loops }, { data: ownedLoops }, { data: sharedNotes }, sources] = await Promise.all(
    [
      supabase.from('commitments').select('id').eq('user_id', userId).eq('person_id', personId),
      supabase
        .from('commitments')
        .select('id')
        .eq('user_id', userId)
        .eq('owner_person_id', personId),
      supabase
        .from('notes')
        .select('id')
        .eq('user_id', userId)
        .eq('person_id', personId)
        .or('meeting_id.not.is.null,interaction_id.not.is.null'),
      sourcesOnlyAbout(supabase, userId, personId),
    ],
  )
  const loopIds = (loops ?? []).map((l) => l.id)
  const ownedLoopIds = (ownedLoops ?? []).map((l) => l.id)
  const noteIds = (sharedNotes ?? []).map((n) => n.id)

  const relink = async () => {
    if (loopIds.length)
      await supabase
        .from('commitments')
        .update({ person_id: personId })
        .eq('user_id', userId)
        .in('id', loopIds)
    if (ownedLoopIds.length)
      await supabase
        .from('commitments')
        .update({ owner_person_id: personId })
        .eq('user_id', userId)
        .in('id', ownedLoopIds)
    if (noteIds.length)
      await supabase
        .from('notes')
        .update({ person_id: personId })
        .eq('user_id', userId)
        .in('id', noteIds)
  }

  // 1. Unlink what stays.
  const unlinks = await Promise.all([
    loopIds.length
      ? supabase
          .from('commitments')
          .update({ person_id: null })
          .eq('user_id', userId)
          .in('id', loopIds)
      : Promise.resolve({ error: null }),
    ownedLoopIds.length
      ? supabase
          .from('commitments')
          .update({ owner_person_id: null })
          .eq('user_id', userId)
          .in('id', ownedLoopIds)
      : Promise.resolve({ error: null }),
    noteIds.length
      ? supabase.from('notes').update({ person_id: null }).eq('user_id', userId).in('id', noteIds)
      : Promise.resolve({ error: null }),
  ])
  const unlinkError = unlinks.find((r) => r.error)?.error
  if (unlinkError) {
    logger.error('person.delete_unlink_failed', { code: unlinkError.code })
    await relink()
    return { ok: false, reason: 'failed' }
  }

  // 2. The person, and what was only about them, by the database's cascades.
  const { error } = await supabase.from('people').delete().eq('id', personId).eq('user_id', userId)
  if (error) {
    logger.error('person.delete_failed', { code: error.code })
    await relink()
    return { ok: false, reason: 'failed' }
  }

  // 3. Public sources nothing else refers to any more. Re-checked now that
  // the person's own facts and observations are gone.
  let removedSources = 0
  if (sources.onlyTheirs.length) {
    const [{ data: links }, { data: facts }, { data: observations }] = await Promise.all([
      supabase
        .from('source_person_links')
        .select('source_id')
        .eq('user_id', userId)
        .in('source_id', sources.onlyTheirs),
      supabase
        .from('fact_sources')
        .select('source_id')
        .eq('user_id', userId)
        .in('source_id', sources.onlyTheirs),
      supabase
        .from('observation_sources')
        .select('source_id')
        .eq('user_id', userId)
        .in('source_id', sources.onlyTheirs),
    ])
    const stillUsed = new Set(
      [...(links ?? []), ...(facts ?? []), ...(observations ?? [])].map((r) => r.source_id),
    )
    const orphans = sources.onlyTheirs.filter((id) => !stillUsed.has(id))
    if (orphans.length) {
      const { error: sourceError } = await supabase
        .from('sources')
        .delete()
        .eq('user_id', userId)
        .in('id', orphans)
      if (sourceError) logger.warn('person.delete_sources_failed', { code: sourceError.code })
      else removedSources = orphans.length
    }
  }

  // 4. Their photo, only from this account's own folder.
  if (person.avatar_path && person.avatar_path.startsWith(`${userId}/`)) {
    await supabase.storage.from(AVATAR_BUCKET).remove([person.avatar_path])
  }

  return { ok: true, keptLoops: loopIds.length + ownedLoopIds.length, removedSources }
}

export interface PossibleDuplicate {
  id: string
  name: string
  organization: string | null
  archived: boolean
  reason: DuplicateReason
}

/** The person this one probably already is, active or archived. */
export async function findPossibleDuplicate(
  supabase: Client,
  userId: string,
  input: DuplicateInput,
): Promise<PossibleDuplicate | null> {
  const columns =
    'id, full_name, preferred_name, email, profile_url, archived_at, organizations(name)'
  const queries = [
    supabase
      .from('people')
      .select(columns)
      .eq('user_id', userId)
      .ilike('full_name', literalLike(input.fullName.trim()))
      .limit(5),
  ]
  if (input.email?.trim()) {
    queries.push(
      supabase
        .from('people')
        .select(columns)
        .eq('user_id', userId)
        .ilike('email', literalLike(input.email.trim()))
        .limit(5),
    )
  }
  if (input.profileUrl?.trim()) {
    queries.push(
      supabase
        .from('people')
        .select(columns)
        .eq('user_id', userId)
        .eq('profile_url', input.profileUrl.trim())
        .limit(5),
    )
  }
  const results = await Promise.all(queries)
  const seen = new Map<string, DuplicateCandidate>()
  for (const { data } of results) {
    for (const row of data ?? []) {
      seen.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        preferred_name: row.preferred_name,
        email: row.email,
        profile_url: row.profile_url,
        archived_at: row.archived_at,
        organization: (row.organizations as { name: string } | null)?.name ?? null,
      })
    }
  }
  const match = matchDuplicate([...seen.values()], input)
  if (!match) return null
  const c = match.candidate
  return {
    id: c.id,
    name: c.preferred_name || c.full_name,
    organization: c.organization,
    archived: Boolean(c.archived_at),
    reason: match.reason,
  }
}
