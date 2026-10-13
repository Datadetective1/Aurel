/**
 * RELATIONSHIP ACTIONS
 * =============================================================================
 * The same open loops the rest of the product already keeps (the
 * `commitments` table, read through `lib/conversations/loops`), read as the
 * direction they run between two people. This is a lens over the existing
 * loop model, not a second task system: no new states, no priorities, no
 * projects. Five readings, each derived from fields the loop already has.
 *
 *   owe        I owe them        a promise the user made
 *   waiting    Waiting on them   a promise somebody made the user
 *   revisit    To revisit        a question nobody settled, or a loop with
 *                                no single owner -- something to come back to
 *                                together
 *   personal   My follow-up      something the user said they would follow up
 *                                on, as distinct from a promise to deliver
 *   completed  Completed         done
 *
 * Pure, so the web and the native app read loops the same way.
 * =============================================================================
 */

export type LoopKindLike = 'commitment' | 'question' | 'follow_up'
export type LoopOwnerLike = 'user' | 'person' | 'shared'
export type LoopStatusLike = 'open' | 'done' | 'dropped' | 'later' | 'cancelled'

export type ActionDirection = 'owe' | 'waiting' | 'revisit' | 'personal' | 'completed'

export interface DirectionInput {
  kind: LoopKindLike
  owner: LoopOwnerLike
  status: LoopStatusLike
}

export function actionDirection(loop: DirectionInput): ActionDirection {
  if (loop.status === 'done') return 'completed'
  if (loop.kind === 'question') return 'revisit'
  if (loop.owner === 'shared') return 'revisit'
  if (loop.owner === 'person') return 'waiting'
  if (loop.kind === 'follow_up') return 'personal'
  return 'owe'
}

/**
 * Labels are written from the user's side of the relationship, short enough
 * to sit in a chip at phone width. `glyph` is a lucide icon name the web and
 * native renderers each map to their own icon set, so the direction is never
 * carried by colour alone.
 */
export const DIRECTION_META: Record<
  ActionDirection,
  { label: string; short: string; glyph: 'arrow-up-right' | 'arrow-down-left' | 'repeat' | 'bookmark' | 'check' }
> = {
  owe: { label: 'I owe them', short: 'You owe', glyph: 'arrow-up-right' },
  waiting: { label: 'Waiting on them', short: 'Waiting', glyph: 'arrow-down-left' },
  revisit: { label: 'To revisit', short: 'Revisit', glyph: 'repeat' },
  personal: { label: 'My follow-up', short: 'Follow-up', glyph: 'bookmark' },
  completed: { label: 'Completed', short: 'Done', glyph: 'check' },
}

/** Display order: what the user has to do first, what they are owed next. */
export const DIRECTION_ORDER: ActionDirection[] = ['owe', 'personal', 'waiting', 'revisit', 'completed']

export function countDirections(loops: DirectionInput[]): Record<ActionDirection, number> {
  const counts: Record<ActionDirection, number> = {
    owe: 0,
    waiting: 0,
    revisit: 0,
    personal: 0,
    completed: 0,
  }
  for (const loop of loops) counts[actionDirection(loop)] += 1
  return counts
}

/** Loops grouped by direction, in display order, empty groups dropped. */
export function groupByDirection<T extends DirectionInput>(
  loops: T[],
): { direction: ActionDirection; loops: T[] }[] {
  const groups = new Map<ActionDirection, T[]>()
  for (const loop of loops) {
    const d = actionDirection(loop)
    groups.set(d, [...(groups.get(d) ?? []), loop])
  }
  return DIRECTION_ORDER.filter((d) => groups.has(d)).map((direction) => ({
    direction,
    loops: groups.get(direction)!,
  }))
}
