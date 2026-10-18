import { describe, expect, it, vi } from 'vitest'
import { firstRead } from './first-read'
import { scoreScenarios } from './scenario-scoring'
import { CORE_SCENARIOS } from './scenarios'

/**
 * The reveal after the opening six questions.
 *
 * Reported: a new user finished the six scenarios, got "The Diplomatic
 * Decisive", and then read "Your scores are saved, but the written summary did
 * not generate." The scenario path never generated one at all. The first read
 * is now composed from the scores, so it cannot be missing -- and it must not
 * claim more than six answers can carry.
 */

/** The walkthrough's shape: diplomatic and decisive, the rest mixed. */
function sixAnswers(picks: number[]) {
  return CORE_SCENARIOS.map((scenario, i) => ({
    scenarioId: scenario.id,
    optionId: scenario.options[picks[i]!]!.id,
  }))
}

describe('firstRead', () => {
  it('names the tendencies the answers actually lean towards', () => {
    // dir: b (diplomatic), pac: a (decisive), others: a mix
    const profile = scoreScenarios(sixAnswers([1, 0, 0, 1, 0, 1]))
    const read = firstRead(profile, 'Atturel')

    expect(read.tendencies.length).toBeGreaterThan(0)
    expect(read.tendencies.length).toBeLessThanOrEqual(4)
    expect(read.tendencies.map((t) => t.pole)).toEqual(
      expect.arrayContaining(['Diplomatic', 'Decisive']),
    )
  })

  it('says how many answers it rests on, and that it is early', () => {
    const read = firstRead(scoreScenarios(sixAnswers([1, 0, 0, 1, 0, 1])), 'Atturel')
    expect(read.explanation).toContain('6 answers')
    expect(read.explanation).toMatch(/early read/i)
    expect(read.explanation).toMatch(/not a measurement/i)
  })

  it('never reports high certainty from one answer per tendency', () => {
    const read = firstRead(scoreScenarios(sixAnswers([0, 0, 0, 0, 0, 0])), 'Atturel')
    expect(read.tendencies.every((t) => t.certainty === 'low')).toBe(true)
  })

  it('does not invent a default when every answer was "it depends"', () => {
    const read = firstRead(scoreScenarios(sixAnswers([2, 2, 2, 2, 2, 2])), 'Atturel')
    expect(read.tendencies).toEqual([])
    expect(read.varies.length).toBe(6)
    expect(read.explanation).toMatch(/did not lean clearly/i)
  })

  it('reports a dimension the user said varies as varying, not as a tendency', () => {
    const read = firstRead(scoreScenarios(sixAnswers([2, 0, 0, 0, 0, 0])), 'Atturel')
    expect(read.varies).toContain('Directness')
    expect(read.tendencies.map((t) => t.label)).not.toContain('Directness')
    expect(read.explanation).toMatch(/directness depends on the situation/i)
  })
})

describe('writeProfileNarrative: a failing generator cannot break the profile', () => {
  it('returns null and writes nothing when generation throws', async () => {
    vi.doMock('@/lib/ai/context', () => ({ getUserContext: async () => ({}) }))
    const { writeProfileNarrative } = await import('./narrative')

    const update = vi.fn()
    const supabase = {
      from: () => ({
        update: (row: unknown) => (
          update(row),
          { eq: () => ({ eq: async () => ({ error: null }) }) }
        ),
      }),
    }
    const failing = vi.fn(async () => {
      throw new Error('provider down')
    })

    const result = await writeProfileNarrative(
      supabase as never,
      'user-1',
      'assessment-1',
      scoreScenarios(sixAnswers([1, 0, 0, 1, 0, 1])),
      failing as never,
    )

    expect(failing).toHaveBeenCalledOnce()
    expect(result).toBeNull()
    // Scores and answers live in other columns and other tables; nothing at all
    // is written when the narrative cannot be produced.
    expect(update).not.toHaveBeenCalled()
  })

  it('writes only the narrative column, using the deterministic composer when no model is configured', async () => {
    vi.doMock('@/lib/ai/context', () => ({
      getUserContext: async () => ({ coachingStyle: 'balanced' }),
    }))
    const { writeProfileNarrative } = await import('./narrative')

    const written: Record<string, unknown>[] = []
    const supabase = {
      from: () => ({
        update: (row: Record<string, unknown>) => (
          written.push(row),
          { eq: () => ({ eq: async () => ({ error: null }) }) }
        ),
      }),
    }

    // The real runPrompt: this suite configures no provider, which is the
    // same path a model outage takes.
    const narrative = await writeProfileNarrative(
      supabase as never,
      'user-1',
      'assessment-1',
      scoreScenarios(sixAnswers([1, 0, 0, 1, 0, 1])),
    )

    expect(narrative?.summary).toBeTruthy()
    expect(written).toHaveLength(1)
    expect(Object.keys(written[0]!)).toEqual(['narrative'])
  })
})
