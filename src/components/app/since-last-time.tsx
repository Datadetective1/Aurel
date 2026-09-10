import Link from 'next/link'
import { ArrowRight, CircleHelp, Handshake, MessagesSquare, Scale } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import type { ConversationSummary, DecisionRecord, LoopRecord } from '@/lib/conversations/queries'
import { relativeDay } from '@/lib/format'
import { isOverdueIn } from '@/lib/tz'
import { cn } from '@/lib/utils'

/**
 * SINCE LAST TIME
 * =============================================================================
 * The block on a brief that makes the loop visible: what the last
 * conversation with these people left open, what was decided, what you
 * promised. Built from the record, never from a model, so every line on it
 * is something the user confirmed.
 *
 * This is where "the next preparation gets smarter" is actually seen.
 * =============================================================================
 */

export function SinceLastTime({
  lastConversation,
  loops,
  decisions,
  timeZone,
  now,
  className,
}: {
  lastConversation: ConversationSummary | null
  loops: LoopRecord[]
  decisions: DecisionRecord[]
  timeZone: string
  now: Date
  className?: string
}) {
  if (!lastConversation && loops.length === 0 && decisions.length === 0) return null

  const yours = loops.filter((l) => l.owner === 'user' && l.kind !== 'question')
  const theirs = loops.filter((l) => l.owner === 'person' && l.kind !== 'question')
  const questions = loops.filter((l) => l.kind === 'question')

  return (
    <section
      className={cn(
        'border-line bg-surface rounded-[var(--radius-lg)] border p-5 sm:p-6',
        className,
      )}
      aria-labelledby="since-last-time"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow id="since-last-time">Since last time</Eyebrow>
        {lastConversation ? (
          <Link
            href={`/conversations/${lastConversation.id}`}
            className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
          >
            <MessagesSquare className="size-3.5" aria-hidden="true" />
            {lastConversation.title},{' '}
            {relativeDay(lastConversation.occurredAt, timeZone, now).toLowerCase()}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {lastConversation?.summary ? (
        <p className="text-ink-secondary mt-3 line-clamp-3 text-sm leading-relaxed">
          {lastConversation.summary}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {yours.length > 0 ? (
          <Group
            icon={<Handshake className="text-accent size-3.5" aria-hidden="true" />}
            title="You promised"
            tone="accent"
          >
            {yours.slice(0, 4).map((l) => (
              <LoopLine key={l.id} loop={l} timeZone={timeZone} now={now} />
            ))}
          </Group>
        ) : null}

        {theirs.length > 0 ? (
          <Group
            icon={<Handshake className="text-info size-3.5" aria-hidden="true" />}
            title="They promised"
          >
            {theirs.slice(0, 4).map((l) => (
              <LoopLine key={l.id} loop={l} timeZone={timeZone} now={now} showFace />
            ))}
          </Group>
        ) : null}

        {questions.length > 0 ? (
          <Group
            icon={<CircleHelp className="text-info size-3.5" aria-hidden="true" />}
            title="Still unanswered"
          >
            {questions.slice(0, 3).map((l) => (
              <LoopLine key={l.id} loop={l} timeZone={timeZone} now={now} />
            ))}
          </Group>
        ) : null}

        {decisions.length > 0 ? (
          <Group
            icon={<Scale className="text-positive size-3.5" aria-hidden="true" />}
            title="Already decided"
          >
            {decisions.slice(0, 3).map((d) => (
              <li key={d.id} className="text-ink text-sm leading-relaxed">
                {d.description}
                <span className="text-ink-muted ml-2 text-xs">
                  {relativeDay(d.decidedOn, timeZone, now).toLowerCase()}
                </span>
              </li>
            ))}
          </Group>
        ) : null}
      </div>

      {yours.length === 0 &&
      theirs.length === 0 &&
      questions.length === 0 &&
      decisions.length === 0 ? (
        <p className="text-ink-muted mt-3 text-sm">Nothing left open from it.</p>
      ) : null}
    </section>
  )
}

function Group({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone?: 'accent'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        tone === 'accent' && 'bg-accent-wash -m-3 rounded-[var(--radius-md)] p-3 sm:m-0',
      )}
    >
      <h3 className="text-ink-muted flex items-center gap-2 text-xs font-medium tracking-[0.06em] uppercase">
        {icon}
        {title}
      </h3>
      <ul className="mt-2.5 grid gap-2">{children}</ul>
    </div>
  )
}

function LoopLine({
  loop,
  timeZone,
  now,
  showFace = false,
}: {
  loop: LoopRecord
  timeZone: string
  now: Date
  showFace?: boolean
}) {
  const overdue = loop.status === 'open' && isOverdueIn(loop.dueOn, timeZone, now)
  return (
    <li className="flex items-start gap-2.5">
      {showFace && loop.person ? (
        <Avatar name={loop.person.name} src={loop.person.src} size="xs" className="mt-0.5" />
      ) : null}
      <span className="text-ink min-w-0 flex-1 text-sm leading-relaxed">
        {loop.description}
        {loop.dueOn ? (
          <Badge tone={overdue ? 'critical' : 'outline'} className="ml-2 align-middle">
            {overdue ? 'was due ' : ''}
            {relativeDay(loop.dueOn, timeZone, now).toLowerCase()}
          </Badge>
        ) : null}
      </span>
    </li>
  )
}
