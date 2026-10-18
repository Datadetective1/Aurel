import { ScenarioRunner } from '@/components/onboarding/scenario-runner'
import { OnboardingProgress } from '@/components/onboarding/progress'
import { FinishLaterButton } from '@/components/onboarding/step-shell'
import { startOrResumeScenarioAssessment } from './scenario-actions'
import { finishOnboardingLater } from '../actions'
import { CORE_SCENARIOS } from '@/lib/assessment/scenarios'
import { brand } from '@/lib/brand'

export const metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

/**
 * The opening six scenarios -- optional, and offered after first value rather
 * than before it. The remaining twelve are asked later, one at a time, from
 * Today or Settings.
 */
export default async function AssessmentPage() {
  const { assessmentId, responses } = await startOrResumeScenarioAssessment()

  return (
    <>
      <OnboardingProgress step="assessment" />
      <ScenarioRunner
        assessmentId={assessmentId}
        scenarios={CORE_SCENARIOS}
        initialAnswers={responses}
        finishHref="/onboarding/reveal"
        finishLabel={`See my ${brand.assessmentName}`}
      />
      {/* Answers already given are saved as they are chosen, so leaving keeps
          them; the profile can be finished from Settings at any point. */}
      <form action={finishOnboardingLater} className="mt-2">
        <FinishLaterButton />
      </form>
    </>
  )
}
