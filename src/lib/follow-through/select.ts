import { daysBetween } from '@/lib/tz'

/**
 * FOLLOW-THROUGH SELECTION
 * =============================================================================
 * Which open loops are worth an email today, and how each one is said.
 *
 * Pure. The scheduled job and the "send it to me now" button both call this
 * with rows they already loaded, so what goes in the inbox is decided in one
 * place and tested in one place.
 *
 * The rule that matters: the email says who owes what. "You said you'd" is
 * the user's promise; "Ravi said they'd" is Ravi's; "Still unanswered" is a
 * question nobody has settled. The product never tells the user to do
 * something that belongs to someone else.
 * =============================================================================
 */

export interface DigestLoop {
  id: string
  description: string
  kind: 'commitment' | 'question' | 'follow_up'
  owner: 'user' | 'person' | 'shared'
  status: 'open' | 'done' | 'later' | 'cancelled' | 'dropped'
  reviewStatus: 'proposed' | 'confirmed' | 'rejected'
  dueOn: string | null
  deferredUntil: string | null
  createdAt: string
  personId: string | null
  personName: string | null
  interactionId: string | null
  interactionTitle: string | null
  /** When the source conversation happened, YYYY-MM-DD or null. */
  interactionDay: string | null
}

export type TimingTone = 'overdue' | 'today' | 'soon' | 'waiting' | 'open'

export interface DigestItem {
  loop: DigestLoop
  /** "You said you'd send the proposal." */
  phrase: string
  timing: { label: string; tone: TimingTone }
  /** "Promised in Budget sync, 24 Aug" or null when the loop was typed. */
  source: string | null
}

export interface Selection {
  items: DigestItem[]
  /** Loops that qualified but did not fit. Named in the email as a count. */
  more: number
  /** How many are the user's own promises, for the subject line. */
  yours: number
}

/** More than this and the email stops being readable in seconds. */
export const MAX_ITEMS = 8

/** Undated loops are raised once a week, not every morning. */
const UNDATED_WEEKDAY = 1 // Monday

/** An undated loop younger than this is not yet worth a nudge. */
const UNDATED_MIN_AGE_DAYS = 3

/**
 * Whether a loop is active on the given day: confirmed, and either open or
 * deferred to a date that has arrived. Done, cancelled, dropped and anything
 * unconfirmed are never emailed.
 */
export function isActiveOn(loop: DigestLoop, today: string): boolean {
  if (loop.reviewStatus !== 'confirmed') return false
  if (loop.status === 'open') return true
  if (loop.status === 'later') return Boolean(loop.deferredUntil && loop.deferredUntil <= today)
  return false
}

type Bucket = 'overdue' | 'today' | 'tomorrow' | 'undated'

function bucketFor(loop: DigestLoop, today: string, weekday: number): Bucket | null {
  if (loop.dueOn) {
    if (loop.dueOn < today) return 'overdue'
    if (loop.dueOn === today) return 'today'
    // "Approaching soon" means tomorrow, and only for the user's own promise:
    // it is the one they can still act on today. Somebody else's due-tomorrow
    // is not the user's to chase yet.
    if (loop.owner === 'user' && daysBetween(today, loop.dueOn) === 1) return 'tomorrow'
    return null
  }
  // Undated loops would otherwise appear every single morning, which is how a
  // reminder becomes noise. Once a week, and only once they have had a few
  // days to resolve on their own.
  if (weekday !== UNDATED_WEEKDAY) return null
  const age = daysBetween(loop.createdAt.slice(0, 10), today)
  if (age < UNDATED_MIN_AGE_DAYS) return null
  return 'undated'
}

const BUCKET_RANK: Record<Bucket, number> = { overdue: 0, today: 1, tomorrow: 2, undated: 3 }

/**
 * Select and order what today's email should carry.
 *
 * `today` is the user's own calendar day; `weekday` is its day of week
 * (0 = Sunday). Both are reckoned by the caller in the user's zone.
 */
export function selectFollowThrough(
  loops: DigestLoop[],
  input: { today: string; weekday: number; formatDay: (day: string) => string },
): Selection {
  const qualifying = loops
    .filter((loop) => isActiveOn(loop, input.today))
    .map((loop) => ({ loop, bucket: bucketFor(loop, input.today, input.weekday) }))
    .filter((row): row is { loop: DigestLoop; bucket: Bucket } => row.bucket !== null)
    .sort((a, b) => {
      const byBucket = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]
      if (byBucket !== 0) return byBucket
      // The user's own promises first within a bucket: they are the ones the
      // reader can act on.
      if (a.loop.owner !== b.loop.owner) return a.loop.owner === 'user' ? -1 : 1
      if (a.loop.dueOn && b.loop.dueOn) return a.loop.dueOn.localeCompare(b.loop.dueOn)
      return a.loop.createdAt.localeCompare(b.loop.createdAt)
    })

  const shown = qualifying.slice(0, MAX_ITEMS)

  return {
    items: shown.map(({ loop }) => ({
      loop,
      phrase: phraseFor(loop),
      timing: timingFor(loop, input.today),
      source: sourceFor(loop, input.formatDay),
    })),
    more: qualifying.length - shown.length,
    yours: qualifying.filter((row) => row.loop.owner === 'user' && row.loop.kind !== 'question').length,
  }
}

// =============================================================================
// WORDING
// =============================================================================

/**
 * Strip the "I'll" a promise was extracted with, so it reads after "you'd".
 * "I'll send the deck" -> "send the deck". Leaves anything else alone.
 */
export function bareAction(description: string): string {
  const stripped = description
    .trim()
    .replace(
      /^(?:i(?:'ll| will| am going to|'m going to| can| need to| have to| promised to| said i(?:'d| would))\s+|(?:we|they|he|she)(?:'ll| will| are going to)\s+|(?:let me)\s+)/i,
      '',
    )
    .replace(/[.。]\s*$/, '')
  if (!stripped) return description.trim()
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function firstName(name: string | null): string {
  if (!name) return 'They'
  return name.trim().split(/\s+/)[0] || name
}

/**
 * One sentence that says who owes what. Never an instruction to the reader
 * about somebody else's promise.
 */
export function phraseFor(loop: DigestLoop): string {
  const action = bareAction(loop.description)
  const who = firstName(loop.personName)

  if (loop.kind === 'question') {
    const question = loop.description.trim().replace(/\?*$/, '?')
    return `Still unanswered: ${question.charAt(0).toUpperCase()}${question.slice(1)}`
  }

  if (loop.owner === 'user') {
    return loop.kind === 'follow_up' && !/^follow up/i.test(action)
      ? `You said you'd follow up: ${action}.`
      : `You said you'd ${action}.`
  }

  if (loop.owner === 'person') {
    return `${who} said they'd ${action}.`
  }

  return `Between you${loop.personName ? ` and ${who}` : ''}: ${action}.`
}

/** "Due today", "Overdue by 3 days", "Waiting on them". */
export function timingFor(loop: DigestLoop, today: string): { label: string; tone: TimingTone } {
  if (loop.dueOn) {
    if (loop.dueOn < today) {
      const days = daysBetween(loop.dueOn, today)
      return { label: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`, tone: 'overdue' }
    }
    if (loop.dueOn === today) return { label: 'Due today', tone: 'today' }
    return { label: 'Due tomorrow', tone: 'soon' }
  }
  if (loop.kind === 'question') return { label: 'Unanswered', tone: 'open' }
  if (loop.owner === 'person') return { label: 'Waiting on them', tone: 'waiting' }
  return { label: 'No date', tone: 'open' }
}

/** "Promised in Budget sync, 24 Aug", or "Came up in …" for a question. */
export function sourceFor(loop: DigestLoop, formatDay: (day: string) => string): string | null {
  if (!loop.interactionTitle) return null
  const when = loop.interactionDay ? `, ${formatDay(loop.interactionDay)}` : ''
  const verb = loop.kind === 'question' ? 'Came up in' : loop.owner === 'person' ? 'Said in' : 'Promised in'
  return `${verb} ${loop.interactionTitle}${when}`
}

/** "3 things worth following up on today" / "One thing …". */
export function headline(selection: Selection): string {
  const n = selection.items.length + selection.more
  if (n === 1) return 'One thing worth following up on today.'
  return `${n} things worth following up on today.`
}

/** The subject line says the useful thing: what is past due, or what is due. */
export function subjectFor(selection: Selection): string {
  const overdue = selection.items.filter((i) => i.timing.tone === 'overdue').length
  const today = selection.items.filter((i) => i.timing.tone === 'today').length
  if (overdue > 0) return `${overdue} ${overdue === 1 ? 'promise' : 'promises'} past due`
  if (today > 0) return `${today} ${today === 1 ? 'thing' : 'things'} due today`
  const n = selection.items.length + selection.more
  return `${n} open ${n === 1 ? 'loop' : 'loops'} worth a look`
}
