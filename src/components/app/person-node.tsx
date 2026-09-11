import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * PERSON NODE
 * =============================================================================
 * A face on the Atlas. The photo is the node; the name sits under it; and a
 * small card appears on hover or keyboard focus with the role, the company,
 * and the one fact that says how the relationship is doing. Pure CSS: no
 * client state, no portal, and it works with a keyboard because the card is
 * shown on focus as well as hover.
 * =============================================================================
 */

export interface PersonNodeData {
  id: string
  name: string
  fullName: string
  src: string | null
  title: string | null
  company: string | null
  /** "3 open", "Last spoke 2 weeks ago", "No contact recorded". */
  status: string | null
  statusTone?: 'neutral' | 'critical' | 'caution'
}

export function PersonNode({ person, className }: { person: PersonNodeData; className?: string }) {
  const subtitle = [person.title, person.company].filter(Boolean).join(' · ')
  return (
    <Link
      href={`/people/${person.id}`}
      className={cn(
        'group relative flex w-24 flex-col items-center gap-2 rounded-[var(--radius-md)] p-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        className,
      )}
    >
      <Avatar
        name={person.fullName}
        src={person.src}
        size="lg"
        className={cn(
          'group-hover:ring-accent-graphic group-focus-visible:ring-accent-graphic ring-2 ring-transparent transition-shadow',
          person.statusTone === 'critical' && 'ring-critical/40',
          person.statusTone === 'caution' && 'ring-caution/40',
        )}
      />
      <span className="text-ink w-full truncate text-xs">{person.name}</span>

      {/* Mini card. Sits above the node, revealed on hover or focus. */}
      <span
        role="tooltip"
        className="border-line bg-surface pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-56 -translate-x-1/2 rounded-[var(--radius-md)] border p-3 text-left opacity-0 shadow-[var(--shadow-md)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <span className="font-display text-ink block text-base leading-tight">{person.name}</span>
        <span className="text-ink-secondary mt-0.5 block text-xs">
          {subtitle || 'No role recorded'}
        </span>
        {person.status ? (
          <span
            className={cn(
              'mt-2 block text-[0.6875rem] tracking-[0.04em] uppercase',
              person.statusTone === 'critical'
                ? 'text-critical'
                : person.statusTone === 'caution'
                  ? 'text-caution'
                  : 'text-ink-muted',
            )}
          >
            {person.status}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
