import { ArrowDownLeft, ArrowUpRight, Bookmark, Check, Repeat } from 'lucide-react'
import { DIRECTION_META, type ActionDirection } from '@/lib/visual/relationship-actions'
import { Chip, type ChipTone } from './chip'

/**
 * The direction a loop runs between two people, as an icon and a word.
 * Restrained on purpose: one tint for what the user owes, quiet for the rest.
 * The relationship is the subject; the loop is a fact about it.
 */

export const DIRECTION_ICON = {
  owe: ArrowUpRight,
  waiting: ArrowDownLeft,
  revisit: Repeat,
  personal: Bookmark,
  completed: Check,
} as const satisfies Record<ActionDirection, unknown>

const DIRECTION_TONE: Record<ActionDirection, ChipTone> = {
  owe: 'accent',
  waiting: 'neutral',
  revisit: 'neutral',
  personal: 'neutral',
  completed: 'positive',
}

export function DirectionChip({
  direction,
  count,
  short = false,
  className,
}: {
  direction: ActionDirection
  count?: number
  short?: boolean
  className?: string
}) {
  const meta = DIRECTION_META[direction]
  return (
    <Chip icon={DIRECTION_ICON[direction]} tone={DIRECTION_TONE[direction]} className={className}>
      {typeof count === 'number' ? <span className="tabular-nums">{count}</span> : null}
      {short ? meta.short : meta.label}
    </Chip>
  )
}
