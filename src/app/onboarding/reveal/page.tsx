import { redirect } from 'next/navigation'
import { CircleHelp, Sparkle } from 'lucide-react'
import { ApertureRule } from '@/components/brand/aperture'
import { Fingerprint } from '@/components/onboarding/fingerprint'
import { CalibrationForm } from '@/components/onboarding/calibration-form'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getScoredAssessment } from '@/lib/ai/context'
import { SCENARIO_VERSION } from '@/lib/assessment/scenarios'
import { scoreStoredScenarios } from '@/lib/assessment/stored-scenarios'
import type { ProfileNarrative } from '@/lib/ai/prompts/coaching'
import { brand } from '@/lib/brand'

export const metadata = {
  title: `Your ${brand.assessmentName}`,
  robots: { index: false, follow: false },
}

const CONFIDENCE_COPY = {
  provisional: {
    // Not `caution`. A six-question profile is the intended first version, not
    // a fault, and a warning-coloured badge tells the user something went
    // wrong when nothing did. The honesty is in the words -- it says plainly
    // that it is early and will sharpen -- so the colour does not need to
    // carry a warning as well.
    tone: 'info' as const,
    label: 'Early read',
    // The old wording blamed inconsistency, which was the only way to be
    // provisional when everyone answered all 24. A short opening sitting is
    // now the usual reason, and telling someone their answers contradicted
    // each other when they simply have not finished would be false.
    body: `Usable now, built from your first answers. ${brand.name} sharpens it as you use the product, and says how sure it is rather than guessing at the gaps.`,
  },
  moderate: {
    tone: 'info' as const,
    label: 'Moderate confidence',
    body: 'Enough answers across enough tendencies to be useful, with room to sharpen.',
  },
  strong: {
    tone: 'positive' as const,
    label: 'Strong confidence',
    body: 'You worked through the whole set and leaned clearly on every tendency.',
  },
}

export default async function RevealPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, archetype, narrative, coverage, consistency, calibration, instrument_version')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assessment) redirect('/onboarding/assessment')

  // Two instruments can be in the database at once, and they are scored by
  // different functions over different tables. Which one produced a profile is
  // recorded on the row rather than guessed at.
  const isScenario = assessment.instrument_version === SCENARIO_VERSION

  const scored = isScenario
    ? await scoreStoredScenarios(supabase, user.id, assessment.id)
    : await getScoredAssessment(supabase, user.id, assessment.id)
  // Only the scenario instrument can produce this; the retired one had no way
  // for somebody to say "it depends".
  const contextDependentSet = new Set(
    isScenario
      ? (scored as { dimensions: { dimension: string; contextDependent?: boolean }[] }).dimensions
          .filter((d) => d.contextDependent)
          .map((d) => d.dimension)
      : [],
  )

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
        <Fingerprint
          dimensions={scored.dimensions}
          contextDependent={contextDependentSet}
          className="mt-9"
        />
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
        The {brand.assessmentName} is a self-report personalization tool for professional
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
