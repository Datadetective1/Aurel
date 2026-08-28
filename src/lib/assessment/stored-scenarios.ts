import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { scoreScenarios } from './scenario-scoring'
import { SCENARIO_POLES, type ScenarioDimension } from './scenarios'
import type { DimensionId } from './instrument'

type Client = SupabaseClient<Database>

/**
 * Score a stored scenario assessment into the shape the reveal already renders.
 *
 * The Fingerprint component takes v1's DimensionScore. Rather than fork it, the
 * scenario score is mapped onto that shape — the six scenario dimensions share
 * their ids with six of v1's eight, so the mapping is a rename of fields rather
 * than a translation of meaning.
 *
 * `consistency` is reported as null. v1 derived it from directional agreement
 * across repeated keyed contributions, which a single-select instrument does
 * not produce, and inventing a number to fill the field would be exactly the
 * false precision this instrument replaced.
 */
export async function scoreStoredScenarios(
  supabase: Client,
  userId: string,
  assessmentId: string,
) {
  const { data } = await supabase
    .from('scenario_responses')
    .select('scenario_id, option_id')
    .eq('user_id', userId)
    .eq('assessment_id', assessmentId)

  const scored = scoreScenarios(
    (data ?? []).map((r) => ({ scenarioId: r.scenario_id, optionId: r.option_id })),
  )

  return {
    ...scored,
    dimensions: scored.dimensions.map((d) => ({
      dimension: d.dimension as unknown as DimensionId,
      score: d.score,
      raw: d.raw,
      contributions: d.answers,
      consistency: null,
      lean: d.lean,
      distinctiveness: d.distinctiveness,
    })),
  }
}

/** Human labels for a scenario dimension, for surfaces that need them. */
export function scenarioPole(dimension: ScenarioDimension, lean: 'high' | 'low' | null) {
  const poles = SCENARIO_POLES[dimension]
  if (lean === null) return { label: poles.label, pole: 'Balanced', blurb: '' }
  const side = lean === 'high' ? poles.high : poles.low
  return { label: poles.label, pole: side.pole, blurb: side.blurb }
}
