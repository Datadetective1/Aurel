import Link from 'next/link'
import { Portrait } from './person-portrait'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * PEOPLE CARDS
 * =============================================================================
 * The People page as a room of people rather than a table of rows. A card
 * per person: a 56px portrait, the name in display type, role and company,
 * and the two facts that make the list scannable -- what is open between
 * you and when you last spoke. Three across on a desktop, one on a phone.
 *
 * Still the user's private record, not a directory: no stats, no scores, no
 * feeds. The face is the point.
 * =============================================================================
 */

export interface PersonCardData {
  id: string
  name: string
  fullName: string
  src: string | null
  title: string | null
  company: string | null
  relationship: string
  lastSpokeLabel: string | null
  nextLabel: string | null
  openLoops: number
  toReview: number
  learned: number
  isDemo: boolean
}

export function PeopleCards({
  people,
  className,
}: {
  people: PersonCardData[]
  className?: string
}) {
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {people.map((p) => {
        const subtitle = [p.title, p.company].filter(Boolean).join(' · ')
        return (
          <li key={p.id} className="min-w-0">
            <div className="group border-line bg-surface hover:border-line-strong relative flex h-full flex-col rounded-[var(--radius-lg)] border p-4 transition-colors">
              <div className="flex items-start gap-3.5">
                <Portrait personId={p.id} name={p.fullName} src={p.src} size="lg" addable />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${p.id}`}
                    className="font-display text-ink group-hover:text-accent block text-lg leading-tight after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {p.name}
                  </Link>
                  <p className="text-ink-secondary mt-0.5 truncate text-sm">
                    {subtitle || p.relationship}
                  </p>
                  {subtitle ? (
                    <p className="text-ink-muted truncate text-xs">{p.relationship}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {p.isDemo ? <Badge tone="outline">Demo</Badge> : null}
                {p.toReview > 0 ? <Badge tone="accent">{p.toReview} to review</Badge> : null}
                {p.openLoops > 0 ? (
                  <Badge tone="caution">
                    {p.openLoops} open {p.openLoops === 1 ? 'loop' : 'loops'}
                  </Badge>
                ) : null}
                {p.nextLabel ? <Badge tone="info">{p.nextLabel}</Badge> : null}
              </div>

              <p className="text-ink-muted mt-auto pt-3 text-xs">
                {p.lastSpokeLabel ? `Last spoke ${p.lastSpokeLabel}` : 'No conversation kept yet'}
                {p.learned > 0
                  ? ` · ${p.learned} ${p.learned === 1 ? 'thing' : 'things'} learned`
                  : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
