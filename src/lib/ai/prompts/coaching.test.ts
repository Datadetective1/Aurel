import { describe, expect, it } from 'vitest'
import { profileNarrativePrompt } from './coaching'
import { DIMENSIONS } from '@/lib/assessment/instrument'
import { describeDimension, scoreResponses } from '@/lib/assessment/scoring'
import { BLOCKS } from '@/lib/assessment/instrument'

/**
 * Guards the profile reveal.
 *
 * The reveal previously fell back to one generic sentence for every dimension,
 * because the copy table was keyed on pole NAME while the instrument has two
 * pole vocabularies (archetype nouns vs display adjectives). Nothing failed —
 * the page just rendered the same line three times. These tests make that
 * class of silent miss impossible.
 */

const GENERIC = [
  'This tendency gives you a consistent, predictable default.',
  'Under pressure the same tendency can become less flexible.',
  'People generally know what to expect from you here.',
  'The situation matches your natural approach.',
]

function narrativeFor(dimensionId: string, lean: 'high' | 'low') {
  const dimension = DIMENSIONS.find((d) => d.id === dimensionId)!
  const pole = lean === 'high' ? dimension.highPole : dimension.lowPole
  return profileNarrativePrompt.compose({
    user: {
      id: 'u',
      displayName: 'Test',
      jobTitle: null,
      company: null,
      coachingStyle: 'balanced',
  timeZone: 'America/Chicago',
      interactionProfile: null,
    },
    archetype: 'Test Archetype',
    confidence: 'moderate',
    dimensions: [
      {
        id: dimensionId,
        label: dimension.label,
        pole: pole.name,
        blurb: pole.blurb,
        score: lean === 'high' ? 90 : 10,
        lean,
      },
    ],
  })
}

describe('profile narrative copy', () => {
  it('has specific copy for every dimension and both poles', () => {
    const missing: string[] = []

    for (const dimension of DIMENSIONS) {
      for (const lean of ['high', 'low'] as const) {
        const narrative = narrativeFor(dimension.id, lean)
        const lines = [
          ...narrative.atYourBest,
          ...narrative.underPressure,
          ...narrative.howOthersExperienceYou,
          ...narrative.youWorkBestWhen,
        ]
        for (const line of lines) {
          if (GENERIC.includes(line)) missing.push(`${dimension.id}:${lean} -> "${line}"`)
        }
      }
    }

    expect(
      missing,
      `Generic fallback copy is showing instead of written copy for:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('produces distinct copy for the two poles of a dimension', () => {
    for (const dimension of DIMENSIONS) {
      const high = narrativeFor(dimension.id, 'high')
      const low = narrativeFor(dimension.id, 'low')
      expect(high.atYourBest[0], `${dimension.id} poles share "at your best" copy`).not.toBe(
        low.atYourBest[0],
      )
      expect(high.underPressure[0], `${dimension.id} poles share "under pressure" copy`).not.toBe(
        low.underPressure[0],
      )
    }
  })

  it('says so plainly when nothing is distinctive', () => {
    const narrative = profileNarrativePrompt.compose({
      user: {
        id: 'u',
        displayName: 'Test',
        jobTitle: null,
        company: null,
        coachingStyle: 'balanced',
  timeZone: 'America/Chicago',
        interactionProfile: null,
      },
      archetype: 'Adaptive Generalist',
      confidence: 'provisional',
      dimensions: DIMENSIONS.map((d) => ({
        id: d.id,
        label: d.label,
        pole: 'Balanced',
        blurb: '',
        score: 50,
        lean: null,
      })),
    })

    expect(narrative.summary).toMatch(/did not lean strongly/i)
    expect(narrative.naturalDefault).toEqual([])
  })

  it('validates against its own schema', () => {
    const narrative = narrativeFor('structure', 'high')
    expect(() => profileNarrativePrompt.schema.parse(narrative)).not.toThrow()
  })

  it('composes a real narrative from an actual scored run', () => {
    // End-to-end: answer the instrument, score it, render the reveal copy.
    const responses = BLOCKS.map((block) => {
      const most = block.items.find((i) => i.dimension === 'structure' && i.direction === 1)
      const fallback = block.items[0]!
      const chosen = most ?? fallback
      const other = block.items.find((i) => i.id !== chosen.id)!
      return { blockId: block.id, mostItemId: chosen.id, leastItemId: other.id }
    })

    const scored = scoreResponses(responses)
    const narrative = profileNarrativePrompt.compose({
      user: {
        id: 'u',
        displayName: 'Test',
        jobTitle: null,
        company: null,
        coachingStyle: 'balanced',
  timeZone: 'America/Chicago',
        interactionProfile: null,
      },
      archetype: scored.archetype,
      confidence: scored.confidence,
      dimensions: scored.ranked.map((d) => {
        const described = describeDimension(d)
        return {
          id: d.dimension,
          label: described.label,
          pole: described.pole,
          blurb: described.blurb,
          score: d.score,
          lean: d.lean,
        }
      }),
    })

    expect(narrative.naturalDefault.length).toBeGreaterThan(0)
    // Every rendered line must be distinct: repetition was the original defect.
    const best = narrative.atYourBest
    expect(new Set(best).size).toBe(best.length)
  })
})
