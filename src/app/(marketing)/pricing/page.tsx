import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { ApertureRule } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Panel } from '@/components/ui/primitives'
import { PLANS } from '@/lib/billing/plans'
import { PlanSelector } from '@/components/marketing/plan-selector'
import { brand, title } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Pricing',
  description: `What ${brand.name} costs, and what each plan includes.`,
  alternates: { canonical: '/pricing' },
  openGraph: { title: title('Pricing'), description: brand.description },
}

const FAQ = [
  {
    q: 'Do I pay per person I add?',
    a: `No, and that is deliberate. ${brand.name} only gets useful when you add the people you actually work with, so charging per person would work against the whole point. Pro has no limit on people. What is metered is the expensive work: researching a public footprint, generating briefs, analyzing transcripts.`,
  },
  {
    q: 'What happens to my data if I stop paying?',
    a: 'Nothing is deleted. Your account drops to the free plan, your relationship record stays intact and readable, and you can export all of it as JSON at any time.',
  },
  {
    q: 'Is my relationship record private?',
    a: `It is scoped to your account at the database level. It is not shared with anyone, and it is not used to train a shared model. On a team plan, your private notes stay private — sharing is always an explicit act.`,
  },
  {
    q: 'What does "research" actually do?',
    a: `From a name, a company and a role it searches for legitimate public professional material — company biographies, talks, articles, interviews — checks that each page is genuinely about the right person, and extracts professional facts with a link back to the source. You can add a link or a note yourself when you have something specific. It does not scrape platforms that prohibit it, and it ignores anything about someone's private life.`,
  },
  {
    q: 'Can I cancel?',
    a: 'At any time, from Settings. You keep access until the end of the period you have paid for.',
  },
]

export default function PricingPage() {
  const free = PLANS.free
  const pro = PLANS.pro
  const team = PLANS.team

  return (
    <>
      <section className="border-b border-line py-20 sm:py-24">
        <Container size="wide">
          <div className="max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
              Priced for the conversations that matter.
            </h1>
            <p className="mt-6 leading-relaxed text-ink-secondary">
              Start free. Upgrade when {brand.name} has enough of your relationship record to be
              genuinely useful — which is usually after the first few meetings you prepare for.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {/* --- free ------------------------------------------------------- */}
            <Panel className="flex flex-col p-7">
              <h2 className="font-display text-2xl text-ink">{free.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{free.tagline}</p>

              <p className="mt-6 font-display text-4xl text-ink">Free</p>
              <p className="mt-1 text-xs text-ink-muted">No card required.</p>

              <ul className="mt-7 grid flex-1 gap-3">
                {free.highlights.map((item) => (
                  <Feature key={item}>{item}</Feature>
                ))}
              </ul>

              <Button asChild variant="secondary" size="lg" className="mt-8 w-full">
                <Link href="/sign-up">Start free</Link>
              </Button>
            </Panel>

            {/* --- pro -------------------------------------------------------- */}
            {/* "Founding price" is gone from here: no Stripe price backed it, so
                the number on the card was not the number the card would have
                charged -- see FOUNDING_OFFER. What replaced it is a
                recommendation, which is ours to make. "Most popular" would not
                have been: this has sold to nobody yet. */}
            <Panel className="relative flex flex-col border-accent/30 bg-accent-wash p-7">
              <Badge tone="accent" className="absolute -top-2.5 left-7">
                Recommended
              </Badge>

              <h2 className="font-display text-2xl text-ink">{pro.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{pro.tagline}</p>

              {/* Price, period toggle and the button that starts checkout. The
                  only interactive part of this page, and the only part that is
                  a client component. */}
              <PlanSelector>
                <ul className="grid gap-3">
                  {pro.highlights.map((item) => (
                    <Feature key={item}>{item}</Feature>
                  ))}
                </ul>
              </PlanSelector>
            </Panel>

            {/* --- teams ------------------------------------------------------ */}
            <Panel className="flex flex-col p-7">
              <h2 className="font-display text-2xl text-ink">{team.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{team.tagline}</p>

              <p className="mt-6 font-display text-4xl text-ink">Talk to us</p>
              <p className="mt-1 text-xs text-ink-muted">Per seat, billed annually.</p>

              <ul className="mt-7 grid flex-1 gap-3">
                {team.highlights.map((item) => (
                  <Feature key={item}>{item}</Feature>
                ))}
              </ul>

              <Button asChild variant="secondary" size="lg" className="mt-8 w-full">
                <a href={`mailto:${brand.email.support}?subject=${encodeURIComponent(`${brand.name} for teams`)}`}>
                  Get in touch
                </a>
              </Button>
            </Panel>
          </div>

          <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-muted">
            Fair-use limits apply to the expensive operations — researching a person, generating
            briefs, analyzing transcripts. They are set well above normal use; if you hit one, tell
            us and we will look at it.
          </p>
        </Container>
      </section>

      {/* --- what is actually metered --------------------------------------------- */}
      <section className="py-20 sm:py-24">
        <Container size="narrow">
          <Eyebrow>What is metered</Eyebrow>
          <h2 className="mt-4 font-display text-3xl leading-tight text-ink">
            You are not charged for remembering people.
          </h2>
          <p className="mt-6 leading-relaxed text-ink-secondary">
            The value of {brand.name} compounds with the size of your relationship record, so making
            you ration it would be self-defeating. Storing people, observations, notes, interactions
            and commitments is unmetered on every plan.
          </p>
          <p className="mt-4 leading-relaxed text-ink-secondary">
            What is metered is the work that genuinely costs something to run: reading the public
            web, generating a brief, analyzing a transcript, and extended coach use.
          </p>

          <ApertureRule className="my-12" />

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-ink">Never metered</p>
              <ul className="mt-3 grid gap-2.5">
                {['People', 'Observations and memory', 'Notes and interactions', 'Commitments', 'Data export'].map(
                  (item) => (
                    <Feature key={item}>{item}</Feature>
                  ),
                )}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Metered, generously</p>
              <ul className="mt-3 grid gap-2.5">
                {[
                  'Researching a public footprint',
                  'Meeting briefs',
                  'Transcript and document analysis',
                  `${brand.assistantName} conversations`,
                ].map((item) => (
                  <Feature key={item}>{item}</Feature>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* --- FAQ ------------------------------------------------------------------- */}
      <section className="border-t border-line bg-bg-sunken py-20 sm:py-24">
        <Container size="narrow">
          <Eyebrow>Questions</Eyebrow>
          <dl className="mt-8 grid gap-8">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-display text-lg text-ink">{item.q}</dt>
                <dd className="mt-2.5 leading-relaxed text-ink-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-14">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start free
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Container>
      </section>

      <FaqStructuredData />
    </>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-ink-secondary">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      {children}
    </li>
  )
}

function FaqStructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
