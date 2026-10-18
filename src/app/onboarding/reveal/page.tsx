import { redirect } from 'next/navigation'
import { RevealView } from '@/components/onboarding/reveal-view'
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
  let confidence: 'provisional' | 'moderate' | 'strong'
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

  return (
    <RevealView
      assessmentId={assessment.id}
      archetype={archetype}
      confidence={confidence}
      tendencies={tendencies}
      explanation={explanation}
      calibration={assessment.calibration ?? undefined}
    />
  )
}
