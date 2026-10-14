import Link from 'next/link'
import { CircleHelp, Ear, Flag, MessagesSquare, Quote, Shield, Target } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ListeningCue, NormalizedBrief } from '@/lib/brief'
import type { VisualConnection, VisualLoop, VisualPerson } from '@/lib/visual/types'
import { DIRECTION_META, DIRECTION_ORDER } from '@/lib/visual/relationship-actions'
import { formatDate, relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { Chip } from './chip'
import { DIRECTION_ICON } from './direction'
import { RoomView } from './room-view'

/**
 * SIXTY SECONDS, AS MODULES
 * =============================================================================
 * The middle depth, composed as a column of small modules rather than a long
 * document. Each module answers one question and is skippable at a glance:
 *
 *   what you want and what to leave with
 *   what happened last time
 *   what is open between you, by direction
 *   who is in the room and how to approach each of them
 *   how to open, what to listen for, what may come back at you
 *   what Atturel does not know
 *
 * Every string is read from the stored brief or the record. Objections open
 * on request: the objection is the headline, the response is behind it.
 * =============================================================================
 */

function Module({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon?: typeof Target
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <h2 className="label flex items-center gap-1.5">
        {Icon ? <Icon className="text-accent size-3.5" aria-hidden="true" /> : null}
        {title}
      </h2>
      {children}
    </section>
  )
}

export function QuickBrief({
  brief,
  people,
  connections,
  loops,
  lastConversation,
  cues,
  centerLabel,
  timeZone,
  now,
}: {
  brief: NormalizedBrief
  people: VisualPerson[]
  connections: VisualConnection[]
  loops: VisualLoop[]
  lastConversation: {
    id: string
    title: string
    occurredAt: string
    outcome: string | null
    summary: string | null
  } | null
  cues: ListeningCue[]
  centerLabel: string
  timeZone: string
  now: Date
}) {
  const faces = new Map(people.map((p) => [p.id, p]))
  // Each VisualLoop already carries its direction; group in display order.
  const byDirection = DIRECTION_ORDER.filter((d) => d !== 'completed')
    .map((d) => ({ direction: d, loops: loops.filter((l) => l.direction === d) }))
    .filter((g) => g.loops.length > 0)

  return (
    <div className="grid gap-9">
      {brief.objective || brief.outcomeToLeaveWith ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {brief.objective ? (
            <Module title="Objective" icon={Target}>
              <p className="font-display text-ink mt-2 text-xl leading-snug">{brief.objective}</p>
            </Module>
          ) : null}
          {brief.outcomeToLeaveWith ? (
            <Module title="Leave with" icon={Flag}>
              <p className="text-ink mt-2 text-[0.9375rem] leading-snug">
                {brief.outcomeToLeaveWith}
              </p>
            </Module>
          ) : null}
        </div>
      ) : null}

      {lastConversation ? (
        <Module title="Last time" icon={MessagesSquare}>
          <Link
            href={`/conversations/${lastConversation.id}`}
            className="border-line bg-surface hover:border-line-strong mt-3 block rounded-[var(--radius-lg)] border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <p className="text-ink-muted text-xs">
              {formatDate(lastConversation.occurredAt, timeZone)} · {lastConversation.title}
            </p>
            {lastConversation.outcome || lastConversation.summary ? (
              <p className="text-ink mt-1.5 line-clamp-3 text-sm leading-relaxed">
                {lastConversation.outcome ?? lastConversation.summary}
              </p>
            ) : null}
          </Link>
        </Module>
      ) : null}

      {byDirection.length > 0 ? (
        <Module title="Open between you">
          <div className="mt-3 grid gap-4">
            {byDirection.map((group) => {
              const Icon = DIRECTION_ICON[group.direction]
              return (
                <div key={group.direction}>
                  <h3 className="text-ink-secondary flex items-center gap-1.5 text-xs font-medium">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {DIRECTION_META[group.direction].label}
                  </h3>
                  <ul className="mt-2 grid gap-2">
                    {group.loops.slice(0, 3).map((l) => (
                      <li key={l.id} className="flex items-start gap-2.5">
                        {l.personId && faces.get(l.personId) ? (
                          <Avatar
                            name={faces.get(l.personId)!.fullName}
                            src={faces.get(l.personId)!.src}
                            size="xs"
                            className="mt-0.5"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="bg-line-strong mt-2 h-px w-3 shrink-0"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="text-ink block text-sm leading-snug">
                            {l.description}
                          </span>
                          {l.dueOn ? (
                            <span
                              className={cn(
                                'mt-0.5 block text-xs',
                                l.overdue ? 'text-critical' : 'text-ink-muted',
                              )}
                            >
                              {l.overdue ? 'Overdue · ' : 'Due '}
                              {relativeDay(l.dueOn, timeZone, now).toLowerCase()}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Module>
      ) : null}

      {people.length > 1 ? (
        <RoomView
          people={people}
          connections={connections}
          centerLabel={centerLabel}
          timeZone={timeZone}
          now={now}
        />
      ) : null}

      {brief.participants.some((p) => p.guidance[0] || p.knownConcerns[0]) ? (
        <Module title="How to approach them">
          <ul className="mt-3 grid gap-4">
            {brief.participants.map((p, i) => {
              const face = p.personId ? faces.get(p.personId) : undefined
              if (!p.guidance[0] && !p.knownConcerns[0]) return null
              return (
                <li key={p.personId ?? i} className="flex gap-3">
                  <Avatar name={face?.fullName ?? p.name} src={face?.src ?? null} size="md" />
                  <div className="min-w-0">
                    <h3 className="text-ink text-sm font-medium">{p.name}</h3>
                    {p.guidance[0] ? (
                      <p className="text-ink-secondary mt-0.5 text-[0.8125rem] leading-relaxed">
                        {p.guidance[0]}
                      </p>
                    ) : null}
                    {p.knownConcerns[0] ? (
                      <p className="mt-1.5">
                        <Chip icon={Shield} tone="neutral" className="max-w-full whitespace-normal">
                          Has raised: {p.knownConcerns[0]}
                        </Chip>
                      </p>
                    ) : null}
                    {p.publicOnly ? (
                      <p className="text-ink-muted mt-1 text-xs">
                        From public sources only — preliminary until you have met.
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </Module>
      ) : null}

      {brief.howToOpen ? (
        <Module title="Open with" icon={Quote}>
          <blockquote className="border-accent-graphic text-ink mt-2 border-l-2 pl-3.5 text-sm leading-relaxed">
            {brief.howToOpen}
          </blockquote>
        </Module>
      ) : null}

      {cues.length > 0 ? (
        <Module title="Listen for" icon={Ear}>
          <p className="text-ink-muted mt-1.5 text-xs">
            Open in your record. {brand.name} is not predicting what anyone will say.
          </p>
          <ul className="mt-3 grid gap-2.5">
            {cues.map((cue, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden="true" className="bg-accent-graphic mt-2 h-px w-3 shrink-0" />
                <span className="min-w-0">
                  <span className="text-ink block text-sm leading-snug">{cue.text}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs">{cue.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </Module>
      ) : null}

      {brief.likelyObjections.length > 0 ? (
        <Module title="May come up">
          <ul className="mt-3 grid gap-2">
            {brief.likelyObjections.slice(0, 3).map((o, i) => (
              <li key={i}>
                <details className="group border-line bg-surface rounded-[var(--radius-md)] border">
                  <summary className="text-ink flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{o.objection}</span>
                    <span
                      aria-hidden="true"
                      className="text-ink-muted shrink-0 text-xs group-open:hidden"
                    >
                      Response
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-ink-muted hidden shrink-0 text-xs group-open:inline"
                    >
                      Hide
                    </span>
                  </summary>
                  <div className="border-line border-t px-4 py-3">
                    <p className="text-ink-secondary text-[0.8125rem] leading-relaxed">
                      {o.response}
                    </p>
                    {o.basis ? (
                      <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                        Why: {o.basis}
                      </p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Module>
      ) : null}

      {brief.uncertainties.length > 0 ? (
        <section className="border-caution/25 bg-caution-wash rounded-[var(--radius-lg)] border p-4">
          <h2 className="label text-caution flex items-center gap-1.5">
            <CircleHelp className="size-3.5" aria-hidden="true" />
            What {brand.name} doesn&rsquo;t know
          </h2>
          <ul className="mt-2.5 grid gap-1.5">
            {brief.uncertainties.slice(0, 3).map((item, i) => (
              <li
                key={i}
                className="text-ink-secondary flex gap-2.5 text-[0.8125rem] leading-relaxed"
              >
                <span aria-hidden="true" className="bg-caution/50 mt-2 h-px w-3 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
