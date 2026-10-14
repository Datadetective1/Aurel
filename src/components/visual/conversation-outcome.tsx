import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CircleAlert,
  CircleCheck,
  Shield,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { DecisionRecord, LoopRecord } from '@/lib/conversations/queries'
import { actionDirection } from '@/lib/visual/relationship-actions'
import { isOverdueIn } from '@/lib/tz'
import { relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * WHAT A CONVERSATION LEFT BEHIND, AS OBJECTS
 * =============================================================================
 * The confirmed record of one conversation, grouped by what each item means
 * for the user rather than written up as a paragraph:
 *
 *   DECIDED          confirmed decisions                        ✓
 *   YOU OWE          confirmed promises the user made            ↗
 *   WAITING ON THEM  confirmed promises made to the user         ↙
 *   UNRESOLVED       open questions and loops nobody owns yet    !
 *   YOUR FOLLOW-UPS  things the user said they would follow up   ⌑
 *   PUSHBACK         objections the reading recorded            ⛉
 *
 * Every line is a row the record already holds -- nothing here is new
 * wording. Each carries a face where it concerns one person, and the reason
 * behind a decision opens beneath it rather than sitting in the way.
 * =============================================================================
 */

type Tone = 'positive' | 'accent' | 'neutral' | 'caution'

function Group({
  title,
  icon: Icon,
  tone,
  count,
  children,
}: {
  title: string
  icon: typeof CircleCheck
  tone: Tone
  count: number
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={`${title}: ${count}`}
      className="border-line bg-surface min-w-0 rounded-[var(--radius-lg)] border p-3.5"
    >
      <h3 className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 items-center justify-center rounded-full',
            tone === 'positive' && 'bg-positive-wash text-positive',
            tone === 'accent' && 'bg-accent-wash text-accent',
            tone === 'caution' && 'bg-caution-wash text-caution',
            tone === 'neutral' && 'bg-bg-sunken text-ink-secondary',
          )}
        >
          <Icon className="size-3" />
        </span>
        <span className="label text-ink-secondary">{title}</span>
        <span className="text-ink-muted ml-auto text-xs tabular-nums">{count}</span>
      </h3>
      <ul className="mt-2.5 grid gap-2">{children}</ul>
    </section>
  )
}

function Row({
  children,
  face,
  meta,
  metaTone = 'muted',
}: {
  children: React.ReactNode
  face?: { name: string; src: string | null } | null
  meta?: string | null
  metaTone?: 'muted' | 'critical'
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-sm leading-snug">{children}</span>
        {meta ? (
          <span
            className={cn(
              'mt-0.5 block text-xs',
              metaTone === 'critical' ? 'text-critical' : 'text-ink-muted',
            )}
          >
            {meta}
          </span>
        ) : null}
      </span>
      {face ? <Avatar name={face.name} src={face.src} size="xs" className="mt-0.5" /> : null}
    </li>
  )
}

export function ConversationOutcome({
  loops,
  decisions,
  objections,
  timeZone,
  now,
  className,
}: {
  loops: LoopRecord[]
  decisions: DecisionRecord[]
  objections: string[]
  timeZone: string
  now: Date
  className?: string
}) {
  const byDirection = (d: ReturnType<typeof actionDirection>) =>
    loops.filter((l) => actionDirection(l) === d)
  const owe = byDirection('owe')
  const waiting = byDirection('waiting')
  const revisit = byDirection('revisit')
  const personal = byDirection('personal')

  const loopMeta = (l: LoopRecord) => {
    if (!l.dueOn) return null
    const overdue = isOverdueIn(l.dueOn, timeZone, now)
    return `${overdue ? 'Was due' : 'Due'} ${relativeDay(l.dueOn, timeZone, now).toLowerCase()}`
  }
  const loopRow = (l: LoopRecord) => (
    <Row
      key={l.id}
      face={l.person ? { name: l.person.name, src: l.person.src } : null}
      meta={loopMeta(l)}
      metaTone={l.dueOn && isOverdueIn(l.dueOn, timeZone, now) ? 'critical' : 'muted'}
    >
      {l.description}
    </Row>
  )

  const groups = [
    decisions.length > 0 ? (
      <Group
        key="decided"
        title="Decided"
        icon={CircleCheck}
        tone="positive"
        count={decisions.length}
      >
        {decisions.map((d) => (
          <li key={d.id} className="min-w-0">
            {d.context ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="text-ink min-w-0 flex-1 text-sm leading-snug">
                    {d.description}
                  </span>
                  <span className="text-ink-muted shrink-0 text-xs underline-offset-2 group-open:hidden">
                    Why
                  </span>
                </summary>
                <p className="border-line text-ink-secondary mt-1.5 border-l-2 pl-2.5 text-xs leading-relaxed">
                  {d.context}
                </p>
              </details>
            ) : (
              <span className="text-ink block text-sm leading-snug">{d.description}</span>
            )}
          </li>
        ))}
      </Group>
    ) : null,
    owe.length > 0 ? (
      <Group key="owe" title="You owe" icon={ArrowUpRight} tone="accent" count={owe.length}>
        {owe.map(loopRow)}
      </Group>
    ) : null,
    waiting.length > 0 ? (
      <Group
        key="waiting"
        title="Waiting on them"
        icon={ArrowDownLeft}
        tone="neutral"
        count={waiting.length}
      >
        {waiting.map(loopRow)}
      </Group>
    ) : null,
    revisit.length > 0 ? (
      <Group
        key="unresolved"
        title="Unresolved"
        icon={CircleAlert}
        tone="caution"
        count={revisit.length}
      >
        {revisit.map(loopRow)}
      </Group>
    ) : null,
    personal.length > 0 ? (
      <Group
        key="personal"
        title="Your follow-ups"
        icon={Bookmark}
        tone="neutral"
        count={personal.length}
      >
        {personal.map(loopRow)}
      </Group>
    ) : null,
    objections.length > 0 ? (
      <Group key="pushback" title="Pushback" icon={Shield} tone="caution" count={objections.length}>
        {objections.map((o) => (
          <Row key={o}>{o}</Row>
        ))}
      </Group>
    ) : null,
  ].filter(Boolean)

  if (groups.length === 0) return null
  return <div className={cn('grid gap-2.5 sm:grid-cols-2', className)}>{groups}</div>
}

/**
 * NEXT TIME
 * =============================================================================
 * What the reading suggested for the next conversation, as small objects:
 * an arrow, the line clamped to two, the face of whoever it names. The full
 * wording opens on tap; the first few show, the rest wait behind "See all".
 * Selected and labelled from the stored reading -- never rewritten.
 * =============================================================================
 */
export function NextSteps({
  items,
  people,
  prepareHref,
  prepareLabel,
  visible = 3,
  className,
}: {
  items: string[]
  /** Faces for anyone a line names by first name. */
  people: { id: string; name: string; src: string | null }[]
  prepareHref?: string | null
  prepareLabel?: string | null
  visible?: number
  className?: string
}) {
  if (items.length === 0) return null

  const faceFor = (text: string) =>
    people.find((p) => {
      const first = p.name.split(' ')[0]
      return (
        first &&
        first.length > 1 &&
        new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)
      )
    }) ?? null

  const card = (text: string, i: number) => {
    const face = faceFor(text)
    return (
      <li key={i}>
        <details className="group border-line bg-surface rounded-[var(--radius-md)] border">
          <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <ArrowRight className="text-accent mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="text-ink line-clamp-2 min-w-0 flex-1 text-sm leading-snug group-open:line-clamp-none">
              {text}
            </span>
            {face ? <Avatar name={face.name} src={face.src} size="xs" className="mt-0.5" /> : null}
          </summary>
        </details>
      </li>
    )
  }

  return (
    <section aria-labelledby="next-time-heading" className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-time-heading" className="label text-accent">
          Next time
        </h2>
        {prepareHref ? (
          <Link
            href={prepareHref}
            className="text-ink hover:text-accent inline-flex min-h-11 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
          >
            {prepareLabel ?? 'Prepare'}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <ul className="mt-2 grid gap-2">{items.slice(0, visible).map(card)}</ul>
      {items.length > visible ? (
        <details className="group mt-2">
          <summary className="text-ink-secondary hover:text-ink inline-flex min-h-11 cursor-pointer list-none items-center text-xs font-medium [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">See all {items.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="grid gap-2">{items.slice(visible).map((t, i) => card(t, i + visible))}</ul>
        </details>
      ) : null}
    </section>
  )
}
