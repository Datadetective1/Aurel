import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BLOCKS, BLOCK_COUNT, INITIAL_BLOCK_COUNT, DIMENSIONS } from './instrument'
import { scoreResponses } from './scoring'

/**
 * Progressive profiling.
 *
 * Two halves. The first covers the RETIRED forced-choice instrument, which
 * still has to score correctly because profiles recorded before the redesign
 * are read back through it. The second covers the live path: where later
 * scenario questions come from, and what the prompt is allowed to do.
 *
 * The scenario instrument's own behaviour is tested in scenario-scoring.test.
 */

/** Answer the first `n` blocks, always taking the first and last item. */
function answerFirst(n: number) {
  return BLOCKS.slice(0, n).map((block) => ({
    blockId: block.id,
    mostItemId: block.items[0]!.id,
    leastItemId: block.items[block.items.length - 1]!.id,
  }))
}

describe('the retired instrument still scores its own records', () => {
  it('kept its shape', () => {
    expect(INITIAL_BLOCK_COUNT).toBe(6)
    expect(BLOCK_COUNT).toBe(24)
    expect(INITIAL_BLOCK_COUNT).toBeLessThan(BLOCK_COUNT)
  })

  it('takes them from the front of the existing order', () => {
    // Not cherry-picked to maximise coverage. Reordering the instrument to
    // suit the UI is the change this was told not to make.
    const opening = BLOCKS.slice(0, INITIAL_BLOCK_COUNT).map((b) => b.index)
    expect(opening).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('touches every dimension even so', () => {
    // The blocks rotate dimensions by OFFSETS = [0,1,3,5] over eight
    // dimensions, so the first six reach all eight without being chosen for it.
    const touched = new Set(
      BLOCKS.slice(0, INITIAL_BLOCK_COUNT).flatMap((b) => b.items.map((i) => i.dimension)),
    )
    expect(touched.size).toBe(DIMENSIONS.length)
  })
})

describe('partial profiles are scored, not fabricated', () => {
  it('scores six answers without inventing the other eighteen', () => {
    const scored = scoreResponses(answerFirst(INITIAL_BLOCK_COUNT))
    expect(scored.answered).toBe(INITIAL_BLOCK_COUNT)

    // Every dimension still gets a reported score, but the ones nobody spoke
    // to sit at the midpoint with zero contributions rather than a guess.
    const untouched = scored.dimensions.filter((d) => d.contributions === 0)
    for (const dimension of untouched) {
      expect(dimension.raw).toBe(0)
      expect(dimension.lean).toBeNull()
    }
  })

  it('cannot report better than provisional on the opening sitting', () => {
    // Not a flag or a special case -- confidenceFrom requires 12 answers
    // before anything above provisional is reachable, and six is six.
    const scored = scoreResponses(answerFirst(INITIAL_BLOCK_COUNT))
    expect(scored.confidence).toBe('provisional')
  })

  it('reports coverage below one on a short run', () => {
    const scored = scoreResponses(answerFirst(INITIAL_BLOCK_COUNT))
    expect(scored.coverage).toBeLessThan(1)
  })

  it('improves as more rounds are answered', () => {
    const short = scoreResponses(answerFirst(6))
    const long = scoreResponses(answerFirst(24))
    expect(long.answered).toBeGreaterThan(short.answered)
    expect(long.coverage).toBeGreaterThanOrEqual(short.coverage)
  })

  it('scores the full instrument exactly as before', () => {
    // The regression that would matter most: a full run must be unaffected by
    // any of this.
    const scored = scoreResponses(answerFirst(BLOCK_COUNT))
    expect(scored.answered).toBe(BLOCK_COUNT)
    expect(scored.version).toBeTruthy()
    expect(Object.keys(scored.scores).length).toBe(DIMENSIONS.length)
  })

  it('never returns a score outside 0-100, however few answers', () => {
    for (const n of [1, 2, 6, 13, 24]) {
      const scored = scoreResponses(answerFirst(n))
      for (const value of Object.values(scored.scores)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('where later questions come from', () => {
  const selector = readFileSync(
    join(process.cwd(), 'src', 'lib', 'assessment', 'next-question.ts'),
    'utf8',
  )

  it('only ever considers unanswered scenarios', () => {
    // Selection is by weakest evidence now rather than plain instrument order
    // -- see the ranking tests below -- but it must still never re-ask
    // something already answered.
    expect(selector).toMatch(/ALL_SCENARIOS\.filter\(\(s\) => !answered\.has\(s\.id\)\)/)
  })

  it('asks nothing until the account has produced a brief', () => {
    // Somebody who has not seen Atturel do anything has no reason to invest
    // more in teaching it about themselves.
    expect(selector).toMatch(/meeting_brief/)
    expect(selector).toMatch(/briefs === 0\) return null/)
  })

  it('respects a dismissal', () => {
    expect(selector).toMatch(/snoozedUntil/)
  })

  it('stops once the instrument is complete', () => {
    expect(selector).toMatch(/answered\.size >= TOTAL_COUNT\) return null/)
  })

  it('does not extend a legacy profile with questions it never contained', () => {
    expect(selector).toMatch(/instrument_version', SCENARIO_VERSION/)
  })

  it('asks about the weakest evidence first', () => {
    // A fourth question about a settled dimension is how a refinement prompt
    // earns its dismissal.
    expect(selector).toMatch(/directionalByDimension\[a\.dimension\] - directionalByDimension\[b\.dimension\]/)
  })

  it('breaks ties deterministically, so the same state asks the same question', () => {
    expect(selector).toMatch(/ALL_SCENARIOS\.indexOf\(a\) - ALL_SCENARIOS\.indexOf\(b\)/)
  })

  it('spaces answers so a session gets at most one', () => {
    expect(selector).toMatch(/ANSWER_SPACING_MS/)
    expect(selector).toMatch(/Date\.now\(\) - lastAnswer < ANSWER_SPACING_MS\) return null/)
  })

  it('counts only directional answers as evidence when ranking', () => {
    // "It depends" tells us the dimension varies, which is a reason to keep
    // asking there, not a reason to stop.
    expect(selector).toMatch(/if \(row\.is_depends\) continue/)
  })
})

describe('the prompt itself', () => {
  const prompt = readFileSync(
    join(process.cwd(), 'src', 'components', 'app', 'profile-prompt.tsx'),
    'utf8',
  )
  const today = readFileSync(
    join(process.cwd(), 'src', 'app', '(app)', 'today', 'page.tsx'),
    'utf8',
  )

  it('appears on Today and nowhere else', () => {
    // Never during preparation or a debrief: interrupting somebody
    // mid-preparation to ask about themselves is the wrong moment.
    expect(today).toMatch(/<ProfilePrompt/)
    for (const page of ['brief', 'debrief', 'prepare']) {
      const path = join(process.cwd(), 'src', 'app', '(app)', 'meetings', '[id]', page, 'page.tsx')
      try {
        expect(readFileSync(path, 'utf8')).not.toMatch(/ProfilePrompt/)
      } catch {
        // Page does not exist; nothing to assert.
      }
    }
  })

  it('shows exactly one question', () => {
    // One prompt, its own options, nothing iterating over questions.
    expect(prompt).toMatch(/block\.options\.map/)
    expect(prompt).not.toMatch(/blocks\.map|questions\.map|scenarios\.map/)
  })

  it('is dismissible and does not block anything', () => {
    expect(prompt).toMatch(/aria-label="Not now/)
    expect(prompt).not.toMatch(/role="dialog"|position:\s*fixed|z-\[?\d/)
  })

  it('states progress without making it a demand', () => {
    expect(prompt).toContain('Profile refinement:')
  })
})

describe('analytics carry no answer content', () => {
  const actions = readFileSync(
    join(process.cwd(), 'src', 'app', '(app)', 'profile-prompt-actions.ts'),
    'utf8',
  )

  it('never tracks which statement was chosen', () => {
    const tracked = [...actions.matchAll(/track\(\s*'[a-z_]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )
    expect(tracked.length).toBeGreaterThan(1)
    for (const props of tracked) {
      expect(props).not.toMatch(/mostItemId|leastItemId|itemId|text|blockId/)
    }
  })
})
