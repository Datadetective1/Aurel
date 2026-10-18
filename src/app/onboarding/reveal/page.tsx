import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Sparkle } from 'lucide-react'
import { CalibrationForm } from '@/components/onboarding/calibration-form'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getScoredAssessment } from '@/lib/ai/context'
import { SCENARIO_VERSION } from '@/lib/assessment/scenarios'
import { scoreStoredScenarios } from '@/lib/assessment/stored-scenarios'
import { firstRead } from '@/lib/assessment/first-read'
import { describeDimension } from '@/lib/assessment/scoring'
import { brand } from '@/lib/brand'

export const metadata = {
  title: `Your ${brand.assessmentName}`,
  robots: { index: false, follow: false },
}

const CONFIDENCE_COPY = {
  provisional: {
    // Not `caution`. A six-question profile is the intended first version, not
    // a fault, and a warning-coloured badge tells the user something went
    // wrong when nothing did.
    tone: 'info' as const,
    label: 'Early read',
  },
  moderate: { tone: 'info' as const, label: 'Moderate confidence' },
  strong: { tone: 'positive' as const, label: 'Strong confidence' },
}

/**
 * THE FIRST-USE RESULT
 * =============================================================================
 * Short on purpose: the profile's name, how sure it is, three or four
 * tendencies and one plain sentence about what that rests on -- then Continue.
 *
 * The long version (the eight-dimension fingerprint and the written narrative)
 * still exists and lives in Settings → Interaction Profile, where somebody
 * curious goes looking for it. It used to all land here, at the end of setup,
 * ahead of the product the user signed up for; and its written half depended
 * on a model call the scenario path never made, so it ended on an error.
 *
 * Nothing here waits on a model. Every line is composed from the stored scores.
 * =============================================================================
 */
export default async function RevealPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, archetype, calibration, instrument_version')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assessment) redirect('/onboarding/assessment')

  const isScenario = assessment.instrument_version === SCENARIO_VERSION

  // Two instruments can be in the database at once. The retired one has no
  // first read of its own, so its top dimensions stand in for tendencies.
  let tendencies: { label: string; pole: string; blurb: string }[]
  let explanation: string
  let confidence: keyof typeof CONFIDENCE_COPY
  let archetype = assessment.archetype ?? ''

  if (isScenario) {
    const scored = await scoreStoredScenarios(supabase, user.id, assessment.id)
    const read = firstRead(scored, brand.name)
    tendencies = read.tendencies
    explanation = read.explanation
    confidence = scored.confidence
    archetype = archetype || scored.archetype
  } else {
    const scored = await getScoredAssessment(supabase, user.id, assessment.id)
    tendencies = scored.ranked
      .filter((d) => d.lean !== null)
      .slice(0, 4)
      .map((d) => describeDimension(d))
    explanation = `Built from your answers. ${brand.name} uses it to shape suggestions and says when it is unsure.`
    confidence = scored.confidence
  }

  const badge = CONFIDENCE_COPY[confidence]

  return (
    <div className="py-4">
      <Eyebrow>Your {brand.assessmentName}</Eyebrow>
      <h1 className="font-display text-ink mt-4 text-4xl leading-[1.05] sm:text-6xl">
        The {archetype}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <span className="text-ink-muted text-xs">
          Usable now. It sharpens as you use {brand.name}.
        </span>
      </div>

      {tendencies.length > 0 ? (
        <ul className="border-line mt-8 grid gap-4 border-t pt-6">
          {tendencies.map((t) => (
            <li key={t.label} className="flex gap-3">
              <span aria-hidden="true" className="bg-accent-graphic mt-2.5 h-px w-3 shrink-0" />
              <span className="min-w-0">
                <span className="text-ink block text-sm font-medium">
                  {t.pole} <span className="text-ink-muted font-normal">· {t.label}</span>
                </span>
                <span className="text-ink-secondary mt-0.5 block text-sm leading-relaxed">
                  {t.blurb}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-ink-secondary mt-6 max-w-xl text-sm leading-relaxed">{explanation}</p>

      <p className="mt-4">
        <Link
          href="/settings/profile"
          className="text-accent decoration-accent/40 hover:decoration-accent inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4"
        >
          See the full fingerprint
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </p>

      <section className="border-line mt-8 border-t pt-8">
        <div className="flex items-start gap-2.5">
          <Sparkle className="text-accent mt-1 size-4 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-ink text-xl">Does this sound like you?</h2>
            <p className="text-ink-secondary mt-1.5 max-w-xl text-sm leading-relaxed">
              Optional. If it is off, your correction outranks the questions from here on.
            </p>
          </div>
        </div>

        <CalibrationForm
          assessmentId={assessment.id}
          defaultRating={assessment.calibration ?? undefined}
          className="mt-6"
        />
      </section>

      <p className="text-ink-faint mt-10 max-w-2xl text-xs leading-relaxed">
        The {brand.assessmentName} is a self-report personalization tool for professional
        communication. It is not a clinical, diagnostic or psychometric instrument, it has no
        validation study behind it, and it must not be used to assess anyone&rsquo;s suitability for
        a role.
      </p>
    </div>
  )
}
