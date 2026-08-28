import type { Metadata } from 'next'
import { ScenarioRunner } from '@/components/onboarding/scenario-runner'
import { startOrResumeScenarioAssessment } from '@/app/onboarding/assessment/scenario-actions'
import { ALL_SCENARIOS } from '@/lib/assessment/scenarios'
import { Container } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: `Refine your ${brand.assessmentName}`,
  robots: { index: false, follow: false },
}

/**
 * Refinement: the same instrument, opened over all eighteen scenarios and
 * resuming at the first unanswered one. Not a second assessment -- there is one
 * assessment row per account per instrument version, and every sitting adds to
 * it and re-scores.
 */
export default async function RefineProfilePage() {
  const { assessmentId, responses } = await startOrResumeScenarioAssessment()

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <ScenarioRunner
        assessmentId={assessmentId}
        scenarios={ALL_SCENARIOS}
        initialAnswers={responses}
        finishHref="/settings/profile"
        finishLabel="Save my progress"
        headingLevel="h2"
      />
    </Container>
  )
}
