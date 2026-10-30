import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { TOTAL_COUNT, SCENARIO_VERSION } from '@/lib/assessment/scenarios'
import { scoreStoredScenarios } from '@/lib/assessment/stored-scenarios'
import { firstRead } from '@/lib/assessment/first-read'
import { getScoredAssessment } from '@/lib/ai/context'
import type { ProfileNarrative } from '@/lib/ai/prompts/coaching'
import { ProfileDetail } from '@/components/onboarding/profile-detail'
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
    .select(
      'id, archetype, completed_at, calibration, calibration_note, instrument_version, narrative',
    )
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

  const { count: answered } =
    assessment && !isLegacy
      ? await supabase
          .from('scenario_responses')
          .select('scenario_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('assessment_id', assessment.id)
      : { count: 0 }

  const answeredCount = answered ?? 0
  const refined = !isLegacy && answeredCount >= TOTAL_COUNT

  // The full fingerprint, scored from the stored answers. The scenario path
  // also yields the composed first read, which stands in for the narrative
  // until that has been written.
  const detail = assessment
    ? isLegacy
      ? {
          dimensions: (await getScoredAssessment(supabase, user.id, assessment.id)).dimensions,
          contextDependent: new Set<string>(),
          read: null,
        }
      : await (async () => {
          const scored = await scoreStoredScenarios(supabase, user.id, assessment.id)
          return {
            dimensions: scored.dimensions,
            contextDependent: new Set<string>(
              scored.dimensions.filter((d) => d.contextDependent).map((d) => d.dimension),
            ),
            read: firstRead(scored, brand.name),
          }
        })()
    : null

  return (
    <div>
      <Eyebrow>{brand.assessmentName}</Eyebrow>

      {assessment ? (
        <>
          <p className="font-display text-ink mt-4 text-2xl">{assessment.archetype}</p>
          <p className="text-ink-muted mt-1 text-xs">
            {isLegacy
              ? 'Built with an earlier version of the questions.'
              : refined
                ? `Fully refined: all ${TOTAL_COUNT} answered.`
                : `Profile refinement: ${answeredCount} of ${TOTAL_COUNT}`}
            {assessment.completed_at
              ? ` · last scored ${formatDate(assessment.completed_at, timeZone)}`
              : ''}
          </p>

          {isLegacy ? (
            <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">
              The questions have been rewritten as plain workplace situations, and this profile came
              from the earlier set. It still works, but a fresh one will be built from questions
              that were clearer to answer.
            </p>
          ) : !refined ? (
            <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">
              Built from your answers and refined as you use {brand.name}. It is usable now. Each
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
                <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">
                  &ldquo;{assessment.calibration_note}&rdquo;
                </p>
              ) : null}
              <p className="text-ink-muted mt-2 text-xs">
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

          {detail ? (
            <div className="border-line mt-10 border-t pt-10">
              <ProfileDetail
                dimensions={detail.dimensions}
                contextDependent={detail.contextDependent}
                narrative={(assessment.narrative as ProfileNarrative | null) ?? null}
                read={detail.read}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-ink-secondary mt-4 max-w-lg text-sm leading-relaxed">
            You have not started your {brand.assessmentName.toLowerCase()} yet. The first few rounds
            take about a minute and are enough to personalize guidance; you can refine it whenever
            you like.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/onboarding/assessment">Take it now</Link>
          </Button>
        </>
      )}

      <div className="border-line mt-10 border-t pt-8">
        <Eyebrow>More about you</Eyebrow>
        <p className="text-ink-secondary mt-3 max-w-lg text-sm leading-relaxed">
          Your goals, any assessments you have taken before, and your coaching context. Optional:
          each one makes suggestions a little more specific.
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-4 h-11">
          <Link href="/onboarding/intent">Add context</Link>
        </Button>
      </div>

      <p className="text-ink-faint mt-10 max-w-lg text-xs leading-relaxed">
        The {brand.assessmentName} is a self-report personalization tool for professional
        communication. It is not a clinical, diagnostic or psychometric instrument, and it must not
        be used to assess anyone&rsquo;s suitability for a role.
      </p>
    </div>
  )
}
