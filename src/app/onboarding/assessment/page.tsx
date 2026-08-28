import { AssessmentRunner } from '@/components/onboarding/assessment-runner'
import { startOrResumeAssessment } from './actions'
import { INITIAL_BLOCK_COUNT } from '@/lib/assessment/instrument'
import { brand } from '@/lib/brand'

export const metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

export default async function AssessmentPage() {
  const { assessmentId, responses } = await startOrResumeAssessment()
  // The opening sitting only. The remaining blocks are not discarded -- they
  // are answered later, from Settings or one at a time on Today.
  return (
    <AssessmentRunner
      assessmentId={assessmentId}
      initialResponses={responses}
      roundLimit={INITIAL_BLOCK_COUNT}
    />
  )
}
