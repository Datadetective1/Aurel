import Link from 'next/link'
import { ArrowRight, Handshake, Sparkles } from 'lucide-react'
import { FaceStack } from './face-stack'
import { Portrait } from './person-portrait'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * RELATIONSHIP CARD
 * =============================================================================
 * The next conversation, as a person. On Today, the face is the anchor: who
 * you are about to meet, what they do, when, what they last asked for, and
 * what is still open between you. Then one button: Prepare.
 *
 * With several people, the lead person takes the portrait and the rest stack
 * beside them, so the card still reads "these people" at a glance.
 * =============================================================================
 */

export interface RelationshipCardPerson {
  id: string
  name: string
  fullName: string
  src: string | null
  title?: string | null
  company?: string | null
}

export function RelationshipCard({
  meetingId,
  title,
  whenLabel,
  people,
  lastTime,
  openLoops,
  prepared,
  className,
}: {
  meetingId: string
  title: string
  /** "Tomorrow, 9:00 AM" */
  whenLabel: string
  people: RelationshipCardPerson[]
  /** One line from the most recent conversation with these people. */
  lastTime: { text: string; href: string } | null
  openLoops: number
  prepared: boolean
  className?: string
}) {
  const lead = people[0] ?? null
  const others = people.slice(1)
  const subtitle = lead ? [lead.title, lead.company].filter(Boolean).join(' · ') : ''

  return (
    <section
      className={cn(
        'border-line bg-surface relative overflow-hidden rounded-[var(--radius-xl)] border p-5 sm:p-7',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-2/3 bg-[radial-gradient(ellipse_at_left,var(--accent-wash),transparent_65%)]"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        {lead ? (
          <div className="flex shrink-0 items-end gap-2">
            <Portrait
              personId={lead.id}
              name={lead.fullName}
              src={lead.src}
              size="2xl"
              addable
              persistent
            />
            {others.length > 0 ? (
              <FaceStack
                people={others}
                size="sm"
                max={3}
                ringClassName="ring-surface"
                className="mb-1"
              />
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <Eyebrow>Next up · {whenLabel}</Eyebrow>
          {lead ? (
            <>
              <Link
                href={`/people/${lead.id}`}
                className="font-display text-ink hover:text-accent mt-2 block text-2xl sm:text-3xl"
              >
                {lead.name}
                {others.length > 0 ? (
                  <span className="text-ink-muted">
                    {' '}
                    {others.length === 1 ? `and ${others[0]!.name}` : `and ${others.length} others`}
                  </span>
                ) : null}
              </Link>
              {subtitle ? <p className="text-ink-secondary mt-1 text-sm">{subtitle}</p> : null}
            </>
          ) : (
            <p className="font-display text-ink mt-2 text-2xl">{title}</p>
          )}
          {lead ? <p className="text-ink-muted mt-2 text-sm">{title}</p> : null}

          {lastTime ? (
            <blockquote className="border-accent-graphic text-ink-secondary mt-4 border-l-2 pl-3 text-sm leading-relaxed">
              <span className="label mr-2 text-[0.625rem]">Last time</span>
              <Link href={lastTime.href} className="hover:text-ink">
                {lastTime.text}
              </Link>
            </blockquote>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild variant={prepared ? 'secondary' : 'primary'}>
              <Link href={`/meetings/${meetingId}/brief`}>
                <Sparkles className="size-4" aria-hidden="true" />
                {prepared ? 'Open the brief' : 'Prepare'}
              </Link>
            </Button>
            {openLoops > 0 ? (
              <Link
                href="/loops"
                className="text-ink-secondary hover:text-ink inline-flex items-center gap-1.5 text-sm"
              >
                <Handshake className="text-caution size-4" aria-hidden="true" />
                {openLoops} open {openLoops === 1 ? 'loop' : 'loops'}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : (
              <Badge tone="outline">Nothing open between you</Badge>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
