import { redirect } from 'next/navigation'
import { CircleHelp, Sparkle } from 'lucide-react'
import { ApertureRule } from '@/components/brand/aperture'
import { Fingerprint } from '@/components/onboarding/fingerprint'
import { CalibrationForm } from '@/components/onboarding/calibration-form'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getScoredAssessment } from '@/lib/ai/context'
import type { ProfileNarrative } from '@/lib/ai/prompts/coaching'
import { brand } from '@/lib/brand'

export const metadata = {
  title: `Your ${brand.assessmentName}`,
  robots: { index: false, follow: false },
}

const CONFIDENCE_COPY = {
  provisional: {
    tone: 'caution' as const,
    label: 'Provisional',
    body: 'You answered enough for a first read, but not consistently enough to be confident. Treat this as a starting point.',
  },
  moderate: {
    tone: 'info' as const,
    label: 'Moderate confidence',
    body: 'Your answers covered every dimension and mostly pointed the same way.',
  },
  strong: {
    tone: 'positive' as const,
    label: 'Strong confidence',
    body: 'You answered every round, covered every dimension, and answered consistently.',
  },
}

export default async function RevealPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, archetype, narrative, coverage, consistency, calibration')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assessment) redirect('/onboarding/assessment')

  const scored = await getScoredAssessment(supabase, user.id, assessment.id)
  const narrative = assessment.narrative as ProfileNarrative | null
  const confidence = CONFIDENCE_COPY[scored.confidence]

  const stage = (index: number) => ({
    animation: 'settle 0.7s var(--ease-out-quint) both',
    animationDelay: `${0.1 + index * 0.12}s`,
  })

  return (
    <div className="py-6">
      <div style={stage(0)}>
        <Eyebrow>Your {brand.assessmentName}</Eyebrow>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] text-ink sm:text-6xl">
          The {scored.archetype}
        </h1>
      </div>

      {narrative?.summary ? (
        <p
          className="mt-6 max-w-2xl text-base leading-relaxed text-ink-secondary sm:text-lg"
          style={stage(1)}
        >
          {narrative.summary}
        </p>
      ) : null}

      {/* Confidence is disclosed up front, not buried. */}
      <div className="mt-7 flex flex-wrap items-center gap-3" style={stage(2)}>
        <Badge tone={confidence.tone}>{confidence.label}</Badge>
        <p className="max-w-md text-xs leading-relaxed text-ink-muted">{confidence.body}</p>
      </div>

      <ApertureRule className="my-12" />

      <section style={stage(3)}>
        <Eyebrow>Your communication fingerprint</Eyebrow>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
          Eight tendencies, each on a continuum. Neither end is better — the point is knowing your
          default so you can tell when a situation calls for something else.
        </p>
        <Fingerprint dimensions={scored.dimensions} className="mt-9" />
      </section>

      <ApertureRule className="my-12" />

      {narrative ? (
        <div className="grid gap-11">
          <NarrativeSection
            eyebrow="Your natural default"
            description="How you tend to communicate, decide and collaborate when nothing forces you to adapt."
            items={narrative.naturalDefault}
          />
          <div className="grid gap-11 sm:grid-cols-2">
            <NarrativeSection eyebrow="At your best" items={narrative.atYourBest} />
            <NarrativeSection
              eyebrow="Under pressure"
              items={narrative.underPressure}
              description="The same tendencies, stretched."
            />
          </div>
          <div className="grid gap-11 sm:grid-cols-2">
            <NarrativeSection
              eyebrow="People may experience you as"
              items={narrative.howOthersExperienceYou}
            />
            <NarrativeSection eyebrow="You work best when" items={narrative.youWorkBestWhen} />
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink-secondary">
            Your scores are saved, but the written summary did not generate. Your fingerprint above
            is complete — you can regenerate the summary from Settings.
          </p>
        </div>
      )}

      <ApertureRule className="my-12" />

      <section>
        <div className="flex items-start gap-2.5">
          <Sparkle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 className="font-display text-2xl text-ink">Does this sound like you?</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">
              Your answer carries more weight than the instrument does. If this is off, {brand.name} treats
              your correction as the higher-priority evidence from here on.
            </p>
          </div>
        </div>

        <CalibrationForm
          assessmentId={assessment.id}
          defaultRating={assessment.calibration ?? undefined}
          className="mt-7"
        />
      </section>

      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-ink-faint">
        The {brand.assessmentName} is a self-report personalisation tool for professional
        communication. It is not a clinical, diagnostic or psychometric instrument, it has no
        validation study behind it, and it must not be used to assess anyone&rsquo;s suitability for
        a role.
      </p>
    </div>
  )
}

function NarrativeSection({
  eyebrow,
  description,
  items,
}: {
  eyebrow: string
  description?: string
  items: string[]
}) {
  if (items.length === 0) return null
  return (
    <section>
      <Eyebrow>{eyebrow}</Eyebrow>
      {description ? <p className="mt-2 text-xs text-ink-muted">{description}</p> : null}
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-secondary">
            <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-accent-graphic" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
