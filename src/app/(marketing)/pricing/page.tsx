import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { ApertureRule } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Panel } from '@/components/ui/primitives'
import { FOUNDING_OFFER, PLANS, foundingProtectionBlurb, formatPrice } from '@/lib/billing/plans'
import { allowanceRows } from '@/lib/billing/allowances'
import { TRIAL_DAYS } from '@/lib/billing/trial'
import { trialOfferOpen } from '@/lib/billing/stripe'
import { brand, title } from '@/lib/brand'

const PRICE = formatPrice(PLANS.pro.monthlyPriceCents)

export const metadata: Metadata = {
  title: 'Pricing',
  description: `What ${brand.name} costs, and what each plan includes.`,
  alternates: { canonical: '/pricing' },
  openGraph: { title: title('Pricing'), description: brand.description },
}

/** Asked only where the trial can actually be started. */
const TRIAL_FAQ = [
  {
    q: 'How does the Pro trial work?',
    a: `${TRIAL_DAYS} days of Pro, once per account, with no card. Start it from Settings › Plan after you sign up. Nothing is charged automatically: when it ends, your account returns to Free unless you choose Subscribe to Pro. We email you two to three days before it ends.`,
  },
  {
    q: 'What happens when the trial ends?',
    a: 'Nothing is deleted or archived. You can still read, edit and export everyone and everything. Adding a sixth active person, the Relationship Atlas and the larger monthly allowances need Pro.',
  },
  {
    q: 'If I subscribe during the trial, do I lose the rest of it?',
    a: `No. You see the first charge date before you confirm: the day the trial would have ended (at least two days after you subscribe). Then ${PRICE} every month until you cancel. We remind you two to three days before the first charge, and if you cancel before it you pay nothing.`,
  },
]

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
    a: `It is scoped to your account at the database level. It is not shared with anyone, and it is not used to train a shared model. That is the same on every plan, as are the evidence behind each fact, your corrections, and export.`,
  },
  {
    q: 'What does "research" actually do?',
    a: `From a name, a company and a role it searches for legitimate public professional material — company biographies, talks, articles, interviews — checks that each page is genuinely about the right person, and extracts professional facts with a link back to the source. You can add a link or a note yourself when you have something specific. It does not scrape platforms that prohibit it, and it ignores anything about someone's private life.`,
  },
  {
    q: 'Can I cancel?',
    a: 'At any time, from Settings › Plan. You keep Pro until the end of the period you have paid for.',
  },
]

type Faq = { q: string; a: string }[]

export default function PricingPage() {
  const free = PLANS.free
  const pro = PLANS.pro
  const protection = foundingProtectionBlurb()
  const allowances = allowanceRows()
  // The trial is advertised only where it can be started: subscribing works
  // and the offer is not switched off (PRO_TRIAL_OFFER=off).
  const trial = trialOfferOpen()
  const faq: Faq = trial ? [...TRIAL_FAQ, ...FAQ] : FAQ

  return (
    <>
      <section className="border-line border-b py-20 sm:py-24">
        <Container size="wide">
          <div className="max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="font-display text-ink mt-4 text-4xl leading-tight sm:text-5xl">
              Priced for the conversations that matter.
            </h1>
            <p className="text-ink-secondary mt-6 leading-relaxed">
              {trial
                ? `Start free with five people. Try Pro free for ${TRIAL_DAYS} days, no card: it returns to Free unless you subscribe, and nothing is deleted.`
                : 'Start free with five people. Move to Pro when it earns it; nothing is deleted if you move back.'}
            </p>
          </div>

          <div className="mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
            {/* --- free ------------------------------------------------------- */}
            <Panel className="flex flex-col p-7">
              <h2 className="font-display text-ink text-2xl">{free.name}</h2>
              <p className="text-ink-secondary mt-2 text-sm leading-relaxed">{free.tagline}</p>

              <p className="font-display text-ink mt-6 text-4xl">Free</p>
              <p className="text-ink-muted mt-1 text-xs">No card required.</p>

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
            <Panel className="border-accent/30 bg-accent-wash relative flex flex-col p-7">
              {FOUNDING_OFFER.enabled ? (
                <Badge tone="accent" className="absolute -top-2.5 left-7">
                  Founding price
                </Badge>
              ) : null}

              <h2 className="font-display text-ink text-2xl">{pro.name}</h2>
              <p className="text-ink-secondary mt-2 text-sm leading-relaxed">{pro.tagline}</p>

              <div className="mt-6 flex items-baseline gap-3">
                <p className="font-display text-ink text-4xl">
                  {formatPrice(pro.monthlyPriceCents)}
                </p>
                <span className="text-ink-muted text-sm">per month</span>
              </div>

              {/* Only claims that have been approved: no "was" price, no cap on
                  places, no lock period unless FOUNDING_OFFER sets one. */}
              {FOUNDING_OFFER.enabled && FOUNDING_OFFER.referencePriceCents ? (
                <p className="text-ink-secondary mt-1 text-xs">
                  <span className="line-through">
                    {formatPrice(FOUNDING_OFFER.referencePriceCents)}
                  </span>
                  {FOUNDING_OFFER.maxCustomers
                    ? ` for the first ${FOUNDING_OFFER.maxCustomers} members.`
                    : null}
                </p>
              ) : null}
              {protection ? <p className="text-ink-muted mt-1 text-xs">{protection}</p> : null}
              <p className="text-ink-muted mt-1 text-xs">Billed monthly. Cancel any time.</p>
              {trial ? (
                <p className="text-ink-secondary mt-3 text-xs leading-relaxed">
                  Try it free for {TRIAL_DAYS} days, no card. Start the trial from Settings › Plan
                  after you sign up.
                </p>
              ) : null}

              <ul className="mt-7 grid flex-1 gap-3">
                {pro.highlights.map((item) => (
                  <Feature key={item}>{item}</Feature>
                ))}
              </ul>

              <Button asChild size="lg" className="mt-8 w-full">
                <Link href="/sign-up">
                  {trial ? `Start your ${TRIAL_DAYS}-day trial` : 'Start free, move to Pro later'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </Panel>
          </div>

          <p className="text-ink-secondary mt-8 max-w-2xl text-sm leading-relaxed">
            On every plan: your record is private to your account, each fact shows the evidence
            behind it, you can correct anything, and you can export or delete everything.
          </p>
        </Container>
      </section>

      {/* --- the allowances, as enforced ----------------------------------------- */}
      <section className="border-line border-b py-20 sm:py-24">
        <Container size="narrow">
          <Eyebrow>Allowances</Eyebrow>
          <h2 className="font-display text-ink mt-4 text-3xl leading-tight">
            What each plan includes
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-line border-b">
                  <th scope="col" className="text-ink-muted py-2.5 pr-4 text-xs font-normal">
                    <span className="sr-only">Allowance</span>
                  </th>
                  <th scope="col" className="text-ink py-2.5 pr-4 font-medium">
                    {free.name}
                  </th>
                  <th scope="col" className="text-ink py-2.5 font-medium">
                    {pro.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {allowances.map((row) => (
                  <tr key={row.label} className="border-line border-b">
                    <th scope="row" className="text-ink-secondary py-2.5 pr-4 font-normal">
                      {row.label}
                    </th>
                    <td className="text-ink py-2.5 pr-4 tabular-nums">{row.free}</td>
                    <td className="text-ink py-2.5 tabular-nums">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-muted mt-4 text-xs leading-relaxed">
            Monthly allowances reset on the 1st. Unlimited means fair use: if you ever reach a
            limit, tell us and we will look at it.
          </p>
        </Container>
      </section>

      {/* --- what is actually metered --------------------------------------------- */}
      <section className="py-20 sm:py-24">
        <Container size="narrow">
          <Eyebrow>What is metered</Eyebrow>
          <h2 className="font-display text-ink mt-4 text-3xl leading-tight">
            You are not charged for remembering people.
          </h2>
          <p className="text-ink-secondary mt-6 leading-relaxed">
            The value of {brand.name} compounds with the size of your relationship record, so making
            you ration it would be self-defeating. Storing observations, notes, interactions and
            commitments is unmetered on every plan. Free holds up to five people; Pro has no limit
            on people.
          </p>
          <p className="text-ink-secondary mt-4 leading-relaxed">
            What is metered is the work that genuinely costs something to run: reading the public
            web, generating a brief, analyzing a transcript, transcribing voice, and answering
            questions.
          </p>

          <ApertureRule className="my-12" />

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-ink text-sm font-medium">Never metered</p>
              <ul className="mt-3 grid gap-2.5">
                {[
                  'Observations and memory',
                  'Notes and interactions',
                  'Commitments',
                  'Data export',
                ].map((item) => (
                  <Feature key={item}>{item}</Feature>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-ink text-sm font-medium">Metered, generously</p>
              <ul className="mt-3 grid gap-2.5">
                {[
                  'Researching a public footprint',
                  'Meeting briefs',
                  'Transcript and document analysis',
                  'Voice transcription minutes',
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
      <section className="border-line bg-bg-sunken border-t py-20 sm:py-24">
        <Container size="narrow">
          <Eyebrow>Questions</Eyebrow>
          <dl className="mt-8 grid gap-8">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="font-display text-ink text-lg">{item.q}</dt>
                <dd className="text-ink-secondary mt-2.5 leading-relaxed">{item.a}</dd>
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

      <FaqStructuredData faq={faq} />
    </>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-ink-secondary flex gap-2.5 text-sm leading-relaxed">
      <CircleCheck className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </li>
  )
}

function FaqStructuredData({ faq }: { faq: Faq }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
