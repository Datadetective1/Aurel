import {
  BLOCK_BY_ID,
  DIMENSIONS,
  DIMENSION_BY_ID,
  INSTRUMENT_VERSION,
  ITEM_BY_ID,
  type DimensionId,
} from './instrument'

/**
 * SCORING — deterministic, normalised, versioned.
 * =============================================================================
 * Every choice contributes a signed weight to exactly one dimension:
 *   MOST  like me  ->  +2 in the item's keyed direction
 *   LEAST like me  ->  -2 in the item's keyed direction
 *
 * A respondent makes 24 "most" and 24 "least" choices, so 48 keyed contributions
 * are distributed across 8 dimensions — roughly 6 per dimension. NORMALISATION_MAX
 * is therefore 12 (6 contributions x weight 2), the largest total a dimension
 * realistically reaches. Scores are clamped, so the rare respondent who loads
 * every choice onto one dimension lands at 0 or 100 rather than off-scale.
 *
 * WHAT WE DELIBERATELY DO NOT DO
 * No decimals in reported scores, no percentile claims, no norm group. This is a
 * self-report personalisation instrument with no validation study behind it, and
 * presenting it with more precision than that would be dishonest.
 * =============================================================================
 */

export const SCORING_VERSION = INSTRUMENT_VERSION

/** Weight applied to a MOST/LEAST selection. */
const CHOICE_WEIGHT = 2

/**
 * Largest per-dimension total treated as full-scale. Derived, not tuned:
 * 48 keyed contributions / 8 dimensions = 6 expected, x CHOICE_WEIGHT.
 */
export const NORMALISATION_MAX = 12

/** A dimension needs this many keyed contributions before we call it covered. */
const MIN_CONTRIBUTIONS_FOR_COVERAGE = 2

export interface Response {
  blockId: string
  mostItemId: string
  leastItemId: string
}

export interface DimensionScore {
  dimension: DimensionId
  /** 0-100. 50 is the midpoint; above 50 leans to the high pole. */
  score: number
  /** Signed pre-normalisation total, retained for debugging and tests. */
  raw: number
  /** How many keyed contributions this dimension received. */
  contributions: number
  /** 0-1 directional agreement across this dimension's contributions. */
  consistency: number | null
  /** Which pole the score leans to, or null within the neutral band. */
  lean: 'high' | 'low' | null
  /** How far from the midpoint, 0-1. Drives emphasis in the reveal. */
  distinctiveness: number
}

export interface ScoredProfile {
  version: string
  scores: Record<DimensionId, number>
  dimensions: DimensionScore[]
  /** Fraction of dimensions with enough signal to report, 0-1. */
  coverage: number
  /** Mean directional agreement across covered dimensions, 0-1. */
  consistency: number
  /** Plain-language confidence, derived only from coverage and consistency. */
  confidence: 'provisional' | 'moderate' | 'strong'
  /** Dimensions ordered most- to least-distinctive. */
  ranked: DimensionScore[]
  archetype: string
  /** How many of the 24 blocks were answered. */
  answered: number
}

/**
 * Scores within this distance of the midpoint are reported as balanced rather
 * than assigned a pole. Prevents a one-choice difference reading as a trait.
 */
const NEUTRAL_BAND = 8

/** Archetype names for each pole. Neutral in tone: no pole is the good one. */
const POLE_NAMES: Record<DimensionId, { high: string; low: string }> = {
  directness: { high: 'Plainspoken', low: 'Diplomat' },
  social_energy: { high: 'Convener', low: 'Considerer' },
  pace: { high: 'Mover', low: 'Deliberator' },
  detail: { high: 'Verifier', low: 'Synthesist' },
  decision_style: { high: 'Analyst', low: 'Reader' },
  change_comfort: { high: 'Explorer', low: 'Steward' },
  conflict: { high: 'Challenger', low: 'Harmoniser' },
  structure: { high: 'Architect', low: 'Improviser' },
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

/**
 * Score a set of responses.
 *
 * Unknown block or item ids are ignored rather than throwing: a stored response
 * referencing an item retired in a later instrument version should degrade to a
 * lower coverage score, not break the user's profile page.
 */
export function scoreResponses(responses: readonly Response[]): ScoredProfile {
  const raw: Record<DimensionId, number> = Object.fromEntries(
    DIMENSIONS.map((d) => [d.id, 0]),
  ) as Record<DimensionId, number>

  // Absolute magnitude per dimension, for the consistency ratio.
  const magnitude: Record<DimensionId, number> = Object.fromEntries(
    DIMENSIONS.map((d) => [d.id, 0]),
  ) as Record<DimensionId, number>

  const contributions: Record<DimensionId, number> = Object.fromEntries(
    DIMENSIONS.map((d) => [d.id, 0]),
  ) as Record<DimensionId, number>

  let answered = 0
  const seenBlocks = new Set<string>()

  for (const response of responses) {
    const block = BLOCK_BY_ID[response.blockId]
    if (!block) continue
    // Ignore duplicate submissions for the same block; first answer wins.
    if (seenBlocks.has(response.blockId)) continue

    const most = ITEM_BY_ID[response.mostItemId]
    const least = ITEM_BY_ID[response.leastItemId]
    if (!most || !least || most.id === least.id) continue

    // Both items must genuinely belong to the block they were answered against,
    // otherwise a crafted request could load an arbitrary dimension.
    const blockItemIds = new Set(block.items.map((i) => i.id))
    if (!blockItemIds.has(most.id) || !blockItemIds.has(least.id)) continue

    seenBlocks.add(response.blockId)
    answered++

    const mostDelta = CHOICE_WEIGHT * most.direction
    raw[most.dimension] += mostDelta
    magnitude[most.dimension] += Math.abs(mostDelta)
    contributions[most.dimension] += 1

    const leastDelta = -CHOICE_WEIGHT * least.direction
    raw[least.dimension] += leastDelta
    magnitude[least.dimension] += Math.abs(leastDelta)
    contributions[least.dimension] += 1
  }

  const dimensions: DimensionScore[] = DIMENSIONS.map((d) => {
    const r = raw[d.id]
    const n = contributions[d.id]
    const m = magnitude[d.id]

    const score = clamp(Math.round(50 + (r / NORMALISATION_MAX) * 50), 0, 100)
    const delta = score - 50

    // Directional agreement: 1 when every contribution pointed the same way,
    // 0 when they cancelled out exactly.
    const consistency = m > 0 ? Math.abs(r) / m : null

    return {
      dimension: d.id,
      score,
      raw: r,
      contributions: n,
      consistency,
      lean: Math.abs(delta) < NEUTRAL_BAND ? null : delta > 0 ? 'high' : 'low',
      distinctiveness: clamp(Math.abs(delta) / 50, 0, 1),
    }
  })

  const covered = dimensions.filter((d) => d.contributions >= MIN_CONTRIBUTIONS_FOR_COVERAGE)
  const coverage = covered.length / DIMENSIONS.length

  const consistencyValues = covered
    .map((d) => d.consistency)
    .filter((c): c is number => c !== null)
  const consistency =
    consistencyValues.length > 0
      ? consistencyValues.reduce((a, b) => a + b, 0) / consistencyValues.length
      : 0

  const ranked = [...dimensions].sort((a, b) => b.distinctiveness - a.distinctiveness)

  return {
    version: SCORING_VERSION,
    scores: Object.fromEntries(dimensions.map((d) => [d.dimension, d.score])) as Record<
      DimensionId,
      number
    >,
    dimensions,
    coverage: round3(coverage),
    consistency: round3(consistency),
    confidence: confidenceFrom(coverage, consistency, answered),
    ranked,
    archetype: archetypeFrom(ranked),
    answered,
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

/**
 * Confidence is a statement about how much the respondent told us and how
 * consistently — never about how sure a model is. A short or self-contradictory
 * run stays "provisional" no matter how extreme the scores look.
 */
function confidenceFrom(coverage: number, consistency: number, answered: number): ScoredProfile['confidence'] {
  if (answered < 12 || coverage < 0.75) return 'provisional'
  if (coverage === 1 && consistency >= 0.6 && answered >= 20) return 'strong'
  if (coverage >= 0.875 && consistency >= 0.4) return 'moderate'
  return 'provisional'
}

/**
 * Archetype from the two most distinctive dimensions, e.g. "Plainspoken
 * Architect". When nothing is distinctive we say so plainly rather than
 * inventing a label.
 */
function archetypeFrom(ranked: readonly DimensionScore[]): string {
  const distinctive = ranked.filter((d) => d.lean !== null)
  if (distinctive.length === 0) return 'Adaptive Generalist'

  const [primary, secondary] = distinctive
  const first = POLE_NAMES[primary!.dimension][primary!.lean === 'high' ? 'high' : 'low']

  if (!secondary) return first

  const second = POLE_NAMES[secondary.dimension][secondary.lean === 'high' ? 'high' : 'low']
  // Adjective-then-noun reads better than two nouns: "Plainspoken Architect".
  return `${first} ${second}`
}

/** Human-readable summary of a single dimension, used in the reveal and briefs. */
export function describeDimension(d: DimensionScore): { pole: string; blurb: string; label: string } {
  const dim = DIMENSION_BY_ID[d.dimension]
  if (d.lean === null) {
    return {
      label: dim.label,
      pole: 'Balanced',
      blurb: `You move between ${dim.lowPole.name.toLowerCase()} and ${dim.highPole.name.toLowerCase()} depending on the situation.`,
    }
  }
  const pole = d.lean === 'high' ? dim.highPole : dim.lowPole
  return { label: dim.label, pole: pole.name, blurb: pole.blurb }
}
