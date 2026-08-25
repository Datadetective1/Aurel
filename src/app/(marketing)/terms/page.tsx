import type { Metadata } from 'next'
import { CircleAlert } from 'lucide-react'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Terms',
  description: `The terms under which ${brand.name} is provided.`,
  alternates: { canonical: '/terms' },
}

/**
 * TERMS
 * =============================================================================
 * A plain-language draft describing the actual arrangement. Not legally
 * reviewed; that is stated at the top and tracked in docs/HUMAN_ACTIONS.md.
 * =============================================================================
 */
export default function TermsPage() {
  return (
    <Container size="narrow" className="py-16 sm:py-24">
      <Eyebrow>Terms</Eyebrow>
      <h1 className="mt-4 font-display text-4xl leading-tight text-ink">Terms of service</h1>
      <p className="mt-6 leading-relaxed text-ink-secondary">
        The arrangement between you and {brand.legalEntity}, in plain language.
      </p>

      {!brand.legal.policiesLegallyReviewed ? (
        <p className="mt-8 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3.5 text-sm leading-relaxed text-ink-secondary">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
          <span>
            <strong className="font-medium text-ink">Draft.</strong> These terms describe the intended
            arrangement but have not been reviewed by a lawyer and are not yet a binding legal
            document.
          </span>
        </p>
      ) : null}

      <div className="mt-12 grid gap-10">
        <Section title="What the service is">
          <p>
            {brand.name} helps you prepare for professional conversations by keeping a private record
            of your working relationships and turning it into guidance. It is a personalisation and
            preparation tool.
          </p>
        </Section>

        <Section title="What it is not">
          <p>
            The {brand.assessmentName} is a self-report personalisation instrument. It is not a
            clinical, diagnostic or psychometric assessment, it has no validation study behind it,
            and it must not be used to assess anyone&rsquo;s suitability for a role.
          </p>
          <p>
            {brand.name} must not be used to make or support employment decisions — hiring, firing,
            promotion, compensation or discipline — or to build profiles of people for any purpose
            other than preparing for your own professional interactions with them.
          </p>
        </Section>

        <Section title="Your responsibilities">
          <ul className="grid gap-2 pl-5">
            <li className="list-disc">
              You are responsible for what you record, and for having a legitimate professional
              reason to record it.
            </li>
            <li className="list-disc">
              You must comply with the laws and workplace policies that apply to you, including data
              protection law where it covers notes about identifiable people.
            </li>
            <li className="list-disc">
              Do not record special-category personal data, or information about someone&rsquo;s
              private life.
            </li>
            <li className="list-disc">
              Do not use the service to harass, manipulate, or disadvantage anyone.
            </li>
          </ul>
        </Section>

        <Section title="Accuracy">
          <p>
            Guidance is generated or composed from records you supply and from public sources. It can
            be wrong. {brand.name} labels the evidence behind every claim precisely so you can judge
            it, and you remain responsible for what you say and do in your own conversations.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Your records remain yours. You grant {brand.legalEntity} only the permission needed to
            operate the service for you — storing, processing and displaying your content back to
            you. It is not used to train shared models and is not sold or shared.
          </p>
        </Section>

        <Section title="Payment">
          <p>
            Paid plans are billed in advance for the period you choose. You can cancel at any time
            from Settings and keep access until the end of that period. Fair-use limits apply to
            computationally expensive operations and are published on the pricing page.
          </p>
        </Section>

        <Section title="Ending the arrangement">
          <p>
            You can delete your account at any time, which destroys your record. We may suspend an
            account that is being used in breach of these terms, particularly for building profiles
            of people for purposes the service prohibits.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            The service is provided as-is. To the extent the law allows, {brand.legalEntity} is not
            liable for outcomes of conversations you have, decisions you make, or inaccuracies in
            generated guidance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            <a href={`mailto:${brand.email.support}`} className="text-accent hover:underline">
              {brand.email.support}
            </a>
          </p>
          <p className="text-xs text-ink-muted">
            {brand.legalEntity}, {brand.legal.entityAddress}. Governing law:{' '}
            {brand.legal.jurisdiction}. Last updated {brand.legal.policiesLastUpdated}.
          </p>
        </Section>
      </div>
    </Container>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <div className="mt-3 grid gap-3 leading-relaxed text-ink-secondary">{children}</div>
    </section>
  )
}
