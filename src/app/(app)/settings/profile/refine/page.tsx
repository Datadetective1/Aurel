import type { Metadata } from 'next'
import { AssessmentRunner } from '@/components/onboarding/assessment-runner'
import { startOrResumeAssessment } from '@/app/onboarding/assessment/actions'
import { Container } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: `Refine your ${brand.assessmentName}`,
  robots: { index: false, follow: false },
}

/**
 * Refinement.
 *
 * The same runner, the same blocks, the same order and the same scoring — the
 * only difference from the opening sitting is that this one opens the whole
 * instrument instead of the first six rounds. It resumes wherever the last
 * sitting stopped, so somebody who has answered six lands on round seven.
 *
 * Deliberately not a second assessment. There is one assessment row per
 * account, and every sitting adds responses to it and re-scores.
 */
export default async function RefineProfilePage() {
  const { assessmentId, responses } = await startOrResumeAssessment()

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <AssessmentRunner
        assessmentId={assessmentId}
        initialResponses={responses}
        finishHref="/settings/profile"
        finishLabel="Save my progress"
        headingLevel="h2"
      />
    </Container>
  )
}
