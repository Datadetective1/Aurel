import { addDays, daysBetween, dayKeyIn, todayIn } from '@/lib/tz'
import type { ActionDirection } from './relationship-actions'

/**
 * WHAT IS OWED, AND WHAT IS GOING STALE
 * =============================================================================
 * Every open commitment, in both directions, read for how fresh it still is.
 * A lens over the loops the product already keeps: no new states, nothing
 * stored. A promise goes stale in one of two ways:
 *
 *   overdue      it had a date, and the date has passed
 *   stale        it never had a date, and has sat open for STALE_AFTER_DAYS
 *
 * The nudge comes before either: a dated promise due within NUDGE_DAYS, or
 * an undated one within NUDGE_DAYS of going stale. That is the moment the
 * user can still keep it without an apology.
 *
 * Pure, so the app, the web and the follow-through email agree on it.
 * =============================================================================
 */

export const STALE_AFTER_DAYS = 14
export const NUDGE_DAYS = 3

export type Freshness = 'overdue' | 'stale' | 'nudge' | 'fresh'

export interface FreshnessInput {
  dueOn: string | null
  createdAt: string
  status: string
}

export interface FreshnessReading {
  freshness: Freshness
  /** "Overdue by 2 days", "Due tomorrow", "Open 12 days, no date". */
  note: string
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function readFreshness(
  loop: FreshnessInput,
  timeZone: string,
  now: Date = new Date(),
): FreshnessReading {
  const today = todayIn(timeZone, now)
  if (loop.dueOn) {
    const due = dayKeyIn(loop.dueOn, timeZone) ?? loop.dueOn.slice(0, 10)
    const until = daysBetween(today, due)
    if (until < 0 && loop.status === 'open') {
      return { freshness: 'overdue', note: `Overdue by ${plural(-until, 'day')}` }
    }
    if (until === 0) return { freshness: 'nudge', note: 'Due today' }
    if (until === 1) return { freshness: 'nudge', note: 'Due tomorrow' }
    if (until > 1 && until <= NUDGE_DAYS)
      return { freshness: 'nudge', note: `Due in ${until} days` }
    return { freshness: 'fresh', note: until < 0 ? 'Past its date' : `Due in ${until} days` }
  }
  const opened = dayKeyIn(loop.createdAt, timeZone) ?? loop.createdAt.slice(0, 10)
  const age = Math.max(0, daysBetween(opened, today))
  const note = age === 0 ? 'Opened today, no date' : `Open ${plural(age, 'day')}, no date`
  if (age >= STALE_AFTER_DAYS) return { freshness: 'stale', note }
  if (age >= STALE_AFTER_DAYS - NUDGE_DAYS) return { freshness: 'nudge', note }
  return { freshness: 'fresh', note }
}

/** The day an undated loop crosses into the nudge window. */
export function nudgeDayFor(createdDay: string): string {
  return addDays(createdDay, STALE_AFTER_DAYS - NUDGE_DAYS)
}

const RANK: Record<Freshness, number> = { overdue: 0, stale: 1, nudge: 2, fresh: 3 }

export type OwedSide = 'mine' | 'theirs' | 'shared'

/** Which column a loop belongs in, from the user's side. */
export function owedSide(direction: ActionDirection): OwedSide | null {
  if (direction === 'owe' || direction === 'personal') return 'mine'
  if (direction === 'waiting') return 'theirs'
  if (direction === 'revisit') return 'shared'
  return null
}

/**
 * Split loops into what the user owes, what they are owed and what is shared,
 * each ordered by how close it is to going stale. Stable within a rank, so
 * the caller's date order survives.
 */
export function arrangeOwed<T extends { direction: ActionDirection; freshness: Freshness }>(
  loops: T[],
): Record<OwedSide, T[]> {
  const out: Record<OwedSide, T[]> = { mine: [], theirs: [], shared: [] }
  for (const loop of loops) {
    const side = owedSide(loop.direction)
    if (side) out[side].push(loop)
  }
  for (const side of Object.keys(out) as OwedSide[]) {
    out[side] = out[side]
      .map((loop, i) => ({ loop, i }))
      .sort((a, b) => RANK[a.loop.freshness] - RANK[b.loop.freshness] || a.i - b.i)
      .map((r) => r.loop)
  }
  return out
}

/** Whether a reading is worth raising before the user asks. */
export function needsNudge(freshness: Freshness): boolean {
  return freshness !== 'fresh'
}
