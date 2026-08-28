import {
  SCENARIO_BY_ID,
  SCENARIO_DIMENSIONS,
  SCENARIO_POLES,
  SCENARIO_VERSION,
  TOTAL_COUNT,
  type ScenarioDimension,
} from './scenarios'

/**
 * SCENARIO SCORING (v2)
 * =============================================================================
 * Deterministic, and deliberately unwilling to guess.
 *
 * Each answered scenario contributes +1 or -1 to exactly one dimension.
 * "It depends" contributes NOTHING — it is recorded as seen, and it moves no
 * score. That distinction is the whole point: a dimension the user declined to
 * lean on must come out indistinguishable from one they were never asked
 * about, because in both cases we do not know.
 *
 * The alternative — treating "depends" as a midpoint vote — would let a user
 * who answered "it depends" six times acquire a confident-looking balanced
 * profile, which is the same false precision this redesign exists to remove.
 * =============================================================================
 */

export const SCENARIO_SCORING_VERSION = SCENARIO_VERSION

/** Answers per dimension in the full instrument. Drives normalisation. */
const MAX_PER_DIMENSION = 3

/** Within this distance of the midpoint we report no lean at all. */
const NEUTRAL_BAND = 8

/** A dimension needs this many real answers before it counts as covered. */
const MIN_ANSWERS_FOR_COVERAGE = 2

export interface ScenarioResponse {
  scenarioId: string
  optionId: string
}

export interface ScenarioDimensionScore {
  dimension: ScenarioDimension
  /** 0-100, 50 being no information. */
  score: number
  /** Signed sum before normalisation. */
  raw: number
  /** Answers that actually carried a direction. "Depends" is not one. */
  answers: number
  /** Times the user explicitly declined to lean. */
  depends: number
  lean: 'high' | 'low' | null
  distinctiveness: number
}

export interface ScenarioProfile {
  version: string
  scores: Record<ScenarioDimension, number>
  dimensions: ScenarioDimensionScore[]
  /** Scenarios responded to, including "it depends". */
  answered: number
  /** Of those, how many carried a direction. */
  directional: number
  /** Fraction of dimensions with enough real answers to report. */
  coverage: number
  confidence: 'provisional' | 'moderate' | 'strong'
  ranked: ScenarioDimensionScore[]
  archetype: string
}

export function scoreScenarios(responses: readonly ScenarioResponse[]): ScenarioProfile {
  const raw = Object.fromEntries(SCENARIO_DIMENSIONS.map((d) => [d, 0])) as Record<
    ScenarioDimension,
    number
  >
  const answers = Object.fromEntries(SCENARIO_DIMENSIONS.map((d) => [d, 0])) as Record<
    ScenarioDimension,
    number
  >
  const dependsCount = Object.fromEntries(SCENARIO_DIMENSIONS.map((d) => [d, 0])) as Record<
    ScenarioDimension,
    number
  >

  let answered = 0
  let directional = 0

  for (const response of responses) {
    const scenario = SCENARIO_BY_ID[response.scenarioId]
    if (!scenario) continue
    const option = scenario.options.find((o) => o.id === response.optionId)
    if (!option) continue

    answered += 1

    if (option.direction === 0) {
      dependsCount[scenario.dimension] += 1
      continue
    }

    raw[scenario.dimension] += option.direction
    answers[scenario.dimension] += 1
    directional += 1
  }

  const dimensions: ScenarioDimensionScore[] = SCENARIO_DIMENSIONS.map((dimension) => {
    const total = raw[dimension]
    // Normalised against the whole instrument, not against what happened to be
    // asked. One answer out of three possible is a third of the distance from
    // the midpoint, which is exactly how confident one answer deserves to be.
    const score = clamp(Math.round(50 + (total / MAX_PER_DIMENSION) * 50))
    const delta = score - 50
    const lean = answers[dimension] === 0 || Math.abs(delta) < NEUTRAL_BAND
      ? null
      : delta > 0
        ? ('high' as const)
        : ('low' as const)

    return {
      dimension,
      score,
      raw: total,
      answers: answers[dimension],
      depends: dependsCount[dimension],
      lean,
      distinctiveness: Math.abs(delta) / 50,
    }
  })

  const covered = dimensions.filter((d) => d.answers >= MIN_ANSWERS_FOR_COVERAGE).length
  const coverage = round3(covered / SCENARIO_DIMENSIONS.length)

  const ranked = [...dimensions].sort((a, b) => b.distinctiveness - a.distinctiveness)

  return {
    version: SCENARIO_VERSION,
    scores: Object.fromEntries(dimensions.map((d) => [d.dimension, d.score])) as Record<
      ScenarioDimension,
      number
    >,
    dimensions,
    answered,
    directional,
    coverage,
    confidence: confidenceFrom(coverage, directional),
    ranked,
    archetype: archetypeFrom(ranked),
  }
}

/**
 * Confidence describes how much the user told us, never how sure a model is.
 *
 * A run of "it depends" answers raises `answered` and leaves `directional` at
 * zero, so it cannot buy confidence. That is intentional.
 */
function confidenceFrom(coverage: number, directional: number): ScenarioProfile['confidence'] {
  if (directional < TOTAL_COUNT / 2 || coverage < 0.75) return 'provisional'
  if (coverage === 1 && directional >= TOTAL_COUNT - 2) return 'strong'
  return 'moderate'
}

/** Two most distinctive poles, or an honest shrug. */
function archetypeFrom(ranked: readonly ScenarioDimensionScore[]): string {
  const leaning = ranked.filter((d) => d.lean !== null)
  if (leaning.length === 0) return 'Adaptive Generalist'

  const [first, second] = leaning
  const primary = SCENARIO_POLES[first!.dimension][first!.lean === 'high' ? 'high' : 'low'].pole
  if (!second) return primary
  const secondary = SCENARIO_POLES[second.dimension][second.lean === 'high' ? 'high' : 'low'].pole
  return `${primary} ${secondary}`
}

export function describeScenarioDimension(score: ScenarioDimensionScore) {
  const poles = SCENARIO_POLES[score.dimension]
  const side = score.lean === 'low' ? poles.low : poles.high
  return {
    label: poles.label,
    pole: score.lean === null ? 'Balanced' : side.pole,
    blurb: score.lean === null ? 'No clear lean from what has been answered so far.' : side.blurb,
  }
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}
