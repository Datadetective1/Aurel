import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { DIMENSION_BY_ID, type DimensionId } from '@/lib/assessment/instrument'
import { describeDimension, scoreResponses } from '@/lib/assessment/scoring'
import type {
  CommitmentContext,
  InteractionContext,
  MeetingContext,
  ObservationContext,
  PersonContext,
  ProfessionalFactContext,
  PublicSourceContext,
  UserContext,
} from './types'

type Client = SupabaseClient<Database>

/**
 * CONTEXT ASSEMBLY
 * =============================================================================
 * Turns database rows into the bounded context shapes a prompt is allowed to
 * see. Two rules govern everything here:
 *
 *   1. Every query is scoped by user_id in addition to RLS. RLS is the security
 *      boundary; the explicit filter is defence in depth and makes the indexes
 *      work. If one were ever removed, the other still holds.
 *
 *   2. Only observations with status='active' are ever loaded. Proposed memories
 *      are invisible to generation until a human has approved them, which is
 *      what stops the model from citing its own earlier guesses back to itself.
 * =============================================================================
 */

/** How much history a prompt sees. Enough to be useful, bounded enough to stay cheap. */
const RECENT_INTERACTION_LIMIT = 6
const OBSERVATION_LIMIT = 40
const PROFESSIONAL_FACT_LIMIT = 24

/**
 * Order facts so identity comes first and speculation last.
 *
 * Within the same evidence level, a fact with a stated date beats one without:
 * "VP Engineering, as of March" is worth more than an undated title scraped
 * from a page that could be five years old.
 */
const FACT_KIND_ORDER = [
  'current_role',
  'current_organization',
  'location',
  'expertise',
  'education',
  'prior_role',
  'publication',
  'appearance',
  'theme',
  'communication_signal',
  'other',
]

const EVIDENCE_ORDER: Record<string, number> = {
  confirmed: 0,
  observed: 1,
  inferred: 2,
  unknown: 3,
}

function sortFacts(facts: ProfessionalFactContext[]): ProfessionalFactContext[] {
  return [...facts].sort((a, b) => {
    const byEvidence =
      (EVIDENCE_ORDER[a.evidenceLevel] ?? 9) - (EVIDENCE_ORDER[b.evidenceLevel] ?? 9)
    if (byEvidence !== 0) return byEvidence
    const byKind =
      (FACT_KIND_ORDER.indexOf(a.kind) + 1 || 99) - (FACT_KIND_ORDER.indexOf(b.kind) + 1 || 99)
    if (byKind !== 0) return byKind
    return (b.asOf ?? '').localeCompare(a.asOf ?? '')
  })
}

function displayNameOf(fullName: string, preferred: string | null) {
  return preferred?.trim() || fullName
}

function isOverdue(dueOn: string | null): boolean {
  if (!dueOn) return false
  return dueOn < new Date().toISOString().slice(0, 10)
}

// =============================================================================
// USER
// =============================================================================

export async function getUserContext(supabase: Client, userId: string): Promise<UserContext> {
  const [{ data: profile }, { data: assessment }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, preferred_name, job_title, company, coaching_style')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('assessments')
      .select('id, scores, archetype, coverage, consistency, instrument_version')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let interactionProfile: UserContext['interactionProfile'] = null

  if (assessment?.archetype && assessment.scores) {
    // Rebuild the derived view from stored scores rather than re-scoring the raw
    // responses: cheaper, and it keeps a historical profile stable even if the
    // instrument is revised later.
    const scores = assessment.scores as Record<string, number>
    const leanings = Object.entries(scores)
      .map(([id, score]) => {
        const dimension = DIMENSION_BY_ID[id as DimensionId]
        if (!dimension) return null
        const delta = score - 50
        const lean = Math.abs(delta) < 8 ? null : delta > 0 ? ('high' as const) : ('low' as const)
        if (!lean) return null
        const described = describeDimension({
          dimension: id as DimensionId,
          score,
          raw: 0,
          contributions: 0,
          consistency: null,
          lean,
          distinctiveness: Math.abs(delta) / 50,
        })
        return {
          label: described.label,
          pole: described.pole,
          blurb: described.blurb,
          delta: Math.abs(delta),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5)
      .map(({ label, pole, blurb }) => ({ label, pole, blurb }))

    const coverage = Number(assessment.coverage ?? 0)
    const consistency = Number(assessment.consistency ?? 0)
    const confidence =
      coverage === 1 && consistency >= 0.6
        ? ('strong' as const)
        : coverage >= 0.875 && consistency >= 0.4
          ? ('moderate' as const)
          : ('provisional' as const)

    interactionProfile = { archetype: assessment.archetype, confidence, leanings }
  }

  return {
    id: userId,
    displayName: displayNameOf(profile?.full_name ?? 'You', profile?.preferred_name ?? null),
    jobTitle: profile?.job_title ?? null,
    company: profile?.company ?? null,
    coachingStyle: profile?.coaching_style ?? 'balanced',
    interactionProfile,
  }
}

// =============================================================================
// PEOPLE
// =============================================================================

/**
 * Load full context for a set of people in a fixed number of queries, regardless
 * of how many people are requested. A meeting brief for eight participants must
 * not become forty round trips.
 */
export async function getPeopleContext(
  supabase: Client,
  userId: string,
  personIds: string[],
): Promise<Map<string, PersonContext>> {
  const result = new Map<string, PersonContext>()
  if (personIds.length === 0) return result

  const [
    people,
    observations,
    sources,
    participations,
    commitments,
    personTopics,
    professionalFacts,
    factSources,
    publicSources,
  ] = await Promise.all([
    supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, job_title, email, relationship_type, relevance, notes, first_interaction_at, last_interaction_at, last_researched_at, organization_id, organizations(name)',
      )
      .eq('user_id', userId)
      .in('id', personIds),
    supabase
      .from('observations')
      .select(
        'id, person_id, content, category, evidence_level, reinforcement_count, last_reinforced_at',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('person_id', personIds)
      .order('reinforcement_count', { ascending: false })
      .limit(OBSERVATION_LIMIT * personIds.length),
    supabase
      .from('observation_sources')
      .select('observation_id, interaction_id, excerpt')
      .eq('user_id', userId),
    supabase
      .from('interaction_participants')
      .select('person_id, interactions(id, title, occurred_at, kind, summary, outcome, went_well)')
      .eq('user_id', userId)
      .in('person_id', personIds),
    supabase
      .from('commitments')
      .select('id, person_id, description, owner, owner_person_id, due_on')
      .eq('user_id', userId)
      .eq('status', 'open')
      .in('person_id', personIds),
    supabase
      .from('person_topics')
      .select('person_id, topics(label)')
      .eq('user_id', userId)
      .in('person_id', personIds),
    // Only current facts. A superseded title is history, not context.
    supabase
      .from('professional_facts')
      .select('id, person_id, kind, value, detail, evidence_level, as_of, has_conflict')
      .eq('user_id', userId)
      .eq('is_current', true)
      .in('person_id', personIds)
      .limit(PROFESSIONAL_FACT_LIMIT * personIds.length),
    supabase
      .from('fact_sources')
      .select('fact_id, sources(source_title, publisher)')
      .eq('user_id', userId),
    supabase
      .from('source_person_links')
      .select(
        'person_id, identity_match_status, sources(id, source_title, source_url, publisher, source_type, retrieved_at, published_at, access_status)',
      )
      .eq('user_id', userId)
      .in('person_id', personIds),
  ])

  const sourcesByObservation = new Map<
    string,
    { interactionId: string | null; excerpt: string | null }[]
  >()
  for (const s of sources.data ?? []) {
    const list = sourcesByObservation.get(s.observation_id) ?? []
    list.push({ interactionId: s.interaction_id, excerpt: s.excerpt })
    sourcesByObservation.set(s.observation_id, list)
  }

  const observationsByPerson = new Map<string, ObservationContext[]>()
  for (const o of observations.data ?? []) {
    const list = observationsByPerson.get(o.person_id) ?? []
    list.push({
      id: o.id,
      content: o.content,
      category: o.category,
      evidenceLevel: o.evidence_level,
      reinforcementCount: o.reinforcement_count,
      lastReinforcedAt: o.last_reinforced_at,
      sources: sourcesByObservation.get(o.id) ?? [],
    })
    observationsByPerson.set(o.person_id, list)
  }

  const interactionsByPerson = new Map<string, InteractionContext[]>()
  for (const row of participations.data ?? []) {
    const i = row.interactions
    if (!i) continue
    const list = interactionsByPerson.get(row.person_id) ?? []
    list.push({
      id: i.id,
      title: i.title,
      occurredAt: i.occurred_at,
      kind: i.kind,
      summary: i.summary,
      outcome: i.outcome,
      wentWell: i.went_well,
    })
    interactionsByPerson.set(row.person_id, list)
  }

  const nameById = new Map(
    (people.data ?? []).map((p) => [p.id, displayNameOf(p.full_name, p.preferred_name)]),
  )

  const commitmentsByPerson = new Map<string, CommitmentContext[]>()
  for (const c of commitments.data ?? []) {
    if (!c.person_id) continue
    const list = commitmentsByPerson.get(c.person_id) ?? []
    list.push({
      id: c.id,
      description: c.description,
      owner: c.owner,
      ownerName: c.owner_person_id ? (nameById.get(c.owner_person_id) ?? null) : null,
      dueOn: c.due_on,
      isOverdue: isOverdue(c.due_on),
    })
    commitmentsByPerson.set(c.person_id, list)
  }

  // A fact cites the sources that support it. A fact with none can never be
  // presented above 'inferred', which the ingest pipeline already enforces.
  const titlesByFact = new Map<string, string[]>()
  for (const row of factSources.data ?? []) {
    const title = row.sources?.source_title ?? row.sources?.publisher
    if (!title) continue
    const list = titlesByFact.get(row.fact_id) ?? []
    list.push(title)
    titlesByFact.set(row.fact_id, list)
  }

  const factsByPerson = new Map<string, ProfessionalFactContext[]>()
  for (const f of professionalFacts.data ?? []) {
    const list = factsByPerson.get(f.person_id) ?? []
    list.push({
      id: f.id,
      kind: f.kind,
      value: f.value,
      detail: f.detail,
      evidenceLevel: f.evidence_level,
      asOf: f.as_of,
      hasConflict: f.has_conflict,
      sourceTitles: titlesByFact.get(f.id) ?? [],
    })
    factsByPerson.set(f.person_id, list)
  }

  const publicSourcesByPerson = new Map<string, PublicSourceContext[]>()
  for (const row of publicSources.data ?? []) {
    const src = row.sources
    // A source we could not actually read is not evidence.
    if (!src || src.access_status !== 'analyzed') continue
    const list = publicSourcesByPerson.get(row.person_id) ?? []
    list.push({
      id: src.id,
      title: src.source_title,
      url: src.source_url,
      publisher: src.publisher,
      sourceType: src.source_type,
      retrievedAt: src.retrieved_at,
      publishedAt: src.published_at,
      identityStatus: row.identity_match_status,
    })
    publicSourcesByPerson.set(row.person_id, list)
  }

  const topicsByPerson = new Map<string, string[]>()
  for (const row of personTopics.data ?? []) {
    const label = row.topics?.label
    if (!label) continue
    const list = topicsByPerson.get(row.person_id) ?? []
    list.push(label)
    topicsByPerson.set(row.person_id, list)
  }

  for (const p of people.data ?? []) {
    const allObservations = observationsByPerson.get(p.id) ?? []
    const interactions = (interactionsByPerson.get(p.id) ?? []).sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    )

    result.set(p.id, {
      id: p.id,
      fullName: p.full_name,
      preferredName: p.preferred_name,
      displayName: displayNameOf(p.full_name, p.preferred_name),
      jobTitle: p.job_title,
      organization: p.organizations?.name ?? null,
      relationshipType: p.relationship_type,
      relevance: p.relevance,
      notes: p.notes,
      topics: topicsByPerson.get(p.id) ?? [],
      firstInteractionAt: p.first_interaction_at,
      lastInteractionAt: p.last_interaction_at,
      interactionCount: interactions.length,
      observations: {
        confirmed: allObservations.filter((o) => o.evidenceLevel === 'confirmed'),
        observed: allObservations.filter((o) => o.evidenceLevel === 'observed'),
        inferred: allObservations.filter((o) => o.evidenceLevel === 'inferred'),
      },
      recentInteractions: interactions.slice(0, RECENT_INTERACTION_LIMIT),
      openCommitments: commitmentsByPerson.get(p.id) ?? [],
      professionalFacts: sortFacts(factsByPerson.get(p.id) ?? []),
      publicSources: (publicSourcesByPerson.get(p.id) ?? []).sort((a, b) =>
        (b.retrievedAt ?? '').localeCompare(a.retrievedAt ?? ''),
      ),
      lastResearchedAt: p.last_researched_at,
    })
  }

  return result
}

export async function getPersonContext(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<PersonContext | null> {
  const map = await getPeopleContext(supabase, userId, [personId])
  return map.get(personId) ?? null
}

// =============================================================================
// MEETINGS
// =============================================================================

export async function getMeetingContext(
  supabase: Client,
  userId: string,
  meetingId: string,
): Promise<MeetingContext | null> {
  const { data: meeting } = await supabase
    .from('meetings')
    .select(
      'id, title, kind, scheduled_at, duration_minutes, objective, stakes, extra_context, importance',
    )
    .eq('user_id', userId)
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting) return null

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('person_id, role')
    .eq('user_id', userId)
    .eq('meeting_id', meetingId)

  const personIds = (attendees ?? []).map((a) => a.person_id)
  const people = await getPeopleContext(supabase, userId, personIds)

  const participants: PersonContext[] = []
  for (const attendee of attendees ?? []) {
    const person = people.get(attendee.person_id)
    if (person) participants.push({ ...person, meetingRole: attendee.role })
  }
  // Decision makers first: the brief should be ordered the way the room is worked.
  participants.sort(
    (a, b) => roleWeight(b.meetingRole) - roleWeight(a.meetingRole) || b.relevance - a.relevance,
  )

  return {
    id: meeting.id,
    title: meeting.title,
    kind: meeting.kind,
    scheduledAt: meeting.scheduled_at,
    durationMinutes: meeting.duration_minutes,
    objective: meeting.objective,
    stakes: meeting.stakes,
    extraContext: meeting.extra_context,
    importance: meeting.importance,
    participants,
  }
}

function roleWeight(role: string | undefined): number {
  switch (role) {
    case 'decision_maker':
      return 4
    case 'influencer':
      return 3
    case 'presenter':
      return 2
    case 'contributor':
      return 1
    default:
      return 0
  }
}

// =============================================================================
// TODAY
// =============================================================================

/** People with real history who have gone quiet, used for Today's watch list. */
export async function getQuietRelationships(supabase: Client, userId: string, thresholdDays = 30) {
  const cutoff = new Date(Date.now() - thresholdDays * 86_400_000).toISOString()
  const { data } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, last_interaction_at, relevance')
    .eq('user_id', userId)
    .is('archived_at', null)
    .not('last_interaction_at', 'is', null)
    .lt('last_interaction_at', cutoff)
    // Only relationships the user said matter. Nagging about every contact is noise.
    .gte('relevance', 4)
    .order('last_interaction_at', { ascending: true })
    .limit(5)

  return (data ?? []).map((p) => ({
    id: p.id,
    name: displayNameOf(p.full_name, p.preferred_name),
    daysSince: p.last_interaction_at
      ? Math.floor((Date.now() - new Date(p.last_interaction_at).getTime()) / 86_400_000)
      : 0,
  }))
}

export async function getOpenCommitments(supabase: Client, userId: string) {
  const { data } = await supabase
    .from('commitments')
    .select(
      'id, description, owner, due_on, person_id, people!commitments_person_id_fkey(full_name, preferred_name)',
    )
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(50)

  return (data ?? []).map((c) => ({
    id: c.id,
    description: c.description,
    owner: c.owner,
    ownerName: null,
    dueOn: c.due_on,
    isOverdue: isOverdue(c.due_on),
    personId: c.person_id,
    personName: c.people ? displayNameOf(c.people.full_name, c.people.preferred_name) : null,
  }))
}

/** Re-score a stored assessment from its raw responses. Used by the reveal page. */
export async function getScoredAssessment(supabase: Client, userId: string, assessmentId: string) {
  const { data } = await supabase
    .from('assessment_responses')
    .select('block_id, most_item_id, least_item_id')
    .eq('user_id', userId)
    .eq('assessment_id', assessmentId)
    .order('round_index', { ascending: true })

  return scoreResponses(
    (data ?? []).map((r) => ({
      blockId: r.block_id,
      mostItemId: r.most_item_id,
      leastItemId: r.least_item_id,
    })),
  )
}
