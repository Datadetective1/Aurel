import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CircleCheck, Download, Eye, Lock } from 'lucide-react'
import { ApertureField } from '@/components/brand/aperture'
import { HeroBrief } from '@/components/marketing/home/hero-brief'
import { RelationshipVisual } from '@/components/marketing/home/relationship'
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
 * Five sections, each led by the product itself -- compositions built from the
 * app's own interface pieces and invented people (see
 * `components/marketing/home/fixtures`) -- with one heading and at most a line
 * of copy:
 *
 *   hero            the brief at a glance
 *   how             before, during, after
 *   relationships   who is connected, what happened, what is owed
 *   pricing+trust   Free and Pro from lib/billing/plans; four principles
 *   final CTA
 *
 * Sized so a phone reaches the closing call to action in about six screens.
 * Section ids are the ones the marketing header and older links point at.
 * =============================================================================
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Relationships />
      <PricingAndTrust />
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
        className="font-display text-ink mt-2.5 text-[1.75rem] leading-tight text-balance sm:text-[2.5rem]"
      >
        {title}
      </h2>
      {line ? (
        <p className="text-ink-secondary mt-2.5 text-[0.9375rem] leading-relaxed sm:text-lg">
          {line}
        </p>
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
        className="pointer-events-none absolute top-10 right-0 hidden h-[36rem] w-[40rem] rounded-full opacity-[0.55] blur-3xl lg:block"
        style={{
          background: 'radial-gradient(closest-side, var(--accent-wash), transparent 70%)',
        }}
      />

      <Container size="wide">
        <div className="relative grid items-center gap-8 pt-8 pb-12 sm:pt-12 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-20">
          <div>
            <h1 className="font-display text-ink text-[2.375rem] leading-[1.04] tracking-[-0.02em] text-balance sm:text-6xl">
              Walk into every room prepared.
            </h1>
            <p className="text-ink-secondary mt-4 max-w-lg text-base leading-relaxed sm:text-lg">
              Who you&rsquo;re meeting, what matters to them, and what you owe &mdash; in one
              glance, before you walk in.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
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

            <p className="text-ink-muted mt-3 text-xs">Free to start. No card required.</p>
          </div>

          <HeroBrief className="mx-auto w-full max-w-[30rem] lg:max-w-[32rem]" />
        </div>
      </Container>
    </section>
  )
}

function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="border-line bg-bg-sunken scroll-mt-20 border-y py-12 sm:py-20"
    >
      <Container size="wide">
        <SectionHeading id="how-title" eyebrow="How it works" title="Before. During. After." />
        <div className="mt-7 sm:mt-10">
          <Stages />
        </div>
      </Container>
    </section>
  )
}

function Relationships() {
  return (
    <section id="memory" aria-labelledby="memory-title" className="scroll-mt-20 py-12 sm:py-20">
      {/* Older links pointed at sections this one now holds. */}
      <span id="research" className="block scroll-mt-20" />
      <span id="follow" className="block scroll-mt-20" />
      <Container size="wide">
        <SectionHeading
          id="memory-title"
          eyebrow="Relationship intelligence"
          title={`${brand.name} remembers the relationship, not just the meeting.`}
          line="Who's connected, what happened last time, and what's owed — each with its source."
        />
        <RelationshipVisual className="mt-7 sm:mt-10" />
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

/** How many plan highlights the homepage summary shows; /pricing has them all. */
const HIGHLIGHTS = 3

function PricingAndTrust() {
  // Free leads with the Interaction Profile, which is not a plan difference
  // worth a summary line; Pro's first three are its headline additions.
  const plans = [
    { plan: PLANS.free, highlights: PLANS.free.highlights.slice(1, 1 + HIGHLIGHTS) },
    { plan: PLANS.pro, highlights: PLANS.pro.highlights.slice(0, HIGHLIGHTS) },
  ]
  return (
    <section
      aria-labelledby="pricing-title"
      className="border-line bg-bg-sunken border-y py-12 sm:py-20"
    >
      <Container size="default">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title="Start free. Upgrade when it earns it."
          center
        />
        <div className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4">
          {plans.map(({ plan, highlights }) => {
            const pro = plan.id === 'pro'
            return (
              <div
                key={plan.id}
                className={cn(
                  'rounded-[var(--radius-xl)] border p-5 sm:p-6',
                  pro ? 'border-accent/30 bg-accent-wash' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-ink text-2xl">{plan.name}</h3>
                  <p className="flex items-baseline gap-1.5">
                    <span className="font-display text-ink text-3xl">
                      {plan.monthlyPriceCents === 0 ? '$0' : formatPrice(plan.monthlyPriceCents)}
                    </span>
                    <span className="text-ink-secondary text-xs">
                      {plan.monthlyPriceCents === 0 ? 'no card' : 'per month'}
                    </span>
                  </p>
                </div>
                <ul className="mt-4 grid gap-1.5">
                  {highlights.map((h) => (
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
        <p className="mt-3 text-center">
          <Link
            href="/pricing"
            className="text-accent decoration-accent/40 hover:decoration-accent inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
          >
            Compare plans in full
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </p>

        <div id="trust" className="border-line mt-8 scroll-mt-20 border-t pt-8 sm:mt-12 sm:pt-10">
          <h2 className="font-display text-ink text-center text-xl leading-snug text-balance sm:text-2xl">
            Say what is known, and say what isn&rsquo;t.
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:mt-7 lg:grid-cols-4">
            {TRUST.map((item) => (
              <li key={item.title} className="flex gap-2.5">
                <item.icon className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="text-ink block text-sm leading-snug font-medium">
                    {item.title}
                  </span>
                  <span className="text-ink-muted mt-1 hidden text-[0.8125rem] leading-relaxed sm:block">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center">
            <Link
              href="/privacy"
              className="text-accent decoration-accent/40 hover:decoration-accent inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
            >
              Read the privacy approach
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-14 sm:py-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <ApertureField
          className="text-ink absolute -bottom-44 left-1/2 h-[26rem] w-[30rem] -translate-x-1/2"
          rings={5}
          accentRing={1}
          intensity={1.1}
        />
      </div>
      <Container size="narrow" className="relative text-center">
        <h2 className="font-display text-ink text-[1.75rem] leading-tight text-balance sm:text-[2.75rem]">
          Your next important meeting is already on the calendar.
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
