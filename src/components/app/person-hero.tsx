import Link from 'next/link'
import { Portrait } from './person-portrait'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * PERSON HERO
 * =============================================================================
 * "This is Jonathan." before anything about Jonathan.
 *
 * A large portrait on a warm wash, the name in display type, the role and
 * company beneath, and the few facts that place the relationship: what they
 * are to you, when you last spoke, what is next. Actions sit below, never
 * competing with the face.
 *
 * With no photo, the initials tint carries the composition and the portrait
 * itself offers "Add photo" -- the person's page is the most natural place
 * to add one, and it should never require the edit form.
 * =============================================================================
 */

export interface HeroFact {
  label: string
  tone?: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info' | 'outline'
  href?: string
}

export function PersonHero({
  personId,
  name,
  fullName,
  src,
  title,
  company,
  facts = [],
  actions,
  aside,
  size = 'page',
  className,
}: {
  personId: string
  name: string
  fullName: string
  src: string | null
  title: string | null
  company: string | null
  facts?: HeroFact[]
  /** Buttons under the name. */
  actions?: React.ReactNode
  /** Something that belongs beside the person: a countdown, a stat. */
  aside?: React.ReactNode
  /** 'page' is the person page; 'card' is a hero inside another page. */
  size?: 'page' | 'card'
  className?: string
}) {
  const subtitle = [title, company].filter(Boolean).join(' · ')

  return (
    <header
      className={cn(
        'border-line bg-surface relative overflow-hidden rounded-[var(--radius-xl)] border',
        size === 'page' ? 'p-6 sm:p-8' : 'p-5 sm:p-6',
        className,
      )}
    >
      {/* A warm field behind the portrait side: the wash, not a flood. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(ellipse_at_left,var(--accent-wash),transparent_70%)]"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
        <Portrait
          personId={personId}
          name={fullName}
          src={src}
          size={size === 'page' ? '3xl' : '2xl'}
          addable
          persistent
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'font-display text-ink',
              size === 'page' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl',
            )}
          >
            {name}
          </h1>
          <p className={cn('text-ink-secondary mt-1', size === 'page' ? 'text-base' : 'text-sm')}>
            {subtitle || 'No role recorded yet'}
          </p>

          {facts.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {facts.map((fact) =>
                fact.href ? (
                  <Link key={fact.label} href={fact.href} className="rounded-full">
                    <Badge tone={fact.tone ?? 'neutral'}>{fact.label}</Badge>
                  </Link>
                ) : (
                  <Badge key={fact.label} tone={fact.tone ?? 'neutral'}>
                    {fact.label}
                  </Badge>
                ),
              )}
            </div>
          ) : null}

          {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
        </div>

        {aside ? <div className="shrink-0 sm:self-start">{aside}</div> : null}
      </div>
    </header>
  )
}
