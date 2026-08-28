import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { TOTAL_COUNT, SCENARIO_VERSION } from '@/lib/assessment/scenarios'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

const CALIBRATION_LABEL: Record<string, string> = {
  very_accurate: 'Very accurate',
  mostly_accurate: 'Mostly accurate',
  partly_accurate: 'Partly accurate',
  not_accurate: 'Not accurate',
}

export default async function InteractionProfileSettingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, archetype, completed_at, calibration, calibration_note, instrument_version')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // How much of the instrument has been answered. Refinement is optional, so
  // this is stated as progress rather than as an outstanding task.
  // A profile built by the retired forced-choice instrument is not refined in
  // place. Its questions no longer exist, so the honest offer is a fresh start
  // rather than a progress bar toward a set it was never part of.
  const isLegacy = Boolean(assessment) && assessment!.instrument_version !== SCENARIO_VERSION

  const { count: answered } = assessment && !isLegacy
    ? await supabase
        .from('scenario_responses')
        .select('scenario_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('assessment_id', assessment.id)
    : { count: 0 }

  const answeredCount = answered ?? 0
  const refined = !isLegacy && answeredCount >= TOTAL_COUNT

  return (
    <div>
      <Eyebrow>{brand.assessmentName}</Eyebrow>

      {assessment ? (
        <>
          <p className="mt-4 font-display text-2xl text-ink">{assessment.archetype}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {isLegacy
              ? 'Built with an earlier version of the questions.'
              : refined
                ? `Fully refined — all ${TOTAL_COUNT} answered.`
                : `Profile refinement: ${answeredCount} of ${TOTAL_COUNT}`}
            {assessment.completed_at
              ? ` · last scored ${formatDate(assessment.completed_at, timeZone)}`
              : ''}
          </p>

          {isLegacy ? (
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
              The questions have been rewritten as plain workplace situations, and this profile came
              from the earlier set. It still works, but a fresh one will be built from questions
              that were clearer to answer.
            </p>
          ) : !refined ? (
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
              Built from your answers and refined as you use {brand.name}. It is usable now — each
              further question narrows where you actually sit, and {brand.name} says how sure it is
              rather than presenting a partial read as a finished one.
            </p>
          ) : null}

          {assessment.calibration ? (
            <div className="mt-6">
              <Eyebrow>Your verdict</Eyebrow>
              <div className="mt-2">
                <Badge tone="neutral">{CALIBRATION_LABEL[assessment.calibration]}</Badge>
              </div>
              {assessment.calibration_note ? (
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
                  &ldquo;{assessment.calibration_note}&rdquo;
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-muted">
                {brand.name} weights your correction above the instrument&rsquo;s own output.
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-2">
            {isLegacy ? (
              <Button asChild size="sm">
                <Link href="/settings/profile/refine">Answer the new questions</Link>
              </Button>
            ) : !refined ? (
              <Button asChild size="sm">
                <Link href="/settings/profile/refine">
                  Continue refining ({TOTAL_COUNT - answeredCount} left)
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <Link href="/onboarding/reveal">View my full profile</Link>
            </Button>
            {/* Was "Retake the assessment", which this does not do: the
                destination resumes the existing run and asks the questions
                that have not been answered yet. Nothing is discarded and no
                answer is asked twice. Under progressive profiling, resuming is
                the correct behaviour -- the label was the part that was
                wrong. */}
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings/profile/refine">Answer more questions</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-secondary">
            You have not started your {brand.assessmentName.toLowerCase()} yet. The first few
            rounds take about a minute and are enough to personalize guidance; you can refine it
            whenever you like.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/onboarding/assessment">Take it now</Link>
          </Button>
        </>
      )}

      <p className="mt-10 max-w-lg text-xs leading-relaxed text-ink-faint">
        The {brand.assessmentName} is a self-report personalization tool for professional
        communication. It is not a clinical, diagnostic or psychometric instrument, and it must not
        be used to assess anyone&rsquo;s suitability for a role.
      </p>
    </div>
  )
}
