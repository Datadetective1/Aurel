import { AssessmentRunner } from '@/components/onboarding/assessment-runner'
import { startOrResumeAssessment } from './actions'
import { brand } from '@/lib/brand'

export const metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

export default async function AssessmentPage() {
  const { assessmentId, responses } = await startOrResumeAssessment()
  return <AssessmentRunner assessmentId={assessmentId} initialResponses={responses} />
}
