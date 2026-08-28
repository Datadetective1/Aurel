import { describe, expect, it } from 'vitest'
import { scoreScenarios } from './scenario-scoring'
import {
  ALL_SCENARIOS,
  CORE_SCENARIOS,
  CORE_COUNT,
  SCENARIO_DIMENSIONS,
  TOTAL_COUNT,
} from './scenarios'

/**
 * Scenario scoring.
 *
 * The tests that matter most are the ones about not knowing. This instrument
 * replaced one that produced confident-looking data from people clicking to
 * finish, so the failure mode to guard is a profile that looks more certain
 * than the answers behind it.
 */

/** Pick the option at `index` for a scenario, by id. */
function answer(scenarioId: string, index: number) {
  const scenario = ALL_SCENARIOS.find((s) => s.id === scenarioId)!
  return { scenarioId, optionId: scenario.options[index]!.id }
}

const dependsIndex = 2

describe('the instrument itself', () => {
  it('opens with one scenario per dimension', () => {
    // Six questions that reach every dimension, rather than three dimensions
    // in depth and three not at all.
    expect(CORE_COUNT).toBe(SCENARIO_DIMENSIONS.length)
    expect(new Set(CORE_SCENARIOS.map((s) => s.dimension)).size).toBe(SCENARIO_DIMENSIONS.length)
  })

  it('gives every scenario exactly two directions and one way out', () => {
    for (const scenario of ALL_SCENARIOS) {
      const directions = scenario.options.map((o) => o.direction).sort()
      expect(directions, `${scenario.id} should be -1 / 0 / +1`).toEqual([-1, 0, 1])
    }
  })

  it('offers "it depends" on every single question', () => {
    // Requirement, not a nicety: for a lot of people it is the true answer,
    // and forcing a lean is how the old instrument collected noise.
    for (const scenario of ALL_SCENARIOS) {
      expect(scenario.options.some((o) => o.direction === 0)).toBe(true)
    }
  })

  it('asks about a situation rather than a self-diagnosis', () => {
    // The old items opened "I ...", asking people to rate their own
    // disposition. These describe a moment and ask what you would do.
    for (const scenario of ALL_SCENARIOS) {
      expect(scenario.prompt.startsWith('I ')).toBe(false)
      expect(scenario.prompt.length).toBeGreaterThan(20)
    }
  })

  it('has unique ids throughout', () => {
    const ids = ALL_SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const optionIds = ALL_SCENARIOS.flatMap((s) => s.options.map((o) => o.id))
    expect(new Set(optionIds).size).toBe(optionIds.length)
  })

  it('covers each dimension the same number of times', () => {
    // An unbalanced instrument scores some dimensions more confidently than
    // others for no reason the user would recognise.
    const counts = SCENARIO_DIMENSIONS.map(
      (d) => ALL_SCENARIOS.filter((s) => s.dimension === d).length,
    )
    expect(new Set(counts).size).toBe(1)
  })
})

describe('"it depends" is not a data point', () => {
  it('produces no lean at all', () => {
    const all = CORE_SCENARIOS.map((s) => answer(s.id, dependsIndex))
    const scored = scoreScenarios(all)

    expect(scored.answered).toBe(CORE_COUNT)
    expect(scored.directional).toBe(0)
    for (const dimension of scored.dimensions) {
      expect(dimension.score).toBe(50)
      expect(dimension.lean).toBeNull()
      expect(dimension.answers).toBe(0)
    }
  })

  it('cannot buy confidence by answering everything with it', () => {
    // The failure this whole redesign exists to prevent: clicking through and
    // ending up with a profile that looks finished.
    const scored = scoreScenarios(ALL_SCENARIOS.map((s) => answer(s.id, dependsIndex)))
    expect(scored.confidence).toBe('provisional')
    expect(scored.coverage).toBe(0)
    expect(scored.archetype).toBe('Adaptive Generalist')
  })

  it('is distinguishable from never having been asked', () => {
    const declined = scoreScenarios([answer('dir-core', dependsIndex)])
    const unasked = scoreScenarios([])

    // Same absence of signal ...
    expect(declined.dimensions[0]!.score).toBe(unasked.dimensions[0]!.score)
    expect(declined.dimensions[0]!.lean).toBeNull()
    // ... but the record knows the difference.
    expect(declined.answered).toBe(1)
    expect(unasked.answered).toBe(0)
    expect(declined.dimensions.find((d) => d.dimension === 'directness')!.depends).toBe(1)
  })
})

describe('partial profiles', () => {
  it('scores the opening six without touching the rest', () => {
    const scored = scoreScenarios(CORE_SCENARIOS.map((s) => answer(s.id, 0)))
    expect(scored.answered).toBe(CORE_COUNT)
    expect(scored.directional).toBe(CORE_COUNT)
    // One answer per dimension: a third of the way out, not a full lean.
    for (const dimension of scored.dimensions) {
      expect(dimension.answers).toBe(1)
      expect(dimension.score).toBe(67)
    }
  })

  it('stays provisional on the opening six', () => {
    const scored = scoreScenarios(CORE_SCENARIOS.map((s) => answer(s.id, 0)))
    expect(scored.confidence).toBe('provisional')
  })

  it('reaches a stronger reading only when the instrument is worked through', () => {
    const scored = scoreScenarios(ALL_SCENARIOS.map((s) => answer(s.id, 0)))
    expect(scored.directional).toBe(TOTAL_COUNT)
    expect(scored.coverage).toBe(1)
    expect(scored.confidence).toBe('strong')
  })

  it('never leaves a score outside 0-100', () => {
    for (const index of [0, 1, dependsIndex]) {
      const scored = scoreScenarios(ALL_SCENARIOS.map((s) => answer(s.id, index)))
      for (const value of Object.values(scored.scores)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })

  it('moves toward the opposite pole when answers do', () => {
    const high = scoreScenarios(ALL_SCENARIOS.map((s) => answer(s.id, 0)))
    const low = scoreScenarios(ALL_SCENARIOS.map((s) => answer(s.id, 1)))
    expect(high.scores.directness).toBeGreaterThan(50)
    expect(low.scores.directness).toBeLessThan(50)
  })

  it('ignores a response naming a scenario or option that does not exist', () => {
    const scored = scoreScenarios([
      { scenarioId: 'not-a-scenario', optionId: 'x' },
      { scenarioId: 'dir-core', optionId: 'not-an-option' },
    ])
    expect(scored.answered).toBe(0)
    expect(scored.directional).toBe(0)
  })
})

describe('mixed certainty', () => {
  it('lets a confident dimension coexist with an undecided one', () => {
    const scored = scoreScenarios([
      answer('dir-core', 0),
      answer('dir-2', 0),
      answer('dir-3', 0),
      answer('pac-core', dependsIndex),
      answer('pac-2', dependsIndex),
      answer('pac-3', dependsIndex),
    ])

    const directness = scored.dimensions.find((d) => d.dimension === 'directness')!
    const pace = scored.dimensions.find((d) => d.dimension === 'pace')!

    expect(directness.lean).toBe('high')
    expect(directness.score).toBe(100)
    expect(pace.lean).toBeNull()
    expect(pace.score).toBe(50)
    expect(pace.depends).toBe(3)
  })

  it('cancels honestly when someone answers both ways', () => {
    // Not "balanced by conviction" -- just no net signal, and the score says so
    // without pretending it is a finding.
    const scored = scoreScenarios([answer('dir-core', 0), answer('dir-2', 1)])
    const directness = scored.dimensions.find((d) => d.dimension === 'directness')!
    expect(directness.raw).toBe(0)
    expect(directness.score).toBe(50)
    expect(directness.lean).toBeNull()
    expect(directness.answers).toBe(2)
  })
})
