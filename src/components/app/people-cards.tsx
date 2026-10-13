import Link from 'next/link'
import { CalendarClock, Handshake, Inbox } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { CompanyMark } from '@/components/visual/company-mark'
import { Chip } from '@/components/visual/chip'
import { cn } from '@/lib/utils'

/**
 * PEOPLE, AS A SCANNABLE LIST
 * =============================================================================
 * One compact row per person: face, name, role and organisation (with its
 * mark), and on the right the facts that decide whether to open the row --
 * what is open, when you next meet, whether anything waits on review. When
 * you last spoke sits quietly under the name.
 *
 * No "Add photo" on every empty face: in a list the person is the subject,
 * and adding a photo belongs on their page. Still the user's private record,
 * not a directory -- no stats, no scores, no feeds.
 * =============================================================================
 */

export interface PersonCardData {
  id: string
  name: string
  fullName: string
  src: string | null
  title: string | null
  company: string | null
  companyDomain?: string | null
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
    <ul
      className={cn(
        'border-line bg-surface divide-line grid divide-y overflow-hidden rounded-[var(--radius-lg)] border lg:grid-cols-2 lg:divide-y-0',
        className,
      )}
    >
      {people.map((p) => (
        <li key={p.id} className="lg:border-line min-w-0 lg:border-b lg:odd:border-r">
          <Link
            href={`/people/${p.id}`}
            className="group hover:bg-bg-sunken/60 flex min-h-16 items-center gap-3 px-3.5 py-2.5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Avatar name={p.fullName} src={p.src} size="md" />
            <span className="min-w-0 flex-1">
              <span className="text-ink group-hover:text-accent block truncate text-[0.9375rem] leading-tight font-medium">
                {p.name}
              </span>
              <span className="text-ink-secondary mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                {p.company ? (
                  <CompanyMark name={p.company} domain={p.companyDomain} size="xs" />
                ) : null}
                <span className="truncate">
                  {[p.title, p.company].filter(Boolean).join(' · ') || p.relationship}
                </span>
              </span>
              <span className="text-ink-muted mt-0.5 block truncate text-xs">
                {p.lastSpokeLabel ? `Last spoke ${p.lastSpokeLabel}` : 'No conversation yet'}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {p.nextLabel ? (
                <Chip icon={CalendarClock} tone="info" className="px-2">
                  {p.nextLabel.replace(/^Next /, '')}
                </Chip>
              ) : null}
              {p.openLoops > 0 ? (
                <Chip icon={Handshake} tone="neutral" className="px-2">
                  <span className="sr-only">Open loops: </span>
                  {p.openLoops}
                </Chip>
              ) : null}
              {p.toReview > 0 ? (
                <Chip icon={Inbox} tone="neutral" className="px-2">
                  <span className="sr-only">To review: </span>
                  {p.toReview}
                </Chip>
              ) : null}
              {p.isDemo ? <Chip tone="quiet">Demo</Chip> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
