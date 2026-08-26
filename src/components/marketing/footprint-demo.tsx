import { Building2, CircleCheck, Eye, FileText, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * PROFESSIONAL FOOTPRINT — MARKETING SURFACE
 * =============================================================================
 * What Research Person produces, rendered the way the product renders it.
 *
 * A reconstruction in real DOM rather than a screenshot, for the same reasons
 * the hero panel is: it themes correctly in Pearl and Obsidian, it is crisp at
 * any density, it costs no image weight, its text is selectable and readable by
 * a screen reader — and it cannot quietly go stale the way a PNG of a UI does
 * the first time that UI changes.
 *
 * Every label here is the product's own vocabulary, taken from the real
 * components: the fact groups from FACT_GROUPS on the person page, the identity
 * states from source-controls, "From public research" from the provenance map,
 * OBSERVED from the evidence model. If those change, this reads as a lie, which
 * is the right pressure to be under.
 *
 * The person is fictional and is the same fictional person as the hero, so the
 * site tells one story. Putting a real individual's researched footprint on a
 * marketing page would be using someone's public record as an advertisement
 * without asking them.
 *
 * A server component. There is nothing to interact with, so it ships no JS.
 * =============================================================================
 */

const SOURCE_MARK = {
  company: { icon: Building2, label: 'company bio' },
  web: { icon: Globe, label: 'public web' },
  document: { icon: FileText, label: 'document' },
} as const

interface DemoSource {
  title: string
  publisher: string
  kind: keyof typeof SOURCE_MARK
  match: 'confirmed' | 'probable'
  facts: number
}

/**
 * Source-type marks rather than fetched favicons.
 *
 * A favicon means a request to a third party from the landing page, which tells
 * that third party who is reading the site. A glyph carries the same
 * information — what kind of source this is — and asks nobody's permission.
 */
const SOURCES: DemoSource[] = [
  {
    title: 'Leadership — Northwind Engineering',
    publisher: 'northwind.com',
    kind: 'company',
    match: 'confirmed',
    facts: 6,
  },
  {
    title: 'Rebuilding a platform team without stopping delivery',
    publisher: 'PlatformCon Europe',
    kind: 'web',
    match: 'probable',
    facts: 4,
  },
  {
    title: 'Capacity planning when the roadmap keeps moving',
    publisher: 'The Pragmatic Engineer',
    kind: 'web',
    match: 'probable',
    facts: 3,
  },
]

interface DemoFact {
  group: string
  claim: string
  detail: string
  source: string
}

const FACTS: DemoFact[] = [
  {
    group: 'Professional identity',
    claim: 'VP Engineering at Northwind',
    detail: 'Leads platform, developer tooling and the cloud migration programme.',
    source: 'Leadership — Northwind Engineering',
  },
  {
    group: 'Expertise',
    claim: 'Platform reliability and organisational scaling',
    detail: 'Recurring subject across her talks and written work.',
    source: 'Rebuilding a platform team without stopping delivery',
  },
  {
    group: 'Recurring public themes',
    claim: 'Migrations that do not interrupt delivery',
    detail: 'Returns to the cost of stopping feature work to pay down platform debt.',
    source: 'Capacity planning when the roadmap keeps moving',
  },
]

const MATCH_LABEL = {
  confirmed: { label: 'Confirmed match', tone: 'positive' as const },
  probable: { label: 'Probable match', tone: 'outline' as const },
}

export function FootprintDemo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-line bg-surface rounded-[var(--radius-lg)] border p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-ink text-lg">Public footprint</p>
        <p className="text-ink-muted text-[0.6875rem]">Built from 3 sources</p>
      </div>
      <p className="text-ink-muted mt-1 text-xs leading-relaxed">
        Every claim links back to where it came from.
      </p>

      <div className="mt-5 grid gap-4">
        {FACTS.map((fact) => (
          <div key={fact.claim} className="border-line border-t pt-4 first:border-t-0 first:pt-0">
            <p className="text-ink-faint text-[0.625rem] tracking-[0.1em] uppercase">
              {fact.group}
            </p>
            <p className="text-ink mt-1.5 text-sm leading-relaxed">
              <span className="font-medium">{fact.claim}</span>
              <span className="text-ink-secondary"> — {fact.detail}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ink-muted inline-flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
                <Eye className="text-info size-3 shrink-0" aria-hidden="true" />
                Observed
              </span>
              <span className="text-ink-faint text-[0.6875rem]">From public research</span>
              <span className="text-ink-faint truncate text-[0.6875rem]">{`· ${fact.source}`}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-line mt-6 border-t pt-5">
        <p className="text-ink-faint text-[0.625rem] tracking-[0.1em] uppercase">Sources</p>
        <ul className="mt-3 grid gap-2">
          {SOURCES.map((source) => {
            const mark = SOURCE_MARK[source.kind]
            const match = MATCH_LABEL[source.match]
            return (
              <li
                key={source.title}
                className="border-line bg-bg-sunken flex min-w-0 items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5"
              >
                {/* The glyph is the only thing carrying source type here, so
                    its meaning is spelled out for a screen reader rather than
                    hidden. The product shows the same information as a visible
                    badge; this panel has the space for one, not both. */}
                <span className="border-line-strong text-ink-muted mt-0.5 grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border">
                  <mark.icon className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{mark.label}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-[0.8125rem]">{source.title}</p>
                  <p className="text-ink-muted mt-0.5 truncate text-[0.6875rem]">
                    {source.publisher} · {source.facts} facts rest on this
                  </p>
                </div>
                <Badge tone={match.tone} className="mt-0.5 shrink-0">
                  {source.match === 'confirmed' ? (
                    <CircleCheck className="size-3" aria-hidden="true" />
                  ) : null}
                  {match.label}
                </Badge>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="text-ink-muted border-line mt-5 border-t pt-4 text-[0.6875rem] leading-relaxed">
        Wrong person? Mark the source and everything that rested on it alone is withdrawn.
      </p>
    </div>
  )
}
