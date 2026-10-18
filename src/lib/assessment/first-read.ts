import { SCENARIO_DIMENSIONS, SCENARIO_POLES } from './scenarios'
import { describeScenarioDimension, type ScenarioProfile } from './scenario-scoring'

/**
 * THE FIRST READ
 * =============================================================================
 * What a new user sees after the opening questions: a few tendencies and a
 * plain sentence about how much weight to put on them.
 *
 * Composed entirely from the stored scores, with no model in the path. The
 * reveal used to depend on a written summary from the model, and when that
 * summary was missing -- which, for the scenario instrument, was every time --
 * the first thing a new user read was "the written summary did not generate".
 * A dead end built on a dependency the scores never needed.
 *
 * It claims no more than the answers support:
 *   - only dimensions with a real lean appear as tendencies
 *   - a dimension the user said varies is reported as varying, not guessed
 *   - the explanation states how many answers it rests on
 * =============================================================================
 */

export interface Tendency {
  dimension: string
  label: string
  pole: string
  blurb: string
  /** How much the answers support it, from the scorer. */
  certainty: 'low' | 'medium' | 'high'
}

export interface FirstRead {
  tendencies: Tendency[]
  /** Dimension labels the user said depend on the situation. */
  varies: string[]
  explanation: string
}

/** Up to four. More than that on six answers would be reading tea leaves. */
const MAX_TENDENCIES = 4

/**
 * Reads only `ranked` and `answered`: `ranked` carries every dimension's full
 * scenario score, whereas callers that adapt `dimensions` to the legacy
 * fingerprint shape drop fields this needs.
 */
export function firstRead(
  profile: Pick<ScenarioProfile, 'ranked' | 'answered'>,
  brandName: string,
): FirstRead {
  const tendencies: Tendency[] = profile.ranked
    .filter((d) => d.lean !== null && !d.contextDependent)
    .slice(0, MAX_TENDENCIES)
    .map((d) => {
      const described = describeScenarioDimension(d)
      return {
        dimension: d.dimension,
        label: described.label,
        pole: described.pole,
        blurb: described.blurb,
        certainty:
          d.certainty === 'high' ? 'high' : d.certainty === 'medium' ? 'medium' : ('low' as const),
      }
    })

  const varies = profile.ranked
    .filter((d) => d.contextDependent)
    .sort(
      (a, b) => SCENARIO_DIMENSIONS.indexOf(a.dimension) - SCENARIO_DIMENSIONS.indexOf(b.dimension),
    )
    .map((d) => SCENARIO_POLES[d.dimension].label)

  const answers = `${profile.answered} ${profile.answered === 1 ? 'answer' : 'answers'}`

  const base =
    tendencies.length === 0
      ? `Your ${answers} did not lean clearly either way, so ${brandName} will not assume a default for you. It treats each situation on its own terms and sharpens this as you use it.`
      : `An early read from ${answers}: how you described yourself, not a measurement. ${brandName} uses it to shape suggestions, says when it is unsure, and sharpens it as you go.`

  const variesNote =
    varies.length > 0
      ? ` You said your approach to ${joinList(varies.map((v) => v.toLowerCase()))} depends on the situation, so guidance there stays open.`
      : ''

  return { tendencies, varies, explanation: base + variesNote }
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
