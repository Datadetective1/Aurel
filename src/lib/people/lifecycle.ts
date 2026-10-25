/**
 * A PERSON'S LIFE IN THE RECORD
 * =============================================================================
 * Three states, each chosen by the user:
 *
 *   active    on every list, in every picker, matched in new conversations
 *   archived  out of every active workflow -- new meetings, research,
 *             conversation matching, search, Today, follow-through -- but
 *             their history stays exactly where it was. Reversible.
 *   deleted   gone, with what was only about them. What also belongs to
 *             something else stays, unlinked: a conversation keeps its words,
 *             a meeting keeps its notes, a promise the user made keeps being a
 *             promise. Not reversible, and only from archived.
 *
 * The rules that need no database are here, so they are tested directly; the
 * reads and writes are in lifecycle.server.
 * =============================================================================
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids arrive from the client; only a well-formed one reaches a query. */
export function isPersonId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export interface PersonNames {
  full_name: string
  preferred_name: string | null
}

/** Every name a sentence might use for this person, longest first. */
export function namesFor(person: PersonNames): string[] {
  const names = new Set<string>()
  const add = (n: string | null | undefined) => {
    const t = (n ?? '').trim()
    if (t.length >= 2) names.add(t)
  }
  add(person.full_name)
  add(person.preferred_name)
  // A first name on its own is how most notes refer to someone. Two letters
  // is too ambiguous to flag ("Al" in "also" is already excluded by word
  // boundaries, but "Jo" still matches too much prose).
  for (const n of [person.full_name, person.preferred_name]) {
    const first = (n ?? '').trim().split(/\s+/)[0]
    if (first && first.length >= 3) add(first)
  }
  return [...names].sort((a, b) => b.length - a.length)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether a text names the person, as a whole word, ignoring case. */
export function mentions(text: string | null | undefined, names: string[]): boolean {
  if (!text) return false
  return names.some((name) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(text),
  )
}

// --- duplicates ------------------------------------------------------------------

export interface DuplicateCandidate {
  id: string
  full_name: string
  preferred_name: string | null
  email: string | null
  profile_url: string | null
  archived_at: string | null
  organization: string | null
}

export interface DuplicateInput {
  fullName: string
  email?: string | null
  profileUrl?: string | null
}

export type DuplicateReason = 'email' | 'profile' | 'name'

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * The record this new person most likely already is. The same three signals
 * the duplicate review trusts -- email, profile link, the identical name --
 * strongest first. Active records win over archived ones on a tie, so the
 * suggestion is "open" before it is "restore".
 */
export function matchDuplicate(
  candidates: DuplicateCandidate[],
  input: DuplicateInput,
): { candidate: DuplicateCandidate; reason: DuplicateReason } | null {
  const checks: [DuplicateReason, (c: DuplicateCandidate) => boolean][] = [
    ['email', (c) => Boolean(norm(input.email)) && norm(c.email) === norm(input.email)],
    [
      'profile',
      (c) => Boolean(norm(input.profileUrl)) && norm(c.profile_url) === norm(input.profileUrl),
    ],
    ['name', (c) => Boolean(norm(input.fullName)) && norm(c.full_name) === norm(input.fullName)],
  ]
  const ordered = [...candidates].sort(
    (a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)),
  )
  for (const [reason, test] of checks) {
    const hit = ordered.find(test)
    if (hit) return { candidate: hit, reason }
  }
  return null
}

/** Escape a value for a Postgres ILIKE that must match it literally. */
export function literalLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// --- what a permanent delete does ---------------------------------------------------

export interface RetainedLoop {
  id: string
  description: string
  status: string
  /** The text names the person, so it keeps identifying them after the delete. */
  mentionsPerson: boolean
}

export interface DeletionPreview {
  person: { id: string; name: string; archivedAt: string | null }
  /** Removed with the person. Only things that were about them alone. */
  deleted: {
    observations: number
    notes: number
    facts: number
    sources: number
    researchRuns: number
    photo: boolean
  }
  /** Kept, with this person's link to them removed. */
  unlinked: {
    loops: number
    meetings: number
    conversations: number
    decisions: number
    notes: number
    briefCitations: number
  }
  /** Every loop that stays; the ones whose text names them are flagged. */
  retainedLoops: RetainedLoop[]
}

/** The confirmation's three lists, in words, with nothing at zero. */
export function describeDeletion(preview: DeletionPreview): {
  deleted: string[]
  unlinked: string[]
  identifyingLoops: number
} {
  const n = (count: number, one: string, many: string) =>
    count === 1 ? `1 ${one}` : `${count} ${many}`
  const d = preview.deleted
  const u = preview.unlinked
  const deleted = [
    d.observations > 0
      ? n(d.observations, 'thing you noted about them', 'things you noted about them')
      : null,
    d.notes > 0 ? n(d.notes, 'note about them', 'notes about them') : null,
    d.facts > 0 ? n(d.facts, 'researched fact', 'researched facts') : null,
    d.sources > 0 ? n(d.sources, 'public source about them', 'public sources about them') : null,
    d.researchRuns > 0 ? n(d.researchRuns, 'research run', 'research runs') : null,
    d.photo ? 'their photo' : null,
  ].filter((x): x is string => Boolean(x))
  const unlinked = [
    u.loops > 0 ? n(u.loops, 'loop', 'loops') : null,
    u.meetings > 0 ? n(u.meetings, 'meeting', 'meetings') : null,
    u.conversations > 0 ? n(u.conversations, 'conversation', 'conversations') : null,
    u.decisions > 0 ? n(u.decisions, 'decision', 'decisions') : null,
    u.notes > 0
      ? n(u.notes, 'meeting or conversation note', 'meeting or conversation notes')
      : null,
    u.briefCitations > 0 ? n(u.briefCitations, 'citation in a brief', 'citations in briefs') : null,
  ].filter((x): x is string => Boolean(x))
  return {
    deleted,
    unlinked,
    identifyingLoops: preview.retainedLoops.filter((l) => l.mentionsPerson).length,
  }
}
