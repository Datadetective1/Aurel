import { LoopRow } from './loop-row'
import { Eyebrow } from '@/components/ui/primitives'
import { LOOP_GROUP_META, loopGroup, type LoopGroup } from '@/lib/conversations/loops'
import type { LoopRecord } from '@/lib/conversations/queries'
import { cn } from '@/lib/utils'

/**
 * Loops, grouped by the human reading of them: you promised, waiting on them,
 * unanswered, between you. Order is the emotional order -- what you owe comes
 * first, because that is the thing the product exists to remember for you.
 */

const ORDER: LoopGroup[] = ['you_promised', 'waiting_on_them', 'unanswered', 'shared']

export function LoopList({
  loops,
  timeZone,
  now,
  showPerson = true,
  showSource = true,
  grouped = true,
  className,
}: {
  loops: LoopRecord[]
  timeZone: string
  now: Date
  showPerson?: boolean
  showSource?: boolean
  grouped?: boolean
  className?: string
}) {
  if (loops.length === 0) return null

  if (!grouped) {
    return (
      <ul className={cn('grid gap-2', className)}>
        {loops.map((loop) => (
          <LoopRow
            key={loop.id}
            loop={loop}
            timeZone={timeZone}
            now={now}
            showPerson={showPerson}
            showSource={showSource}
          />
        ))}
      </ul>
    )
  }

  const byGroup = new Map<LoopGroup, LoopRecord[]>()
  for (const loop of loops) {
    const group = loopGroup(loop)
    byGroup.set(group, [...(byGroup.get(group) ?? []), loop])
  }

  return (
    <div className={cn('grid gap-8', className)}>
      {ORDER.filter((g) => byGroup.has(g)).map((group) => (
        <section key={group}>
          <div className="flex items-baseline gap-3">
            <Eyebrow>{LOOP_GROUP_META[group].label}</Eyebrow>
            <span className="text-ink-faint text-xs">{byGroup.get(group)!.length}</span>
          </div>
          <p className="text-ink-muted mt-1 text-xs">{LOOP_GROUP_META[group].hint}</p>
          <ul className="mt-3 grid gap-2">
            {byGroup.get(group)!.map((loop) => (
              <LoopRow
                key={loop.id}
                loop={loop}
                timeZone={timeZone}
                now={now}
                showPerson={showPerson}
                showSource={showSource}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
