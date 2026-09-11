import Link from 'next/link'
import { Portrait } from './person-portrait'
import { FaceStack } from './face-stack'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * THE ROOM
 * =============================================================================
 * Who a brief or a conversation is about, as faces first.
 *
 * One person: a large portrait with name, role, company and how you know
 * them, because preparing for Jonathan should look like preparing for
 * Jonathan. A few people: a row of portraits with names, scrolling sideways
 * on a phone rather than wrapping into a wall. Many people: a face stack and
 * the names, so the header stays a header.
 * =============================================================================
 */

export interface RoomPerson {
  id: string
  name: string
  fullName: string
  src: string | null
  title?: string | null
  company?: string | null
  /** "Decision maker", "Your manager" -- whatever places them. */
  context?: string | null
}

const ROLE_LABEL: Record<string, string> = {
  decision_maker: 'Decision maker',
  influencer: 'Influencer',
  contributor: 'Contributor',
  informed: 'Informed',
  presenter: 'Presenter',
  other: '',
}

export function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null
  return ROLE_LABEL[role] ?? null
}

export function RoomStrip({
  people,
  eyebrow,
  className,
  /** Sizes for the single-person case. */
  hero = false,
}: {
  people: RoomPerson[]
  eyebrow?: string
  className?: string
  hero?: boolean
}) {
  if (people.length === 0) return null

  if (people.length === 1) {
    const p = people[0]!
    const subtitle = [p.title, p.company].filter(Boolean).join(' · ')
    return (
      <div className={cn('flex items-center gap-4 sm:gap-5', className)}>
        <Portrait
          personId={p.id}
          name={p.fullName}
          src={p.src}
          size={hero ? '2xl' : 'xl'}
          addable
          persistent
        />
        <div className="min-w-0">
          {eyebrow ? <p className="label mb-1.5">{eyebrow}</p> : null}
          <Link
            href={`/people/${p.id}`}
            className="font-display text-ink hover:text-accent text-xl sm:text-2xl"
          >
            {p.name}
          </Link>
          {subtitle ? <p className="text-ink-secondary mt-0.5 text-sm">{subtitle}</p> : null}
          {p.context ? (
            <div className="mt-2">
              <Badge tone="neutral">{p.context}</Badge>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (people.length <= 4) {
    return (
      <div className={cn('min-w-0', className)}>
        {eyebrow ? <p className="label mb-3">{eyebrow}</p> : null}
        <ul className="-mx-1 flex scrollbar-none gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {people.map((p) => {
            const subtitle = [p.title, p.company].filter(Boolean).join(' · ')
            return (
              <li
                key={p.id}
                className="border-line bg-surface flex w-56 shrink-0 items-center gap-3 rounded-[var(--radius-lg)] border p-3 sm:w-auto sm:min-w-52"
              >
                <Portrait personId={p.id} name={p.fullName} src={p.src} size="lg" addable />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${p.id}`}
                    className="text-ink hover:text-accent block truncate text-sm font-medium"
                  >
                    {p.name}
                  </Link>
                  {subtitle ? <p className="text-ink-muted truncate text-xs">{subtitle}</p> : null}
                  {p.context ? (
                    <p className="text-accent mt-1 text-[0.6875rem] tracking-[0.04em] uppercase">
                      {p.context}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      {eyebrow ? <p className="label mb-3">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <FaceStack people={people} size="lg" max={5} ringClassName="ring-bg" />
        <p className="text-ink-secondary text-sm">
          {people.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? (i === people.length - 1 ? ' and ' : ', ') : ''}
              <Link href={`/people/${p.id}`} className="text-ink hover:text-accent">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
