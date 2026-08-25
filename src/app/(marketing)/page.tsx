import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  Eye,
  Layers,
  Lock,
  MessageSquareQuote,
  PenLine,
  Rewind,
  Telescope,
  Users,
} from 'lucide-react'
import { ApertureField, ApertureRule } from '@/components/brand/aperture'
import { HeroDemo } from '@/components/marketing/hero-demo'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow } from '@/components/ui/primitives'
import { brand, title } from '@/lib/brand'

export const metadata: Metadata = {
  // Absolute: the root template appends the brand name, which would double it here.
  title: { absolute: title() },
  description: brand.description,
  alternates: { canonical: '/' },
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <Memory />
      <Trust />
      <AfterTheMeeting />
      <Privacy />
      <FinalCta />
      <StructuredData />
    </>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/*
        Deliberately no motif field behind the hero. Nested arches at viewport
        scale stop reading as a threshold and start reading as stripes; the
        headline and the brief panel are stronger carrying this moment alone.
        The motif appears where it has room to be itself: the mark, the section
        rules, the reveal and the final CTA.
      */}
      <div className="via-accent-graphic/40 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent" />
      {/* A single warm lift behind the panel, so it sits above the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 hidden h-[42rem] w-[46rem] rounded-full opacity-[0.55] blur-3xl lg:block"
        style={{
          background: 'radial-gradient(closest-side, var(--accent-wash), transparent 70%)',
        }}
      />

      <Container size="wide">
        {/* Top-aligned: the brief panel is much taller than the copy, and
            centring it leaves the headline stranded in the lower half. */}
        <div className="relative grid items-start gap-14 py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
          <div className="lg:pt-6">
            <Badge tone="outline" className="mb-7">
              Professional relationship intelligence
            </Badge>

            <h1 className="font-display text-ink text-[2.75rem] leading-[1.04] tracking-[-0.02em] sm:text-6xl">
              Walk into every room prepared.
            </h1>

            <p className="text-ink-secondary mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
              {brand.name} turns the people, the history and the context around a meeting into
              practical guidance for the conversations that decide things.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Build your {brand.assessmentName.toLowerCase()}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>

            <p className="text-ink-muted mt-5 text-xs">
              Free to start. No card required. Your relationship record is yours — export or delete
              it at any time.
            </p>
          </div>

          <HeroDemo className="elevate" />
        </div>
      </Container>
    </section>
  )
}

function Problem() {
  return (
    <section className="border-line bg-bg-sunken border-y py-20 sm:py-24">
      <Container size="narrow">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-[2.5rem]">
          Important conversations usually start cold.
        </h2>
        <div className="text-ink-secondary mt-7 space-y-5 text-base leading-relaxed">
          <p>
            You know this person. You have met them nine times. But the detail that actually
            mattered — the objection they raised in March, the evidence they asked for before they
            would commit, the thing you promised and never closed — is spread across your notebook,
            your inbox and your memory.
          </p>
          <p className="text-ink">
            So you walk in with a general sense of someone, and rebuild the context from scratch.
            Every time.
          </p>
        </div>

        <ApertureRule className="my-12" />

        <p className="font-display text-ink text-2xl leading-snug sm:text-3xl">
          Personality is only the beginning. Context changes everything.
        </p>
        <p className="text-ink-secondary mt-5 max-w-xl leading-relaxed">
          The same person needs a different conversation depending on your relationship with them,
          what is being decided, who else is in the room, and what happened last time. A profile
          cannot tell you that. A record can.
        </p>
      </Container>
    </section>
  )
}

/**
 * The four-beat story, in the order a user actually lives it.
 *
 * The first beat is the V2 addition and the reason the arc changed: value now
 * begins BEFORE the first meeting, not after the first debrief. Every claim
 * here describes behaviour that ships — pasting a link genuinely produces a
 * source-backed footprint, which is why it is safe to say so publicly.
 */
const STEPS = [
  {
    icon: Telescope,
    eyebrow: 'Before the first meeting',
    title: 'Start with public context',
    body: `Paste a link — a company bio, a talk, an article — and ${brand.name} reads it, checks it is genuinely about that person, and builds a professional footprint where every claim links back to its source. Useful before you have ever spoken.`,
  },
  {
    icon: Users,
    eyebrow: 'Walking in',
    title: 'Prepare for the room',
    body: 'State what you need to achieve and get a brief: how to open, what to emphasise, what each person will want to see, and the objections to expect. Public context is labelled as public — never dressed up as a read on the person.',
  },
  {
    icon: PenLine,
    eyebrow: 'Afterwards',
    title: 'Capture what actually happened',
    body: `Paste your notes and ${brand.name} proposes what is worth remembering. Nothing enters your record until you confirm it.`,
  },
  {
    icon: Rewind,
    eyebrow: 'Next time',
    title: 'Your record outranks the internet',
    body: 'Once you have worked with someone, what you observed leads the brief and the public material falls behind it. That reversal is the point: a bio tells you who someone is, your record tells you how they work with you.',
  },
]

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-24">
      <Container size="wide">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-[2.5rem]">
            Useful before the first meeting. Sharper after it.
          </h2>
        </div>

        <div className="border-line bg-line mt-14 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.title} className="bg-bg p-7 sm:p-8">
              <step.icon className="text-accent size-5" aria-hidden="true" />
              <Eyebrow className="mt-5 block">{step.eyebrow}</Eyebrow>
              <h3 className="font-display text-ink mt-2 text-xl">{step.title}</h3>
              <p className="text-ink-secondary mt-3 text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Memory() {
  return (
    <section id="memory" className="border-line bg-bg-sunken scroll-mt-20 border-y py-20 sm:py-24">
      <Container size="wide">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Eyebrow>Relationship memory</Eyebrow>
            <h2 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-[2.5rem]">
              It remembers what you learned last time.
            </h2>
            <p className="text-ink-secondary mt-6 leading-relaxed">
              This is the part a general-purpose assistant cannot do. It does not know that Maya
              challenged your assumptions in March and came around when you showed the historical
              data. {brand.name} does, because you told it — and it brings that back the next time
              it matters.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                'What each person has asked for before they commit',
                'Objections they have already raised, and what answered them',
                'Commitments still open between you',
                'What you have actually learned about working together',
              ].map((item) => (
                <li key={item} className="text-ink-secondary flex gap-3 text-sm">
                  <CircleCheck className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <figure className="border-line bg-surface rounded-[var(--radius-lg)] border p-7 sm:p-9">
            <MessageSquareQuote className="text-accent-graphic size-5" aria-hidden="true" />
            <blockquote className="font-display text-ink mt-5 text-xl leading-snug sm:text-2xl">
              &ldquo;Last time you presented this forecast, Maya challenged the assumptions but
              moved once you showed the historical utilisation. Bring that evidence earlier this
              time.&rdquo;
            </blockquote>
            <figcaption className="text-ink-muted mt-6 flex items-center gap-2 text-xs">
              <Eye className="text-info size-3.5" aria-hidden="true" />
              Observed across two recorded interactions
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  )
}

const EVIDENCE_TIERS = [
  {
    icon: CircleCheck,
    label: 'Confirmed',
    tone: 'text-positive',
    body: 'They said it, or you confirmed it. Stated plainly, as fact.',
  },
  {
    icon: Eye,
    label: 'Observed',
    tone: 'text-info',
    body: 'It happened, across interactions you recorded. Always attributed to them.',
  },
  {
    icon: CircleHelp,
    label: 'Inferred',
    tone: 'text-caution',
    body: 'A reading of thin evidence. Always hedged, and always yours to correct.',
  },
  {
    icon: Layers,
    label: 'Unknown',
    tone: 'text-ink-muted',
    body: `Not enough to say. ${brand.name} tells you so instead of filling the gap.`,
  },
]

function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 py-20 sm:py-24">
      <Container size="wide">
        <div className="max-w-2xl">
          <Eyebrow>Evidence and transparency</Eyebrow>
          <h2 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-[2.5rem]">
            You can always see why it said that.
          </h2>
          <p className="text-ink-secondary mt-6 leading-relaxed">
            Guidance about real colleagues has to be honest about how much it actually knows. Every
            claim in {brand.name} carries its evidence level, and every brief shows the record it
            was built from.
          </p>
        </div>

        <div className="border-line bg-line mt-12 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border sm:grid-cols-2 lg:grid-cols-4">
          {EVIDENCE_TIERS.map((tier) => (
            <div key={tier.label} className="bg-bg p-6">
              <tier.icon className={`size-4 ${tier.tone}`} aria-hidden="true" />
              <p className="text-ink mt-4 text-sm font-medium">{tier.label}</p>
              <p className="text-ink-muted mt-2 text-[0.8125rem] leading-relaxed">{tier.body}</p>
            </div>
          ))}
        </div>

        <p className="text-ink-secondary mt-8 max-w-xl text-sm leading-relaxed">
          {brand.name} is comfortable saying{' '}
          <span className="text-ink">&ldquo;I don&rsquo;t have enough evidence yet.&rdquo;</span>{' '}
          That is a feature. Confident guidance built on nothing is worse than no guidance.
        </p>
      </Container>
    </section>
  )
}

function AfterTheMeeting() {
  return (
    <section className="border-line bg-bg-sunken border-y py-20 sm:py-24">
      <Container size="narrow">
        <Eyebrow>After the meeting</Eyebrow>
        <h2 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-[2.5rem]">
          Nothing is remembered without your say-so.
        </h2>
        <p className="text-ink-secondary mt-6 leading-relaxed">
          Paste your notes and {brand.name} pulls out the decisions, the commitments and the
          objections — then proposes what is worth keeping about each person. You save it, edit it,
          or throw it away.
        </p>

        <div className="border-line bg-surface mt-9 rounded-[var(--radius-lg)] border p-6">
          <Eyebrow>Worth remembering?</Eyebrow>
          <p className="text-ink mt-3 text-sm leading-relaxed">
            &ldquo;Daniel asked for the cost impact before the recommendation.&rdquo;
          </p>
          <p className="text-ink-muted mt-2 text-xs">
            From your notes on &ldquo;Q3 capacity review&rdquo;.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled aria-hidden="true" tabIndex={-1}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled aria-hidden="true" tabIndex={-1}>
              Edit
            </Button>
            <Button size="sm" variant="quiet" disabled aria-hidden="true" tabIndex={-1}>
              Dismiss
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Privacy() {
  return (
    <section className="py-20 sm:py-24">
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Lock className="text-accent size-5" aria-hidden="true" />
            <Eyebrow className="mt-5 block">Privacy and control</Eyebrow>
            <h2 className="font-display text-ink mt-3 text-3xl leading-tight">
              You are storing notes about real colleagues.
            </h2>
          </div>
          <div>
            <p className="text-ink-secondary leading-relaxed">
              That deserves to be treated carefully. {brand.name} is a private record you keep about
              your own working relationships — not a database of people, and not something shared
              with anyone else.
            </p>
            <ul className="mt-7 grid gap-3.5 sm:grid-cols-2">
              {[
                'Every record is scoped to your account at the database level',
                'Delete a person, an observation or your whole account at any time',
                'Export everything you have stored',
                'Never infers race, health, beliefs, or any protected characteristic',
                'No hiring, firing, promotion or compensation scoring',
                'Your notes are never used to train a shared model',
              ].map((item) => (
                <li key={item} className="text-ink-secondary flex gap-2.5 text-sm">
                  <CircleCheck className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/privacy"
              className="text-accent decoration-accent/40 hover:decoration-accent mt-7 inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
            >
              Read the privacy approach
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-line bg-bg-sunken relative overflow-hidden border-t py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <ApertureField
          className="text-ink absolute -bottom-40 left-1/2 h-[30rem] w-[34rem] -translate-x-1/2"
          rings={5}
          accentRing={1}
          intensity={1.1}
        />
      </div>
      <Container size="narrow" className="relative text-center">
        <h2 className="font-display text-ink text-3xl leading-tight sm:text-[2.75rem]">
          The next conversation that matters is already on your calendar.
        </h2>
        <p className="text-ink-secondary mx-auto mt-6 max-w-lg leading-relaxed">
          Build your {brand.assessmentName.toLowerCase()}, add the people who matter, and walk in
          knowing what to say first.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">
              Get started free
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

/** JSON-LD so search engines describe the product accurately, not aspirationally. */
function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: brand.longDescription,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free plan with limited people and meeting briefs.',
    },
  }
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
