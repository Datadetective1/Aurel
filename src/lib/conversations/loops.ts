import type { Database } from '@/lib/supabase/types'
import { addDays, isOverdueIn, todayIn } from '@/lib/tz'

/**
 * OPEN LOOPS
 * =============================================================================
 * A loop is anything a conversation left open: something the user promised,
 * something somebody promised them, a question nobody answered. It lives in
 * the `commitments` table, which has carried promises since the beginning; the
 * name on the screen is the concept, the table is the storage.
 *
 * Deliberately small. Four states, one-tap transitions, no priorities, no
 * projects, no assignees beyond "you" and "them". A task manager is a
 * different product and this must not drift into one.
 * =============================================================================
 */

export type LoopStatus = Database['public']['Enums']['commitment_status']
export type LoopKind = Database['public']['Enums']['loop_kind']
export type LoopOwner = Database['public']['Enums']['commitment_owner']
export type ReviewStatus = Database['public']['Enums']['review_status']

export type LoopAction = 'done' | 'later' | 'cancel' | 'reopen'

/** How long "Later" pushes a loop out of the way. One working week. */
export const LATER_DAYS = 7

export interface LoopTransition {
  status: LoopStatus
  completed_at: string | null
  cancelled_at: string | null
  deferred_until: string | null
}

/**
 * The state machine, as data.
 *
 * `dropped` is the pre-existing name for cancelled; rows carrying it are read
 * as cancelled and nothing writes it any more. Reopening from any closed
 * state clears every timestamp so the row reads as freshly open.
 */
export function transitionLoop(
  action: LoopAction,
  input: { now: Date; timeZone: string },
): LoopTransition {
  const nowIso = input.now.toISOString()
  switch (action) {
    case 'done':
      return { status: 'done', completed_at: nowIso, cancelled_at: null, deferred_until: null }
    case 'cancel':
      return { status: 'cancelled', completed_at: null, cancelled_at: nowIso, deferred_until: null }
    case 'later':
      return {
        status: 'later',
        completed_at: null,
        cancelled_at: null,
        deferred_until: addDays(todayIn(input.timeZone, input.now), LATER_DAYS),
      }
    case 'reopen':
      return { status: 'open', completed_at: null, cancelled_at: null, deferred_until: null }
  }
}

/** Whether a loop should appear in the working list right now. */
export function loopIsActive(
  loop: { status: LoopStatus; deferred_until: string | null; review_status: ReviewStatus },
  timeZone: string,
  now = new Date(),
): boolean {
  if (loop.review_status !== 'confirmed') return false
  if (loop.status === 'open') return true
  if (loop.status === 'later') {
    // A deferred loop returns on its own once the date passes.
    if (!loop.deferred_until) return false
    return loop.deferred_until <= todayIn(timeZone, now)
  }
  return false
}

export function isClosed(status: LoopStatus): boolean {
  return status === 'done' || status === 'cancelled' || status === 'dropped'
}

/** The status the UI names, with the legacy value folded in. */
export function displayStatus(status: LoopStatus): 'open' | 'done' | 'later' | 'cancelled' {
  if (status === 'dropped') return 'cancelled'
  return status
}

export type LoopGroup = 'you_promised' | 'waiting_on_them' | 'unanswered' | 'shared'

/**
 * Which pile a loop belongs in. The groups are the emotional reading of the
 * list -- "you promised this", "waiting on them", "nobody answered" -- and
 * they are what the page is organised by.
 */
export function loopGroup(loop: { kind: LoopKind; owner: LoopOwner }): LoopGroup {
  if (loop.kind === 'question') return 'unanswered'
  if (loop.owner === 'user') return 'you_promised'
  if (loop.owner === 'person') return 'waiting_on_them'
  return 'shared'
}

export const LOOP_GROUP_META: Record<LoopGroup, { label: string; hint: string }> = {
  you_promised: { label: 'You promised', hint: 'Things you said you would do.' },
  waiting_on_them: { label: 'Waiting on them', hint: 'Things somebody said they would do for you.' },
  unanswered: { label: 'Unanswered', hint: 'Questions that came up and were not settled.' },
  shared: { label: 'Between you', hint: 'Open, with no single owner yet.' },
}

/**
 * Sort key for a working list: overdue first, then dated soonest first, then
 * undated by recency. Stable across renders so nothing jumps under a tap.
 */
export function compareLoops(
  a: { due_on: string | null; created_at: string },
  b: { due_on: string | null; created_at: string },
  timeZone: string,
  now = new Date(),
): number {
  const aOverdue = isOverdueIn(a.due_on, timeZone, now)
  const bOverdue = isOverdueIn(b.due_on, timeZone, now)
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on)
  if (a.due_on) return -1
  if (b.due_on) return 1
  return b.created_at.localeCompare(a.created_at)
}

/**
 * Below this, an extracted loop is not worth showing even as a proposal. It is
 * the "maybe we should look at that sometime" floor.
 */
export const LOOP_PROPOSAL_FLOOR = 0.4

/**
 * At or above this, a proposal is pre-selected in the review panel. The user
 * still presses Confirm; this only decides which boxes start ticked.
 */
export const LOOP_PRESELECT_THRESHOLD = 0.7

/** The one-word label a badge carries for a proposal's confidence. */
export function confidenceLabel(confidence: number | null): 'Likely' | 'Possible' | null {
  if (confidence === null) return null
  if (confidence >= LOOP_PRESELECT_THRESHOLD) return 'Likely'
  return 'Possible'
}
