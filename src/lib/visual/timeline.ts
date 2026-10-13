/**
 * RELATIONSHIP MEMORY TIMELINE
 * =============================================================================
 * Everything already on record between the user and one person, as a single
 * dated sequence: conversations, meetings, promises made and kept, decisions,
 * notes, and things the user confirmed they learned.
 *
 * It composes nothing. Every entry's title is a string the record already
 * holds -- a conversation's title, a loop's description, a note's body -- and
 * every entry carries where it came from and how sure the record is, so a
 * timeline can never be prettier than its evidence. Only confirmed loops,
 * confirmed decisions and active memory reach it: proposals the user has not
 * reviewed are not memory yet.
 *
 * Pure, so the web person page and the native app build the same sequence.
 * =============================================================================
 */

export type TimelineKind =
  | 'upcoming'
  | 'meeting'
  | 'conversation'
  | 'commitment'
  | 'commitment_completed'
  | 'decision'
  | 'note'
  | 'memory'

export type TimelineEvidence = 'confirmed' | 'observed' | 'inferred' | 'unknown'

/** Where the entry came from. Mirrors the provenance vocabulary on claims. */
export type TimelineSource = 'records' | 'interactions' | 'public_research' | 'inference'

export interface TimelineEntry {
  id: string
  kind: TimelineKind
  /** ISO timestamp or YYYY-MM-DD date. */
  at: string
  title: string
  /** One line of context: who owes it, what kind of conversation. */
  context: string | null
  /** The underlying text, revealed on expand. Never shown by default. */
  detail: string | null
  href: string | null
  evidence: TimelineEvidence
  source: TimelineSource
}

export interface TimelineInput {
  personFirstName: string
  interactions?: {
    id: string
    title: string | null
    occurredAt: string
    kind: string
    summary: string | null
    outcome: string | null
    meetingId?: string | null
  }[]
  meetings?: { id: string; title: string; scheduledAt: string | null; status: string }[]
  loops?: {
    id: string
    description: string
    kind: string
    owner: string
    status: string
    reviewStatus?: string
    createdAt: string
    completedAt: string | null
    interactionId: string | null
    excerpt?: string | null
  }[]
  decisions?: {
    id: string
    description: string
    context: string | null
    decidedOn: string
    reviewStatus?: string
    interactionId: string | null
  }[]
  notes?: { id: string; body: string; createdAt: string }[]
  memories?: {
    id: string
    content: string
    createdAt: string
    evidenceLevel: TimelineEvidence
    sourceKind: string | null
  }[]
}

const INTERACTION_LABEL: Record<string, string> = {
  meeting: 'Meeting',
  call: 'Call',
  email: 'Email',
  message: 'Message',
  informal: 'Conversation',
  other: 'Conversation',
}

function firstLine(text: string, max = 120): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? text.trim()
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function ownerContext(owner: string, first: string): string {
  if (owner === 'user') return 'You promised'
  if (owner === 'person') return `${first} promised`
  return 'Between you'
}

/** Sort key: date-only values sort as the start of that day. */
function sortKey(at: string): string {
  return at.length === 10 ? `${at}T00:00:00.000Z` : at
}

export function buildTimeline(input: TimelineInput, now: Date = new Date()): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const first = input.personFirstName

  const meetingsWithConversation = new Set<string>()

  for (const i of input.interactions ?? []) {
    if (i.meetingId) meetingsWithConversation.add(i.meetingId)
    entries.push({
      id: `interaction:${i.id}`,
      kind: 'conversation',
      at: i.occurredAt,
      title: i.title?.trim() || INTERACTION_LABEL[i.kind] || 'Conversation',
      context: INTERACTION_LABEL[i.kind] ?? 'Conversation',
      detail: i.outcome ?? i.summary ?? null,
      href: `/conversations/${i.id}`,
      evidence: 'observed',
      source: 'interactions',
    })
  }

  for (const m of input.meetings ?? []) {
    if (!m.scheduledAt || m.status === 'cancelled') continue
    const upcoming = new Date(m.scheduledAt).getTime() > now.getTime()
    if (!upcoming && meetingsWithConversation.has(m.id)) continue
    entries.push({
      id: `meeting:${m.id}`,
      kind: upcoming ? 'upcoming' : 'meeting',
      at: m.scheduledAt,
      title: m.title,
      context: upcoming ? 'Coming up' : 'Meeting',
      detail: null,
      href: `/meetings/${m.id}/brief`,
      evidence: 'confirmed',
      source: 'records',
    })
  }

  for (const l of input.loops ?? []) {
    if (l.reviewStatus && l.reviewStatus !== 'confirmed') continue
    const href = l.interactionId ? `/conversations/${l.interactionId}` : '/loops'
    entries.push({
      id: `loop:${l.id}`,
      kind: 'commitment',
      at: l.createdAt,
      title: firstLine(l.description),
      context: l.kind === 'question' ? 'Left unanswered' : ownerContext(l.owner, first),
      detail: l.excerpt ?? null,
      href,
      evidence: 'confirmed',
      source: l.interactionId ? 'interactions' : 'records',
    })
    if (l.status === 'done' && l.completedAt) {
      entries.push({
        id: `loop-done:${l.id}`,
        kind: 'commitment_completed',
        at: l.completedAt,
        title: firstLine(l.description),
        context: 'Closed',
        detail: null,
        href,
        evidence: 'confirmed',
        source: 'records',
      })
    }
  }

  for (const d of input.decisions ?? []) {
    if (d.reviewStatus && d.reviewStatus !== 'confirmed') continue
    entries.push({
      id: `decision:${d.id}`,
      kind: 'decision',
      at: d.decidedOn,
      title: firstLine(d.description),
      context: 'Decided together',
      detail: d.context,
      href: d.interactionId ? `/conversations/${d.interactionId}` : null,
      evidence: 'confirmed',
      source: d.interactionId ? 'interactions' : 'records',
    })
  }

  for (const n of input.notes ?? []) {
    entries.push({
      id: `note:${n.id}`,
      kind: 'note',
      at: n.createdAt,
      title: firstLine(n.body, 90),
      context: 'Your note',
      detail: n.body.length > 90 ? n.body : null,
      href: null,
      evidence: 'confirmed',
      source: 'records',
    })
  }

  for (const m of input.memories ?? []) {
    entries.push({
      id: `memory:${m.id}`,
      kind: 'memory',
      at: m.createdAt,
      title: firstLine(m.content),
      context: 'Learned',
      detail: m.content.length > 120 ? m.content : null,
      href: null,
      evidence: m.evidenceLevel,
      source:
        m.sourceKind === 'ai_inference'
          ? 'inference'
          : m.sourceKind === 'interaction' || m.sourceKind === 'debrief'
            ? 'interactions'
            : 'records',
    })
  }

  // Newest first. Upcoming entries float above the past, soonest first.
  const upcoming = entries
    .filter((e) => e.kind === 'upcoming')
    .sort((a, b) => sortKey(a.at).localeCompare(sortKey(b.at)))
  const past = entries
    .filter((e) => e.kind !== 'upcoming')
    .sort((a, b) => sortKey(b.at).localeCompare(sortKey(a.at)))
  return [...upcoming, ...past]
}

/** Human labels for each kind, shared by the web and native renderers. */
export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  upcoming: 'Coming up',
  meeting: 'Meeting',
  conversation: 'Conversation',
  commitment: 'Commitment',
  commitment_completed: 'Commitment kept',
  decision: 'Decision',
  note: 'Note',
  memory: 'Learned',
}
