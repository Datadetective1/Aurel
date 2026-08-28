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
 * Each directional answer contributes +1 or -1 to exactly one dimension.
 *
 * SKIP AND "IT DEPENDS" ARE NOT THE SAME THING, and this is the distinction the
 * scoring turns on.
 *
 *   SKIP writes no row at all. The user declined to answer, so there is no
 *   evidence of any kind, and the dimension is indistinguishable from one never
 *   put in front of them.
 *
 *   "IT DEPENDS" is an answer. The user read a real situation and said their
 *   behaviour varies with context. That is behavioural information — it is the
 *   difference between "we do not know" and "they told us it changes" — and
 *   throwing it away would discard the most honest answer many people can give.
 *
 * So "it depends" moves no score, because there is no pole to move toward, but
 * it does mark the dimension CONTEXT-DEPENDENT. A brief can then say "your
 * approach here varies with the situation" instead of silently omitting the
 * dimension, and confidence for that dimension is capped rather than inflated.
 *
 * What it must never do is buy confidence. Answering "it depends" to everything
 * yields coverage 0 and a provisional profile, because saying "it varies" six
 * times is not the same as having been measured six times.
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
  /** Times the user explicitly said their behaviour varies here. */
  depends: number
  /**
   * The user told us this one changes with the situation.
   *
   * True only when they said so AND no clear lean emerged anyway — somebody
   * who answered "it depends" once and then leaned twice has a lean, and
   * reporting them as context-dependent would ignore what they actually said.
   */
  contextDependent: boolean
  lean: 'high' | 'low' | null
  distinctiveness: number
  /** What may honestly be claimed about this dimension. */
  certainty: 'none' | 'context_dependent' | 'low' | 'medium' | 'high'
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
    const directional = answers[dimension]
    const declined = dependsCount[dimension]

    const lean = directional === 0 || Math.abs(delta) < NEUTRAL_BAND
      ? null
      : delta > 0
        ? ('high' as const)
        : ('low' as const)

    // They said it varies, and nothing they said since contradicts that.
    const contextDependent = declined > 0 && lean === null

    const certainty: ScenarioDimensionScore['certainty'] = contextDependent
      ? 'context_dependent'
      : directional === 0
        ? 'none'
        : lean === null
          ? 'low'
          : directional >= MAX_PER_DIMENSION
            ? 'high'
            : directional >= MIN_ANSWERS_FOR_COVERAGE
              ? 'medium'
              : 'low'

    return {
      dimension,
      score,
      raw: total,
      answers: directional,
      depends: declined,
      contextDependent,
      lean,
      distinctiveness: Math.abs(delta) / 50,
      certainty,
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

  // Three distinct states, and collapsing them is what made "it depends"
  // feel like a wasted answer:
  //
  //   a lean          -> we know which way
  //   context-dependent -> they TOLD us it varies
  //   nothing          -> we have not asked, or they skipped
  if (score.contextDependent) {
    return {
      label: poles.label,
      pole: 'Context-dependent',
      blurb: 'Your approach here varies with the situation, so treat guidance on it as a starting point rather than a rule.',
    }
  }

  if (score.lean === null) {
    return {
      label: poles.label,
      pole: 'Not yet known',
      blurb: 'Not enough answered here yet for a read.',
    }
  }

  return { label: poles.label, pole: side.pole, blurb: side.blurb }
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}
