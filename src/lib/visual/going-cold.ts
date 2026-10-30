import { daysBetween, dayKeyIn, todayIn } from '@/lib/tz'

/**
 * GOING COLD
 * =============================================================================
 * An important relationship nobody has touched in weeks, and, when the record
 * holds one, a reason to get back in touch tied to that person's latest
 * public news.
 *
 * Important means the user marked them 4 or 5. Weeks means COLD_AFTER_DAYS
 * since the last kept conversation, or since they were added when there has
 * been none.
 *
 * The reason is a suggestion, so it is always labelled Inferred, whatever
 * the evidence behind the fact it rests on. It rests only on facts held at
 * confirmed or observed, taken from public sources the user kept: an
 * inferred fact is not enough to put words in the user's mouth.
 *
 * Pure. The route loads the rows; this decides who and why.
 * =============================================================================
 */

export const COLD_AFTER_DAYS = 28
/** News older than this is not "latest". */
export const NEWS_WINDOW_DAYS = 180
export const MAX_COLD = 5

export interface ColdPerson {
  id: string
  name: string
  relevance: number
  lastInteractionAt: string | null
  createdAt: string
}

export interface ColdFact {
  personId: string
  kind: string
  value: string
  detail: string | null
  evidence: 'confirmed' | 'observed' | 'inferred' | 'unknown'
  firstSeenAt: string
  asOf: string | null
  source: { title: string | null; url: string | null; publishedAt: string | null } | null
}

export interface ReachOutReason {
  text: string
  /** Always inferred: the suggestion is Atturel's, not the source's. */
  evidence: 'inferred'
  sourceTitle: string | null
  sourceUrl: string | null
  /** The day the news is dated, YYYY-MM-DD. */
  datedOn: string | null
}

export interface ColdRelationship {
  personId: string
  /** Whole days since the last conversation, or since they were added. */
  daysQuiet: number
  neverSpoke: boolean
  reason: ReachOutReason | null
}

const NEWS_KINDS = new Set(['publication', 'appearance', 'current_role', 'current_organization'])

function newsDay(fact: ColdFact, timeZone: string): string | null {
  const raw = fact.source?.publishedAt ?? fact.asOf ?? fact.firstSeenAt
  return raw ? (dayKeyIn(raw, timeZone) ?? raw.slice(0, 10)) : null
}

function phrase(fact: ColdFact, first: string): string {
  const value = fact.value.trim()
  switch (fact.kind) {
    case 'publication':
      return `${first} published "${value}". A line on what you took from it is an easy reason to write.`
    case 'appearance':
      return `${first} appeared at ${value}. Asking how it went is an easy way back in.`
    case 'current_role':
      return `${first} is now ${value}. A short note of congratulations is an easy way back in.`
    default:
      return `${first} is now at ${value}. Asking how the move is going is an easy way back in.`
  }
}

/**
 * The newest public item worth mentioning: dated after the last conversation
 * (so it is news to this relationship) and inside the news window.
 */
export function reasonFor(
  person: ColdPerson,
  facts: ColdFact[],
  timeZone: string,
  now: Date = new Date(),
): ReachOutReason | null {
  const today = todayIn(timeZone, now)
  const lastSpoke = person.lastInteractionAt
    ? (dayKeyIn(person.lastInteractionAt, timeZone) ?? null)
    : null
  const first = person.name.split(/\s+/)[0] || person.name
  const candidates = facts
    .filter((f) => f.personId === person.id)
    .filter((f) => NEWS_KINDS.has(f.kind))
    .filter((f) => f.evidence === 'confirmed' || f.evidence === 'observed')
    .map((f) => ({ fact: f, day: newsDay(f, timeZone) }))
    .filter((r): r is { fact: ColdFact; day: string } => r.day !== null)
    .filter((r) => daysBetween(r.day, today) <= NEWS_WINDOW_DAYS && r.day <= today)
    .filter((r) => !lastSpoke || r.day > lastSpoke)
    .sort((a, b) => b.day.localeCompare(a.day))
  const best = candidates[0]
  if (!best) return null
  return {
    text: phrase(best.fact, first),
    evidence: 'inferred',
    sourceTitle: best.fact.source?.title ?? null,
    sourceUrl: best.fact.source?.url ?? null,
    datedOn: best.day,
  }
}

export function goingCold(
  people: ColdPerson[],
  facts: ColdFact[],
  timeZone: string,
  now: Date = new Date(),
): ColdRelationship[] {
  const today = todayIn(timeZone, now)
  return people
    .filter((p) => p.relevance >= 4)
    .map((p) => {
      const from = p.lastInteractionAt ?? p.createdAt
      const day = dayKeyIn(from, timeZone) ?? from.slice(0, 10)
      return { p, daysQuiet: daysBetween(day, today) }
    })
    .filter((r) => r.daysQuiet >= COLD_AFTER_DAYS)
    .sort((a, b) => b.p.relevance - a.p.relevance || b.daysQuiet - a.daysQuiet)
    .slice(0, MAX_COLD)
    .map(({ p, daysQuiet }) => ({
      personId: p.id,
      daysQuiet,
      neverSpoke: !p.lastInteractionAt,
      reason: reasonFor(p, facts, timeZone, now),
    }))
}

/** "5 weeks", "2 months": how long, at the grain a person thinks in. */
export function quietFor(days: number): string {
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.floor(days / 7)} weeks`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}
