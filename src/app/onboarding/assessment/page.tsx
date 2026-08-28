import { ScenarioRunner } from '@/components/onboarding/scenario-runner'
import { startOrResumeScenarioAssessment } from './scenario-actions'
import { CORE_SCENARIOS } from '@/lib/assessment/scenarios'
import { brand } from '@/lib/brand'

export const metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

/**
 * The opening six scenarios. The remaining twelve are asked later, one at a
 * time, from Today or Settings.
 */
export default async function AssessmentPage() {
  const { assessmentId, responses } = await startOrResumeScenarioAssessment()

  return (
    <ScenarioRunner
      assessmentId={assessmentId}
      scenarios={CORE_SCENARIOS}
      initialAnswers={responses}
      finishHref="/onboarding/reveal"
      finishLabel={`See my ${brand.assessmentName}`}
    />
  )
}
