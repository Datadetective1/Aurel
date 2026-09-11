/**
 * SPEAKERS
 * =============================================================================
 * Who is talking in a transcript, and whether we already know them.
 *
 * Pure. Used by the capture form (suggest people as the words arrive), the
 * conversation page (suggest people after the reading), and the attribution
 * step (which loops belong to a person who was added late).
 *
 * The first production conversation exposed the gap this closes: a transcript
 * between Amary and Adama, a picker that only offered existing People, and a
 * user who picked the wrong one just to continue. Nothing here creates a
 * person. It only says who appears and who they might be.
 * =============================================================================
 */

export interface SpeakerLabel {
  /** As written in the transcript: "Adama", "Ravi Menon". */
  label: string
  /** How many lines they spoke. Order of appearance breaks ties. */
  lines: number
}

const LABEL_LINE = /^\s*(?:\[[^\]]*\]\s*)?([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\s*[:–-]\s+\S/

const SELF_LABELS = new Set(['me', 'you', 'i', 'myself', 'self'])

/** Words that look like a label but are headings or speaker roles, not people. */
const NOT_A_PERSON = new Set([
  'note',
  'notes',
  'summary',
  'action',
  'actions',
  'agenda',
  'decision',
  'decisions',
  'question',
  'questions',
  'todo',
  'speaker',
  'unknown',
  'transcript',
  'recording',
  'interviewer',
  'moderator',
  'host',
  'q',
  'a',
])

/** Speaker labels in a transcript, most talkative first. */
export function detectSpeakerLabels(text: string): SpeakerLabel[] {
  const counts = new Map<string, { label: string; lines: number; first: number }>()
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((line, index) => {
    const match = line.match(LABEL_LINE)
    if (!match?.[1]) return
    const label = match[1].trim()
    const key = normalise(label)
    if (NOT_A_PERSON.has(key) || /^speaker\s*\d+$/i.test(label)) return
    const entry = counts.get(key)
    if (entry) entry.lines++
    else counts.set(key, { label, lines: 1, first: index })
  })
  return [...counts.values()]
    .sort((a, b) => b.lines - a.lines || a.first - b.first)
    .map(({ label, lines }) => ({ label, lines }))
}

export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a label is the account holder, given their names. */
export function isSelfLabel(label: string, userNames: (string | null | undefined)[]): boolean {
  const key = normalise(label)
  if (SELF_LABELS.has(key)) return true
  for (const name of userNames) {
    if (!name) continue
    const full = normalise(name)
    if (!full) continue
    if (key === full) return true
    const first = full.split(' ')[0]
    if (first && key === first) return true
    // "A. Coulibaly" / "Amary C."
    const parts = full.split(' ')
    if (parts.length > 1 && key === `${parts[0]![0]} ${parts[parts.length - 1]}`) return true
    if (parts.length > 1 && key === `${parts[0]} ${parts[parts.length - 1]![0]}`) return true
  }
  return false
}

export interface KnownPerson {
  id: string
  fullName: string
  preferredName: string | null
}

export type PersonMatch =
  | { kind: 'exact'; person: KnownPerson }
  | { kind: 'probable'; person: KnownPerson; reason: string }
  | { kind: 'none' }

/**
 * Who a label might be, among the people already on record.
 *
 * Exact: the same full name, or the same preferred name. Probable: the same
 * first name, or the label is one word that opens a full name. The caller
 * shows a probable match first and lets the user decide; it never links on
 * its own.
 */
export function matchPerson(label: string, people: KnownPerson[]): PersonMatch {
  const key = normalise(label)
  if (!key) return { kind: 'none' }

  for (const person of people) {
    if (normalise(person.fullName) === key) return { kind: 'exact', person }
    if (person.preferredName && normalise(person.preferredName) === key)
      return { kind: 'exact', person }
  }

  const keyFirst = key.split(' ')[0]!
  const keyWords = key.split(' ')
  for (const person of people) {
    const full = normalise(person.fullName)
    const words = full.split(' ')
    const first = words[0]!
    if (keyWords.length === 1 && first === key) {
      return { kind: 'probable', person, reason: `First name matches ${person.fullName}` }
    }
    if (keyWords.length > 1 && words.length === 1 && keyFirst === first) {
      return { kind: 'probable', person, reason: `${person.fullName} may be the same person` }
    }
    // "Ravi M." or "Ravi Menon" against Ravi Menon: same first name, and the
    // last word is the surname or opens it.
    if (
      keyWords.length > 1 &&
      words.length > 1 &&
      keyFirst === first &&
      words[words.length - 1]!.startsWith(keyWords[keyWords.length - 1]!)
    ) {
      return { kind: 'probable', person, reason: `Same first and last name as ${person.fullName}` }
    }
    if (person.preferredName && normalise(person.preferredName) === keyFirst) {
      return {
        kind: 'probable',
        person,
        reason: `${person.preferredName} is ${person.fullName}'s preferred name`,
      }
    }
  }

  return { kind: 'none' }
}

/** Rank people for a typed query: exact first, then probable, then contains. */
export function rankPeople<T extends KnownPerson>(
  query: string,
  people: T[],
): { person: T; match: PersonMatch['kind'] | 'contains' }[] {
  const key = normalise(query)
  if (!key) return people.slice(0, 8).map((person) => ({ person, match: 'contains' as const }))
  const match = matchPerson(query, people)
  const ranked: { person: T; match: PersonMatch['kind'] | 'contains' }[] = []
  const seen = new Set<string>()
  if (match.kind !== 'none') {
    const found = people.find((p) => p.id === match.person.id)
    if (found) {
      ranked.push({ person: found, match: match.kind })
      seen.add(found.id)
    }
  }
  for (const person of people) {
    if (seen.has(person.id)) continue
    const hay = `${normalise(person.fullName)} ${normalise(person.preferredName ?? '')}`
    if (hay.includes(key)) {
      ranked.push({ person, match: 'contains' })
      seen.add(person.id)
    }
  }
  return ranked.slice(0, 8)
}

/**
 * Speakers in a transcript who are neither the user nor a current
 * participant, with the best guess at who they are. This is what the
 * "Adama appears in this conversation" prompt is built from.
 */
export function unknownSpeakers(
  text: string,
  input: {
    userNames: (string | null | undefined)[]
    participants: KnownPerson[]
    people: KnownPerson[]
  },
): { label: string; lines: number; match: PersonMatch }[] {
  const participantIds = new Set(input.participants.map((p) => p.id))
  return detectSpeakerLabels(text)
    .filter((s) => !isSelfLabel(s.label, input.userNames))
    .filter((s) => {
      // Already in the room under this name? Then nothing to suggest.
      const m = matchPerson(s.label, input.participants)
      return m.kind === 'none'
    })
    .map((s) => ({
      label: s.label,
      lines: s.lines,
      match: matchPerson(
        s.label,
        input.people.filter((p) => !participantIds.has(p.id)),
      ),
    }))
}

/**
 * The speaker an excerpt was recorded under, when the excerpt kept its label.
 * "Adama: I'll send the requirements" -> "Adama".
 */
export function excerptSpeaker(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null
  const match = excerpt.match(LABEL_LINE)
  return match?.[1]?.trim() ?? null
}

/** Whether a speaker label refers to this person. */
export function labelIsPerson(label: string, person: KnownPerson): boolean {
  const m = matchPerson(label, [person])
  return m.kind === 'exact' || m.kind === 'probable'
}
