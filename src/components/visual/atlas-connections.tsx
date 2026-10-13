import Link from 'next/link'
import {
  Building2,
  CalendarCheck,
  CircleCheck,
  Eye,
  GraduationCap,
  Handshake,
  History,
  MessagesSquare,
  UserCheck,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { ConnectionKind } from '@/lib/visual/commonality'
import type { VisualConnection } from '@/lib/visual/types'
import { cn } from '@/lib/utils'

/**
 * ATLAS: THE VISUAL LANGUAGE, AND CONNECTIONS ON RECORD
 * =============================================================================
 * The Atlas is not a social graph. It draws a line between two people only
 * where the user's own record holds both ends -- the same meeting, the same
 * kept conversation, the same past employer or school in sourced facts -- and
 * says in words what the line rests on.
 *
 * The legend fixes one mark per kind of node so the same shapes mean the same
 * things on the web and in the app: people are circles, organisations are
 * rounded squares, events and evidence are small icons. A user-confirmed
 * connection carries a check; an observed one, an eye.
 * =============================================================================
 */

export const CONNECTION_ICON: Record<ConnectionKind, typeof Building2> = {
  same_organization: Building2,
  former_employer: History,
  education: GraduationCap,
  shared_meeting: CalendarCheck,
  shared_conversation: MessagesSquare,
}

export interface AtlasPerson {
  id: string
  name: string
  fullName: string
  src: string | null
}

export function AtlasConnections({
  connections,
  people,
  className,
}: {
  connections: VisualConnection[]
  people: Map<string, AtlasPerson>
  className?: string
}) {
  if (connections.length === 0) return null

  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {connections.map((c) => {
        const a = people.get(c.a)
        const b = people.get(c.b)
        if (!a || !b) return null
        const Icon = CONNECTION_ICON[c.kind]
        const EvidenceIcon = c.evidence === 'confirmed' ? CircleCheck : Eye
        return (
          <li
            key={`${c.a}-${c.b}-${c.kind}-${c.label}`}
            className="border-line bg-surface flex items-center gap-3 rounded-[var(--radius-lg)] border p-3"
          >
            <span className="flex shrink-0 items-center" aria-hidden="true">
              <Avatar name={a.fullName} src={a.src} size="md" className="ring-surface ring-2" />
              <span className="bg-line-strong h-px w-4" />
              <span className="border-line bg-bg-sunken text-ink-secondary flex size-7 items-center justify-center rounded-full border">
                <Icon className="size-3.5" />
              </span>
              <span className="bg-line-strong h-px w-4" />
              <Avatar name={b.fullName} src={b.src} size="md" className="ring-surface ring-2" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-sm">
                <Link href={`/people/${a.id}`} className="hover:text-accent">
                  {a.name}
                </Link>{' '}
                <span className="text-ink-muted">&amp;</span>{' '}
                <Link href={`/people/${b.id}`} className="hover:text-accent">
                  {b.name}
                </Link>
              </span>
              <span className="text-ink-muted mt-0.5 flex items-center gap-1 text-xs">
                <EvidenceIcon className="size-3" aria-hidden="true" />
                <span className="sr-only">{c.evidence === 'confirmed' ? 'Confirmed: ' : 'Observed: '}</span>
                {c.description}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const LEGEND: { label: string; mark: React.ReactNode }[] = [
  {
    label: 'Person',
    mark: <span className="border-line bg-accent-wash block size-5 rounded-full border" />,
  },
  {
    label: 'Organization',
    mark: <span className="border-line bg-bg-sunken block size-5 rounded-[5px] border" />,
  },
  { label: 'Meeting', mark: <CalendarCheck className="size-4" /> },
  { label: 'Commitment', mark: <Handshake className="size-4" /> },
  { label: 'School', mark: <GraduationCap className="size-4" /> },
  { label: 'Past employer', mark: <History className="size-4" /> },
  { label: 'You confirmed', mark: <UserCheck className="size-4" /> },
]

export function AtlasLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="What the marks mean"
      className={cn('text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-xs', className)}
    >
      {LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-ink-secondary flex size-5 items-center justify-center">
            {item.mark}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
