import { describe, expect, it } from 'vitest'
import { estimateCostMicros, hasKnownPrice } from './provider-cost'

/**
 * Cost estimation.
 *
 * These exist because the numbers decide whether the free tier is affordable,
 * and a silently-zero estimate would answer that question wrongly and
 * confidently. Everything here is about the failure modes, not the arithmetic.
 */

describe('estimateCostMicros', () => {
  it('prices a typical research run in the right order of magnitude', () => {
    // The real production run: ~22.8k in, ~6.2k out on gpt-4.1-mini, one Exa
    // request. If this is ever dollars rather than fractions of a cent, the
    // unit economics of the whole plan are wrong.
    const micros = estimateCostMicros({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 22_823,
      outputTokens: 6_215,
      searchRequests: 1,
      searchProvider: 'exa',
    })

    const usd = micros / 1_000_000
    expect(usd).toBeGreaterThan(0.005)
    expect(usd).toBeLessThan(0.05)
  })

  it('charges search per request, not per result', () => {
    const one = estimateCostMicros({ searchRequests: 1, searchProvider: 'exa' })
    const three = estimateCostMicros({ searchRequests: 3, searchProvider: 'exa' })
    expect(three).toBe(one * 3)
  })

  it('costs nothing when the deterministic composer ran', () => {
    // The grounded path makes no provider call. Billing it would make the
    // fallback look expensive and push exactly the wrong optimisation.
    expect(
      estimateCostMicros({
        provider: 'grounded',
        model: 'evidence-composer',
        inputTokens: 5_000,
        outputTokens: 2_000,
      }),
    ).toBe(0)
  })

  it('returns zero rather than throwing on a model it has never seen', () => {
    // A missing price should understate the bill visibly, not lose the usage
    // row it arrived with. hasKnownPrice is what makes the gap findable.
    expect(estimateCostMicros({ model: 'some-model-shipped-next-year', inputTokens: 10_000 })).toBe(
      0,
    )
    expect(hasKnownPrice('some-model-shipped-next-year')).toBe(false)
    expect(hasKnownPrice('gpt-4.1-mini')).toBe(true)
    expect(hasKnownPrice('evidence-composer')).toBe(true)
    expect(hasKnownPrice(null)).toBe(false)
  })

  it('prices output above input, which is what the vendors charge', () => {
    const inputHeavy = estimateCostMicros({ model: 'gpt-4.1-mini', inputTokens: 10_000 })
    const outputHeavy = estimateCostMicros({ model: 'gpt-4.1-mini', outputTokens: 10_000 })
    expect(outputHeavy).toBeGreaterThan(inputHeavy)
  })

  it('returns whole micros, never a fraction', () => {
    // Summing thousands of sub-cent floats is where precision goes missing.
    const micros = estimateCostMicros({ model: 'gpt-4.1-mini', inputTokens: 7, outputTokens: 3 })
    expect(Number.isInteger(micros)).toBe(true)
  })

  it('handles a run with nothing recorded', () => {
    expect(estimateCostMicros({})).toBe(0)
  })
})
