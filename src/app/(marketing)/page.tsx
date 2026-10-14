import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, CircleCheck, Download, Eye, Lock } from 'lucide-react'
import { ApertureField } from '@/components/brand/aperture'
import { AtlasVisual } from '@/components/marketing/home/atlas'
import { FollowThroughVisual } from '@/components/marketing/home/follow-through'
import { HeroBrief } from '@/components/marketing/home/hero-brief'
import { MemoryTimeline } from '@/components/marketing/home/memory-timeline'
import { RoomVisual } from '@/components/marketing/home/room'
import { Stages } from '@/components/marketing/home/stages'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { PLANS, formatPrice } from '@/lib/billing/plans'
import { absoluteUrl, brand, seoTitle, siteUrl } from '@/lib/brand'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  // Absolute: the root template appends the brand name, which would double it here.
  title: { absolute: seoTitle() },
  description: brand.description,
  alternates: { canonical: '/' },
}

/**
 * THE HOMEPAGE
 * =============================================================================
 * Shown, not told. Each section leads with the product itself -- compositions
 * built from the app's own interface pieces and invented people (see
 * `components/marketing/home/fixtures`) -- and carries one short heading and
 * at most a line of copy. The order is the loop the product closes:
 *
 *   hero          the brief you open on the way in
 *   the room      who you are meeting, and what connects you
 *   how           before, during, after
 *   memory        the relationship over time
 *   connections   the Atlas: every line traced
 *   follow-up     every promise, in both directions
 *   pricing       Free, and Pro at the price in lib/billing/plans
 *   trust         the four commitments that make it safe to use
 *
 * Section ids are the ones the marketing header links to.
 * =============================================================================
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Room />
      <HowItWorks />
      <Memory />
      <Connections />
      <FollowThrough />
      <Pricing />
      <Trust />
      <FinalCta />
      <StructuredData />
    </>
  )
}

function SectionHeading({
  id,
  eyebrow,
  title,
  line,
  center = false,
  className,
}: {
  id: string
  eyebrow: string
  title: string
  line?: string
  center?: boolean
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="font-display text-ink mt-3 text-[1.875rem] leading-tight text-balance sm:text-[2.5rem]"
      >
        {title}
      </h2>
      {line ? (
        <p className="text-ink-secondary mt-3 text-base leading-relaxed sm:text-lg">{line}</p>
      ) : null}
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="via-accent-graphic/40 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent" />
      {/* A single warm lift behind the product, so it sits above the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-10 right-0 hidden h-[40rem] w-[44rem] rounded-full opacity-[0.55] blur-3xl lg:block"
        style={{
          background: 'radial-gradient(closest-side, var(--accent-wash), transparent 70%)',
        }}
      />

      <Container size="wide">
        <div className="relative grid items-center gap-10 pt-10 pb-16 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-20">
          <div>
            <h1 className="font-display text-ink text-[2.5rem] leading-[1.04] tracking-[-0.02em] text-balance sm:text-6xl">
              Walk into every room prepared.
            </h1>
            <p className="text-ink-secondary mt-5 max-w-lg text-base leading-relaxed sm:text-lg">
              Who you&rsquo;re meeting, what matters to them, and what you owe &mdash; in one
              glance, before you walk in.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>

            <p className="text-ink-muted mt-4 text-xs">Free to start. No card required.</p>
          </div>

          <HeroBrief className="mx-auto w-full max-w-[34rem] lg:max-w-none" />
        </div>
      </Container>
    </section>
  )
}

function Room() {
  return (
    <section
      aria-labelledby="room-title"
      className="border-line bg-bg-sunken scroll-mt-20 border-y py-16 sm:py-24"
    >
      {/* The header used to link to a public-research section; the anchor
          stays so an old link lands on the closest thing, the room. */}
      <span id="research" className="block scroll-mt-20" />
      <Container size="wide">
        <SectionHeading
          id="room-title"
          eyebrow="See the room"
          title="Know who you're meeting before you walk in."
          center
        />
        <RoomVisual className="mx-auto mt-10 max-w-4xl sm:mt-12" />
      </Container>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-16 sm:py-24">
      <Container size="wide">
        <SectionHeading id="how-title" eyebrow="How it works" title="Before. During. After." />
        <div className="mt-10 sm:mt-12">
          <Stages />
        </div>
      </Container>
    </section>
  )
}

function Memory() {
  return (
    <section
      id="memory"
      aria-labelledby="memory-title"
      className="border-line bg-bg-sunken scroll-mt-20 border-y py-16 sm:py-24"
    >
      <Container size="wide">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <SectionHeading
              id="memory-title"
              eyebrow="Relationship memory"
              title="It remembers what happened last time."
              line="Every meeting, decision and promise, in order — ready when you meet again."
            />
            <ul className="mt-7 grid gap-2.5">
              {['What they asked for', 'What was decided', 'What was promised, and kept'].map(
                (item) => (
                  <li key={item} className="text-ink flex items-center gap-2.5 text-sm">
                    <Check className="text-accent size-4 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <MemoryTimeline className="mx-auto w-full max-w-xl lg:max-w-none" />
        </div>
      </Container>
    </section>
  )
}

const NOT_THIS = [
  { tool: 'A notes app', keeps: 'what was said' },
  { tool: 'A task manager', keeps: 'what to do' },
  { tool: brand.name, keeps: 'who, why, and what is owed between you', ours: true },
]

function Connections() {
  return (
    <section aria-labelledby="atlas-title" className="scroll-mt-20 py-16 sm:py-24">
      <Container size="wide">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <AtlasVisual className="order-2 lg:order-1" />
          <div className="order-1 lg:order-2">
            <SectionHeading
              id="atlas-title"
              eyebrow="Relationship intelligence"
              title="Every connection, traced."
              line="Drawn only from your meetings, your conversations and sources you approve. No scraping, no hidden profiles."
            />
            <dl className="border-line mt-7 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border">
              {NOT_THIS.map((row) => (
                <div
                  key={row.tool}
                  className={cn(
                    'flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-sm',
                    row.ours ? 'bg-accent-wash' : 'bg-surface',
                  )}
                >
                  <dt className={row.ours ? 'text-ink font-medium' : 'text-ink-secondary'}>
                    {row.tool}
                  </dt>
                  <dd className={row.ours ? 'text-ink' : 'text-ink-muted'}>keeps {row.keeps}.</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </section>
  )
}

function FollowThrough() {
  return (
    <section
      id="follow"
      aria-labelledby="follow-title"
      className="border-line bg-bg-sunken scroll-mt-20 border-y py-16 sm:py-24"
    >
      <Container size="wide">
        <SectionHeading
          id="follow-title"
          eyebrow="Follow through"
          title="Every promise, in both directions."
          line="What you owe, what you're waiting on, and what to bring up next time."
        />
        <FollowThroughVisual className="mt-10 sm:mt-12" />
      </Container>
    </section>
  )
}

function Pricing() {
  const plans = [PLANS.free, PLANS.pro]
  return (
    <section aria-labelledby="pricing-title" className="py-16 sm:py-24">
      <Container size="default">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title="Start free. Upgrade when it earns it."
          center
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const pro = plan.id === 'pro'
            return (
              <div
                key={plan.id}
                className={cn(
                  'flex flex-col rounded-[var(--radius-xl)] border p-6 sm:p-7',
                  pro ? 'border-accent/30 bg-accent-wash' : 'border-line bg-surface',
                )}
              >
                <h3 className="font-display text-ink text-2xl">{plan.name}</h3>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-ink text-4xl">
                    {pro ? formatPrice(plan.monthlyPriceCents) : '$0'}
                  </span>
                  <span className="text-ink-muted text-sm">
                    {pro ? 'per month' : 'no card required'}
                  </span>
                </p>
                <p className="text-ink-secondary mt-3 text-sm leading-relaxed">{plan.tagline}</p>
                <ul className="mt-5 grid gap-2">
                  {plan.highlights.slice(pro ? 0 : 1, pro ? 4 : 5).map((h) => (
                    <li key={h} className="text-ink-secondary flex gap-2.5 text-sm">
                      <CircleCheck
                        className="text-accent mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-center">
          <Link
            href="/pricing"
            className="text-accent decoration-accent/40 hover:decoration-accent inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
          >
            Compare plans in full
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </p>
      </Container>
    </section>
  )
}

const TRUST = [
  {
    icon: Eye,
    title: 'Evidence on every line',
    body: 'Confirmed, observed or inferred — always labelled.',
  },
  {
    icon: CircleCheck,
    title: 'Kept on your say-so',
    body: 'Nothing enters your record until you confirm it.',
  },
  {
    icon: Download,
    title: 'Yours to take or delete',
    body: 'Export everything, or delete it, at any time.',
  },
  {
    icon: Lock,
    title: 'Private by design',
    body: 'Scoped to your account. Never used to train a shared model.',
  },
]

function Trust() {
  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      className="border-line bg-bg-sunken scroll-mt-20 border-y py-16 sm:py-20"
    >
      <Container size="wide">
        <SectionHeading
          id="trust-title"
          eyebrow="Evidence and privacy"
          title="Notes about real colleagues, treated carefully."
        />
        <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((item) => (
            <li key={item.title}>
              <item.icon className="text-accent size-5" aria-hidden="true" />
              <h3 className="text-ink mt-3 text-[0.9375rem] font-medium">{item.title}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
        <Link
          href="/privacy"
          className="text-accent decoration-accent/40 hover:decoration-accent mt-8 inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
        >
          Read the privacy approach
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <ApertureField
          className="text-ink absolute -bottom-40 left-1/2 h-[30rem] w-[34rem] -translate-x-1/2"
          rings={5}
          accentRing={1}
          intensity={1.1}
        />
      </div>
      <Container size="narrow" className="relative text-center">
        <h2 className="font-display text-ink text-[1.875rem] leading-tight text-balance sm:text-[2.75rem]">
          Your next important meeting is already on the calendar.
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">
              Start free
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}

/**
 * JSON-LD so search engines describe the product accurately, not aspirationally.
 *
 * Three entities, because they answer three different questions Google asks:
 * Organization is who publishes this, WebSite is what the domain is, and
 * SoftwareApplication is what the thing does. They are linked by @id so the
 * graph reads as one publisher rather than three unrelated blobs.
 *
 * Deliberately absent: aggregateRating, review, and any offer beyond the free
 * plan that genuinely exists. Rich-result markup describing customers we do
 * not have is a manual-action risk, and there is nothing to gain from it while
 * the honest version says enough.
 */
function StructuredData() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': absoluteUrl('/#organization'),
      name: brand.legalEntity,
      url: siteUrl,
      logo: absoluteUrl('/icon.svg'),
      description: brand.longDescription,
      email: brand.email.support,
    },
    {
      '@type': 'WebSite',
      '@id': absoluteUrl('/#website'),
      name: brand.name,
      url: siteUrl,
      description: brand.description,
      publisher: { '@id': absoluteUrl('/#organization') },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': absoluteUrl('/#software'),
      name: brand.name,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: brand.longDescription,
      url: siteUrl,
      publisher: { '@id': absoluteUrl('/#organization') },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free plan with limited people and meeting briefs.',
      },
    },
  ]

  const data = { '@context': 'https://schema.org', '@graph': graph }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
