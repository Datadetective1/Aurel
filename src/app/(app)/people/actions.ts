'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolveOrganization } from '@/lib/organizations'
import { wallTimeToInstant } from '@/lib/tz'
import { getProfile, requireUser } from '@/lib/auth'
import { ownership, ownershipNoVisibility } from '@/lib/workspace'
import { checkPersonLimit } from '@/lib/billing/entitlements'
import { isValidTimezone } from '@/lib/timezones'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import {
  archivePersonRecord,
  deletePersonRecord,
  findPossibleDuplicate,
  restorePersonRecord,
  type PossibleDuplicate,
} from '@/lib/people/lifecycle.server'
import { clearPersonPhoto, savePersonPhoto } from '@/lib/people/photos.server'

/**
 * People + relationship record actions.
 *
 * Every write goes through `ownership()` so the workspace and visibility columns
 * are always populated correctly. RLS enforces the boundary; these helpers make
 * it impossible to forget to set it.
 */

export interface ActionState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string[]>
  /**
   * The person form's fields, echoed back on a refusal. React resets an
   * uncontrolled form when its action settles, so without this a validation
   * error or a plan limit wiped company, title, link and notes.
   */
  values?: Record<string, string>
  /**
   * A record this new person probably already is. Nothing was created; the
   * form offers to open (or restore) it, or to add them anyway.
   */
  duplicate?: PossibleDuplicate
}

const PERSON_FIELDS = [
  'fullName',
  'preferredName',
  'jobTitle',
  'organizationName',
  'email',
  'profileUrl',
  'relationshipType',
  'pronouns',
  'timezone',
  'notes',
] as const

function personValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(PERSON_FIELDS.map((f) => [f, formData.get(f)?.toString() ?? '']))
}

const RELATIONSHIP_TYPES = [
  'manager',
  'report',
  'skip_level',
  'peer',
  'cross_functional',
  'customer',
  'prospect',
  'vendor',
  'partner',
  'candidate',
  'mentor',
  'external',
  'other',
] as const

const personSchema = z.object({
  fullName: z.string().trim().min(1, 'A name is required.').max(160),
  preferredName: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  organizationName: z.string().trim().max(160).optional(),
  email: z
    .union([z.string().trim().email('Enter a valid email address.'), z.literal('')])
    .optional(),
  profileUrl: z
    .union([z.string().trim().url('Enter a full web address, including https://'), z.literal('')])
    .optional(),
  relationshipType: z.enum(RELATIONSHIP_TYPES).catch('peer'),
  relevance: z.coerce.number().int().min(1).max(5).catch(3),
  pronouns: z.string().trim().max(40).optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine(isValidTimezone, 'That is not a time zone we recognize.')
    .optional(),
  notes: z.string().trim().max(4000).optional(),
})

function parsePerson(formData: FormData) {
  return personSchema.safeParse({
    fullName: formData.get('fullName'),
    preferredName: formData.get('preferredName') || undefined,
    jobTitle: formData.get('jobTitle') || undefined,
    organizationName: formData.get('organizationName') || undefined,
    email: formData.get('email') || undefined,
    profileUrl: formData.get('profileUrl') || undefined,
    relationshipType: formData.get('relationshipType') ?? 'peer',
    relevance: formData.get('relevance') ?? 3,
    pronouns: formData.get('pronouns') || undefined,
    timezone: formData.get('timezone') || undefined,
    notes: formData.get('notes') || undefined,
  })
}

export async function createPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await createPersonCore(formData, { checkDuplicate: true })
  if (!result.personId) return result
  // Their page, and nothing more: a profile link entered here is never read
  // until the user asks for research (owner's rule, 25 Oct 2026).
  redirect(`/people/${result.personId}`)
}

/**
 * The person, without the navigation: validated, held to the plan's people
 * limit, written, counted. The web form opens their page afterwards; the
 * native app (`POST /api/mobile/people`) returns to whatever it was doing.
 *
 * With `checkDuplicate`, a likely existing record (same email, profile link
 * or name, active or archived) stops the create and is returned instead,
 * unless the form says `confirmDuplicate=yes`. Off by default: builds of the
 * app already installed call this through their route and expect a person.
 */
export async function createPersonCore(
  formData: FormData,
  options: { checkDuplicate?: boolean } = {},
): Promise<ActionState & { personId?: string }> {
  const parsed = parsePerson(formData)

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: personValues(formData) }
  }

  const limit = await checkPersonLimit()
  if (!limit.allowed) {
    return { error: limit.message, values: personValues(formData) }
  }

  const supabase = await createClient()
  const own = await ownership()
  const v = parsed.data

  const possibleDuplicate = await findPossibleDuplicate(supabase, own.user_id, {
    fullName: v.fullName,
    email: v.email,
    profileUrl: v.profileUrl,
  })
  if (
    options.checkDuplicate &&
    possibleDuplicate &&
    formData.get('confirmDuplicate')?.toString() !== 'yes'
  ) {
    return { duplicate: possibleDuplicate, values: personValues(formData) }
  }

  const organizationId = await resolveOrganization(v.organizationName)

  const { data: person, error } = await supabase
    .from('people')
    .insert({
      ...own,
      full_name: v.fullName,
      preferred_name: v.preferredName || null,
      job_title: v.jobTitle || null,
      organization_id: organizationId,
      email: v.email || null,
      profile_url: v.profileUrl || null,
      relationship_type: v.relationshipType,
      relevance: v.relevance,
      pronouns: v.pronouns || null,
      timezone: v.timezone || null,
      notes: v.notes || null,
    })
    .select('id')
    .single()

  if (error || !person) {
    logger.error('person.create_failed', { code: error?.code })
    return { error: 'We could not add that person. Try again.', values: personValues(formData) }
  }

  await track('person_added', {
    relationshipType: v.relationshipType,
    relevance: v.relevance,
    hasProfileUrl: Boolean(v.profileUrl),
    possibleDuplicate: Boolean(possibleDuplicate),
  })

  revalidatePath('/people')
  return { personId: person.id }
}

export async function updatePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const personId = formData.get('personId')?.toString()
  if (!personId) return { error: 'Missing person.' }

  const parsed = parsePerson(formData)

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: personValues(formData) }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const v = parsed.data
  const organizationId = await resolveOrganization(v.organizationName)

  const { error } = await supabase
    .from('people')
    .update({
      full_name: v.fullName,
      preferred_name: v.preferredName || null,
      job_title: v.jobTitle || null,
      organization_id: organizationId,
      email: v.email || null,
      profile_url: v.profileUrl || null,
      relationship_type: v.relationshipType,
      relevance: v.relevance,
      pronouns: v.pronouns || null,
      timezone: v.timezone || null,
      notes: v.notes || null,
    })
    .eq('id', personId)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('person.update_failed', { code: error.code })
    return { error: 'We could not save those changes.', values: personValues(formData) }
  }

  revalidatePath(`/people/${personId}`)
  revalidatePath('/people')
  return { message: 'Saved.' }
}

/**
 * Remove someone from the active record. Reversible: they leave every list,
 * picker and new workflow, and their history stays where it is.
 */
export async function archivePerson(personId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const outcome = await archivePersonRecord(supabase, user.id, personId)
  if (outcome === 'archived') await track('person_archived')

  revalidatePath('/people')
  revalidatePath(`/people/${personId}`)
  redirect('/people?removed=1')
}

/** Bring someone back from the archive, within the plan's people limit. */
export async function restorePerson(personId: string): Promise<ActionState> {
  const user = await requireUser()
  const supabase = await createClient()

  const outcome = await restorePersonRecord(supabase, user.id, personId)
  if (!outcome.ok) {
    return {
      error: outcome.reason === 'limit' ? outcome.message : 'That person could not be found.',
    }
  }
  if (!outcome.already) await track('person_restored')

  revalidatePath('/people')
  revalidatePath(`/people/${personId}`)
  return { message: 'Restored.' }
}

/**
 * Delete someone for good -- only an archived person, only with the
 * confirmation ticked. What stays and what goes is shown first, on
 * /people/[id]/delete, from the same record this acts on.
 */
export async function deletePersonPermanently(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = formData.get('personId')?.toString() ?? ''
  if (formData.get('understood')?.toString() !== 'yes') {
    return { error: 'Tick the box to confirm this cannot be undone.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  const outcome = await deletePersonRecord(supabase, user.id, personId)
  if (!outcome.ok) {
    return {
      error:
        outcome.reason === 'not_archived'
          ? 'Remove them from your people first; only an archived person can be deleted.'
          : outcome.reason === 'not_found'
            ? 'That person could not be found.'
            : 'They could not be deleted. Nothing was changed.',
    }
  }

  await track('person_deleted', {
    keptLoops: outcome.keptLoops > 0,
    removedSources: outcome.removedSources > 0,
  })
  revalidatePath('/people')
  redirect('/people?view=archived&deleted=1')
}

// =============================================================================
// OBSERVATIONS — the verified memory loop
// =============================================================================

const observationSchema = z.object({
  personId: z.string().uuid(),
  content: z.string().trim().min(3, 'Say what you noticed.').max(1000),
  category: z
    .enum([
      'communication',
      'decision',
      'trust',
      'friction',
      'priority',
      'preference',
      'context',
      'other',
    ])
    .catch('other'),
})

/**
 * An observation the user wrote themselves.
 * Recorded as CONFIRMED because the user is the primary witness — this is the
 * highest tier of evidence in the model.
 */
export async function addObservation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = observationSchema.safeParse({
    personId: formData.get('personId'),
    content: formData.get('content'),
    category: formData.get('category') ?? 'other',
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const supabase = await createClient()
  const own = await ownership()

  const { error } = await supabase.from('observations').insert({
    ...own,
    person_id: parsed.data.personId,
    content: parsed.data.content,
    category: parsed.data.category,
    evidence_level: 'confirmed',
    status: 'active',
    source_kind: 'user',
  })

  if (error) {
    logger.warn('observation.create_failed', { code: error.code })
    return { error: 'We could not save that.' }
  }

  await track('observation_added', { category: parsed.data.category, source: 'user' })
  revalidatePath(`/people/${parsed.data.personId}`)
  return { message: 'Added.' }
}

/** Promote a proposed memory into the active relationship record. */
export async function confirmObservation(observationId: string, editedContent?: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: observation } = await supabase
    .from('observations')
    .select('id, person_id, evidence_level')
    .eq('id', observationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!observation) return { ok: false as const }

  const { error } = await supabase
    .from('observations')
    .update({
      status: 'active',
      ...(editedContent ? { content: editedContent.slice(0, 1000) } : {}),
      // A user accepting a proposal makes it confirmed: they are vouching for it.
      evidence_level: 'confirmed',
      last_reinforced_at: new Date().toISOString(),
    })
    .eq('id', observationId)
    .eq('user_id', user.id)

  if (error) {
    logger.warn('observation.confirm_failed', { code: error.code })
    return { ok: false as const }
  }

  await track('memory_confirmed', { edited: Boolean(editedContent) })
  revalidatePath(`/people/${observation.person_id}`)
  return { ok: true as const }
}

export async function dismissObservation(observationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: observation } = await supabase
    .from('observations')
    .select('person_id')
    .eq('id', observationId)
    .eq('user_id', user.id)
    .maybeSingle()

  await supabase
    .from('observations')
    .update({ status: 'dismissed' })
    .eq('id', observationId)
    .eq('user_id', user.id)

  await track('observation_dismissed')
  if (observation) revalidatePath(`/people/${observation.person_id}`)
  return { ok: true as const }
}

/** Hard-delete an observation. Used by "forget this". */
export async function deleteObservation(observationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: observation } = await supabase
    .from('observations')
    .select('person_id')
    .eq('id', observationId)
    .eq('user_id', user.id)
    .maybeSingle()

  await supabase.from('observations').delete().eq('id', observationId).eq('user_id', user.id)

  if (observation) revalidatePath(`/people/${observation.person_id}`)
  return { ok: true as const }
}

// =============================================================================
// NOTES, INTERACTIONS, COMMITMENTS
// =============================================================================

const noteSchema = z.object({
  personId: z.string().uuid(),
  body: z.string().trim().min(1, 'Write something first.').max(8000),
})

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse({
    personId: formData.get('personId'),
    body: formData.get('body'),
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const supabase = await createClient()
  const own = await ownership()

  const { error } = await supabase
    .from('notes')
    .insert({ ...own, person_id: parsed.data.personId, body: parsed.data.body })

  if (error) return { error: 'We could not save that note.' }

  revalidatePath(`/people/${parsed.data.personId}`)
  return { message: 'Note added.' }
}

const interactionSchema = z.object({
  personId: z.string().uuid(),
  title: z.string().trim().min(1, 'Give it a title.').max(200),
  occurredAt: z.string().trim().min(1, 'When did it happen?'),
  kind: z.enum(['meeting', 'call', 'email', 'message', 'informal', 'other']).catch('meeting'),
  summary: z.string().trim().max(4000).optional(),
  wentWell: z.coerce.number().int().min(1).max(5).optional(),
})

export async function addInteraction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formData.get('wentWell')?.toString()
  const parsed = interactionSchema.safeParse({
    personId: formData.get('personId'),
    title: formData.get('title'),
    occurredAt: formData.get('occurredAt'),
    kind: formData.get('kind') ?? 'meeting',
    summary: formData.get('summary') || undefined,
    wentWell: raw ? Number(raw) : undefined,
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const supabase = await createClient()
  const own = await ownership()
  const v = parsed.data
  // A datetime-local reading: read in the account's zone, not the server's.
  const occurredAt = wallTimeToInstant(v.occurredAt, (await getProfile())?.timezone)
  if (!occurredAt) {
    return { fieldErrors: { occurredAt: ['That date is not valid.'] } }
  }

  // Logging is for conversations that have happened. A future date makes the
  // person header claim a last contact that is still ahead of them, and quietly
  // corrupts the contact-cadence signal on Today. A minute of slack absorbs a
  // clock that is slightly ahead.
  if (occurredAt.getTime() > Date.now() + 60_000) {
    return {
      fieldErrors: {
        occurredAt: ['That is in the future. Log a conversation once it has happened.'],
      },
    }
  }

  const { data: interaction, error } = await supabase
    .from('interactions')
    .insert({
      ...own,
      title: v.title,
      occurred_at: occurredAt.toISOString(),
      kind: v.kind,
      summary: v.summary || null,
      went_well: v.wentWell ?? null,
    })
    .select('id')
    .single()

  if (error || !interaction) return { error: 'We could not save that interaction.' }

  const ownNoVis = await ownershipNoVisibility()
  await supabase
    .from('interaction_participants')
    .insert({ ...ownNoVis, interaction_id: interaction.id, person_id: v.personId })

  // Keep the person's interaction window current, so Today and the Atlas can
  // order by recency without a join.
  await supabase
    .from('people')
    .update({ last_interaction_at: occurredAt.toISOString() })
    .eq('id', v.personId)
    .eq('user_id', ownNoVis.user_id)
    .or(`last_interaction_at.is.null,last_interaction_at.lt.${occurredAt.toISOString()}`)

  await supabase
    .from('people')
    .update({ first_interaction_at: occurredAt.toISOString() })
    .eq('id', v.personId)
    .eq('user_id', ownNoVis.user_id)
    .or(`first_interaction_at.is.null,first_interaction_at.gt.${occurredAt.toISOString()}`)

  await track('interaction_added', { kind: v.kind, rated: v.wentWell !== undefined })
  revalidatePath(`/people/${v.personId}`)
  return { message: 'Interaction recorded.' }
}

const commitmentSchema = z.object({
  personId: z.string().uuid(),
  description: z.string().trim().min(1, 'What was promised?').max(500),
  owner: z.enum(['user', 'person', 'shared']).catch('user'),
  dueOn: z.string().trim().optional(),
})

export async function addCommitment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = commitmentSchema.safeParse({
    personId: formData.get('personId'),
    description: formData.get('description'),
    owner: formData.get('owner') ?? 'user',
    dueOn: formData.get('dueOn') || undefined,
  })
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors }

  const supabase = await createClient()
  const own = await ownership()
  const v = parsed.data

  const { error } = await supabase.from('commitments').insert({
    ...own,
    person_id: v.personId,
    description: v.description,
    owner: v.owner,
    owner_person_id: v.owner === 'person' ? v.personId : null,
    due_on: v.dueOn || null,
  })

  if (error) return { error: 'We could not save that commitment.' }

  revalidatePath(`/people/${v.personId}`)
  revalidatePath('/today')
  return { message: 'Commitment added.' }
}

export async function completeCommitment(commitmentId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: commitment } = await supabase
    .from('commitments')
    .select('person_id')
    .eq('id', commitmentId)
    .eq('user_id', user.id)
    .maybeSingle()

  await supabase
    .from('commitments')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', commitmentId)
    .eq('user_id', user.id)

  if (commitment?.person_id) revalidatePath(`/people/${commitment.person_id}`)
  revalidatePath('/today')
  return { ok: true as const }
}

export async function reopenCommitment(commitmentId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase
    .from('commitments')
    .update({ status: 'open', completed_at: null })
    .eq('id', commitmentId)
    .eq('user_id', user.id)
  revalidatePath('/today')
  return { ok: true as const }
}

// =============================================================================
// DUPLICATE REVIEW AND MERGE
// =============================================================================

export interface DuplicatePair {
  keep: { id: string; name: string; interactionCount: number }
  merge: { id: string; name: string; interactionCount: number }
  /** Why these two look like the same person. */
  reason: string
}

/**
 * Find people who are probably the same professional.
 *
 * Matches on the three signals that are actually reliable: an identical name,
 * a shared email address, or a shared profile URL. Fuzzy name matching is
 * deliberately excluded — two different people called Chris Taylor is an
 * ordinary situation, and proposing that they are one person is a worse error
 * than missing a duplicate.
 *
 * Only ever proposes. Nothing is merged without the user choosing it.
 */
export async function findDuplicates(): Promise<DuplicatePair[]> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: people } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, email, profile_url, created_at')
    .eq('user_id', user.id)
    .is('archived_at', null)

  if (!people || people.length < 2) return []

  const { data: counts } = await supabase
    .from('interaction_participants')
    .select('person_id')
    .eq('user_id', user.id)

  const interactionsBy = new Map<string, number>()
  for (const row of counts ?? []) {
    interactionsBy.set(row.person_id, (interactionsBy.get(row.person_id) ?? 0) + 1)
  }

  const pairs: DuplicatePair[] = []
  const seen = new Set<string>()

  const norm = (v: string | null) => (v ?? '').trim().toLowerCase()

  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i]!
      const b = people[j]!

      let reason: string | null = null
      if (norm(a.email) && norm(a.email) === norm(b.email)) reason = 'Same email address'
      else if (norm(a.profile_url) && norm(a.profile_url) === norm(b.profile_url))
        reason = 'Same profile link'
      else if (norm(a.full_name) === norm(b.full_name)) reason = 'Same name'

      if (!reason) continue

      const key = [a.id, b.id].sort().join(':')
      if (seen.has(key)) continue
      seen.add(key)

      // Keep whichever carries more history; that minimises what has to move.
      const aCount = interactionsBy.get(a.id) ?? 0
      const bCount = interactionsBy.get(b.id) ?? 0
      const [keep, merge] = aCount >= bCount ? [a, b] : [b, a]

      pairs.push({
        keep: {
          id: keep.id,
          name: keep.preferred_name || keep.full_name,
          interactionCount: interactionsBy.get(keep.id) ?? 0,
        },
        merge: {
          id: merge.id,
          name: merge.preferred_name || merge.full_name,
          interactionCount: interactionsBy.get(merge.id) ?? 0,
        },
        reason,
      })
    }
  }

  return pairs
}

/**
 * Merge one person record into another.
 *
 * Everything is repointed rather than copied, so history survives intact: the
 * observations keep their evidence levels, the interactions keep their dates,
 * the sources keep their identity confidence. The merged record is then
 * archived rather than deleted — a merge is a judgement call, and deleting the
 * evidence of it would make a mistaken merge unrecoverable.
 */
export async function mergePeople(mergeId: string, keepId: string): Promise<ActionState> {
  if (mergeId === keepId) return { error: 'Those are the same person.' }

  const user = await requireUser()
  const supabase = await createClient()

  const { data: both } = await supabase
    .from('people')
    .select('id, full_name')
    .eq('user_id', user.id)
    .in('id', [mergeId, keepId])

  if ((both ?? []).length !== 2) return { error: 'One of those people could not be found.' }

  // Child rows that point at a person and are safe to repoint wholesale.
  const repoint: { table: string; column: string }[] = [
    { table: 'observations', column: 'person_id' },
    { table: 'professional_facts', column: 'person_id' },
    { table: 'notes', column: 'person_id' },
    { table: 'commitments', column: 'person_id' },
    { table: 'source_person_links', column: 'person_id' },
    { table: 'research_jobs', column: 'person_id' },
  ]

  for (const { table, column } of repoint) {
    const { error } = await supabase
      .from(table as 'observations')
      .update({ [column]: keepId } as never)
      .eq('user_id', user.id)
      .eq(column, mergeId)

    if (error) {
      logger.error('people.merge_failed', { table, code: error.code })
      return { error: 'The merge could not be completed. Nothing was changed.' }
    }
  }

  // Join tables carry a composite key, so a blind repoint can collide with a
  // row that already exists for the surviving person. Move only the ones that
  // would not collide, and drop the rest as genuine duplicates. Written out
  // twice rather than looped: the key column differs, and the typed client
  // cannot follow a dynamic one.
  {
    const [{ data: moving }, { data: existing }] = await Promise.all([
      supabase
        .from('interaction_participants')
        .select('interaction_id')
        .eq('user_id', user.id)
        .eq('person_id', mergeId),
      supabase
        .from('interaction_participants')
        .select('interaction_id')
        .eq('user_id', user.id)
        .eq('person_id', keepId),
    ])
    const already = new Set((existing ?? []).map((r) => r.interaction_id))
    for (const row of moving ?? []) {
      if (already.has(row.interaction_id)) {
        await supabase
          .from('interaction_participants')
          .delete()
          .eq('user_id', user.id)
          .eq('person_id', mergeId)
          .eq('interaction_id', row.interaction_id)
      } else {
        await supabase
          .from('interaction_participants')
          .update({ person_id: keepId })
          .eq('user_id', user.id)
          .eq('person_id', mergeId)
          .eq('interaction_id', row.interaction_id)
      }
    }
  }

  {
    const [{ data: moving }, { data: existing }] = await Promise.all([
      supabase
        .from('meeting_attendees')
        .select('meeting_id')
        .eq('user_id', user.id)
        .eq('person_id', mergeId),
      supabase
        .from('meeting_attendees')
        .select('meeting_id')
        .eq('user_id', user.id)
        .eq('person_id', keepId),
    ])
    const already = new Set((existing ?? []).map((r) => r.meeting_id))
    for (const row of moving ?? []) {
      if (already.has(row.meeting_id)) {
        await supabase
          .from('meeting_attendees')
          .delete()
          .eq('user_id', user.id)
          .eq('person_id', mergeId)
          .eq('meeting_id', row.meeting_id)
      } else {
        await supabase
          .from('meeting_attendees')
          .update({ person_id: keepId })
          .eq('user_id', user.id)
          .eq('person_id', mergeId)
          .eq('meeting_id', row.meeting_id)
      }
    }
  }

  // Archived, not deleted: a merge is a judgement, and a wrong one must be
  // recoverable.
  await supabase
    .from('people')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', mergeId)
    .eq('user_id', user.id)

  await track('people_merged')
  revalidatePath('/people')
  revalidatePath(`/people/${keepId}`)
  return { message: 'Merged. The other record has been archived.' }
}

// =============================================================================
// PHOTOS
// =============================================================================

/**
 * Attach a photo to a person. The rules (size, type, private folder, fixed
 * path, active people only) are in lib/people/photos.server, shared with the
 * phone's route.
 */
export async function uploadPersonPhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = formData.get('personId')?.toString()
  const file = formData.get('photo')
  if (!personId || !(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image first.' }
  }

  const user = await requireUser()
  const supabase = await createClient()
  const result = await savePersonPhoto(supabase, user.id, personId, file)
  if (!result.ok) return { error: result.error }

  await track('person_photo_uploaded', {
    bytesBucket: file.size < 300_000 ? '<300kb' : '300kb-2mb',
  })

  revalidatePath(`/people/${personId}`)
  revalidatePath(`/people/${personId}/edit`)
  revalidatePath('/people')
  return { message: 'Photo saved.' }
}

export async function removePersonPhoto(personId: string): Promise<ActionState> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await clearPersonPhoto(supabase, user.id, personId)
  if (!result.ok) return { error: result.error }

  revalidatePath(`/people/${personId}`)
  revalidatePath(`/people/${personId}/edit`)
  revalidatePath('/people')
  return { message: 'Photo removed.' }
}
