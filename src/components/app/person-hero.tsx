import Link from 'next/link'
import { Portrait } from './person-portrait'
import { Badge } from '@/components/ui/primitives'
import { CompanyMark } from '@/components/visual/company-mark'
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
  /** Where the fact comes from, when that is not obvious: "You set this". */
  hint?: string
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
  companyDomain = null,
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
  /** The organisation's domain on record; the only basis for showing its logo. */
  companyDomain?: string | null
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
  // A real photo earns a large portrait; initials do not. With no photo the
  // face stays modest and sits beside the name, and the organisation's mark
  // and the relationship carry the identity instead of a giant circle.
  const portraitSize = src ? (size === 'page' ? '3xl' : '2xl') : size === 'page' ? 'xl' : 'lg'

  return (
    <header
      className={cn(
        'border-line bg-surface relative overflow-hidden rounded-[var(--radius-xl)] border',
        size === 'page' ? 'p-4 sm:p-6' : 'p-4 sm:p-5',
        className,
      )}
    >
      {/* A warm field behind the portrait side: the wash, not a flood. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(ellipse_at_left,var(--accent-wash),transparent_70%)]"
      />
      <div
        className={cn(
          'relative flex gap-4 sm:items-center sm:gap-6',
          src ? 'flex-col sm:flex-row' : 'flex-row items-start',
        )}
      >
        <Portrait
          personId={personId}
          name={fullName}
          src={src}
          size={portraitSize}
          addable
          persistent
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'font-display text-ink leading-tight',
              size === 'page' ? 'text-[1.75rem] sm:text-4xl' : 'text-2xl sm:text-3xl',
            )}
          >
            {name}
          </h1>
          <p
            className={cn(
              'text-ink-secondary mt-1 flex min-w-0 items-center gap-2',
              size === 'page' ? 'text-sm sm:text-base' : 'text-sm',
            )}
          >
            {company ? <CompanyMark name={company} domain={companyDomain} size="sm" /> : null}
            <span className="min-w-0">{subtitle || 'No role recorded yet'}</span>
          </p>

          {facts.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {facts.map((fact) => {
                const badge = (
                  <Badge tone={fact.tone ?? 'neutral'} title={fact.hint}>
                    {fact.label}
                    {fact.hint ? <span className="sr-only"> ({fact.hint})</span> : null}
                  </Badge>
                )
                return fact.href ? (
                  <Link key={fact.label} href={fact.href} className="rounded-full">
                    {badge}
                  </Link>
                ) : (
                  <span key={fact.label}>{badge}</span>
                )
              })}
            </div>
          ) : null}
        </div>

        {aside ? <div className="shrink-0 sm:self-start">{aside}</div> : null}
      </div>

      {actions ? <div className="relative mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}
