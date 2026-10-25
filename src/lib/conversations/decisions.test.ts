import { describe, expect, it } from 'vitest'
import {
  isProposedDecision,
  PROPOSED_CONFIDENCE_CAP,
  readDecision,
  readDecisionText,
} from './decisions'
import { decisionPreselected, LOOP_PRESELECT_THRESHOLD, LOOP_PROPOSAL_FLOOR } from './loops'

/**
 * FINDING 8.7: A PROPOSAL IS NOT A DECISION
 * =============================================================================
 * The audit's test conversation, one phrase at a time: the clear decision
 * reads as decided, and every proposal variant reads as proposed.
 * =============================================================================
 */

const CLEAR_DECISION = 'We decided to move the launch to March.'
const PROPOSALS = [
  "I'd suggest we go with vendor B.",
  "I'd suggest going with vendor B.",
  'Ravi recommended going with vendor B.',
  'We could go with vendor B.',
  "Let's consider moving to vendor B.",
  'How about we go with vendor B?',
]

describe('the audit test conversation', () => {
  it('reads the clear decision as decided', () => {
    expect(readDecisionText(CLEAR_DECISION)).toBe('decided')
  })

  it.each(PROPOSALS)('reads "%s" as proposed', (phrase) => {
    expect(readDecisionText(phrase)).toBe('proposed')
  })
})

describe('settled outcomes stay decisions', () => {
  it.each([
    'We agreed to go with the March launch date.',
    'Ravi Menon: Yes, we are going with March.',
    "It's settled: March.",
    'We went with vendor B.',
    'Approved: the Q3 budget.',
    'The launch moves to March.',
    // The history of a decision does not hedge it.
    'We decided to go with vendor B, as Ravi recommended.',
    "We agreed to Ravi's proposal.",
    'After considering both, we decided to go with vendor B.',
  ])('"%s" is decided', (phrase) => {
    expect(readDecisionText(phrase)).toBe('decided')
  })
})

describe('proposals, hypotheticals, conditions and open questions', () => {
  it.each([
    'My proposal is to go with vendor B.',
    "I'd prefer vendor B.",
    'What if we moved the launch to March?',
    'Should we go with vendor B?',
    'Maybe we decided too fast.',
    "We haven't decided on the vendor yet.",
    'We still need to decide whether to go with vendor B.',
    'Vendor B is not decided yet.',
    'If the launch moves to March, marketing needs a new date.',
    'Proposed: go with vendor B',
    // Curly apostrophes, as phones type them.
    'I’d suggest going with vendor B.',
  ])('"%s" is proposed', (phrase) => {
    expect(readDecisionText(phrase)).toBe('proposed')
  })
})

describe('a reason given for a decision does not hedge it', () => {
  it.each([
    'We decided to move the launch to March so the team would have time.',
    'We agreed to go with vendor B because it could scale.',
    'We decided to go with vendor B, which will probably cost less.',
    'We decided to go with vendor B since they could start in March.',
    'We agreed to go with vendor B, although it might cost more.',
    'We decided to go with vendor B because Ravi suggested it.',
    // A decision reported in the future tense.
    'We decided we would launch in March.',
    "We agreed we'd revisit pricing in Q3.",
  ])('"%s" is decided', (phrase) => {
    expect(readDecisionText(phrase)).toBe('decided')
  })
})

describe('a hedge on the decision itself still makes it a proposal', () => {
  it.each([
    'We agreed it might be worth trying vendor B.',
    'We agreed to consider vendor B.',
    'We agreed, so maybe we should go with vendor B.',
    "We decided we'd probably go with vendor B.",
    'We agreed to delay the launch if QA is not done.',
    "I'd suggest going with vendor B, since finance approved it.",
    'Vendor B would be best.',
  ])('"%s" is proposed', (phrase) => {
    expect(readDecisionText(phrase)).toBe('proposed')
  })
})

describe('neither: left to the confidence it was read with', () => {
  it.each(['Vendor B for the pilot.', 'Go with vendor B', '', null])('"%s" is unmarked', (t) => {
    expect(readDecisionText(t)).toBe('unmarked')
  })
})

describe('an extracted decision is read from its excerpt and its own text', () => {
  it('a model paraphrase cannot hide the hedge in the excerpt', () => {
    expect(
      readDecision({
        description: 'Go with vendor B',
        excerpt: "Ravi Menon: I'd suggest going with vendor B.",
      }),
    ).toBe('proposed')
  })

  it('a description that says it was proposed is a proposal', () => {
    expect(readDecision({ description: 'Proposed: go with vendor B', excerpt: 'Vendor B?' })).toBe(
      'proposed',
    )
  })

  it('a settled excerpt with a plain description is decided', () => {
    expect(readDecision({ description: 'Move the launch to March', excerpt: CLEAR_DECISION })).toBe(
      'decided',
    )
  })
})

describe('pre-selection', () => {
  it('a proposal is capped below pre-selection, and still offered for review', () => {
    expect(PROPOSED_CONFIDENCE_CAP).toBeLessThan(LOOP_PRESELECT_THRESHOLD)
    expect(PROPOSED_CONFIDENCE_CAP).toBeGreaterThanOrEqual(LOOP_PROPOSAL_FLOOR)
  })

  it('a proposal stored with a high confidence still starts unticked', () => {
    // Rows written before this rule carry the old composer's 0.7.
    const legacy = {
      description: "I'd suggest going with vendor B.",
      excerpt: "Ravi Menon: I'd suggest going with vendor B.",
      confidence: 0.7,
    }
    expect(isProposedDecision(legacy)).toBe(true)
    expect(decisionPreselected(legacy)).toBe(false)
  })

  it('a confident, settled decision starts ticked; an unsure one does not', () => {
    const decided = { description: CLEAR_DECISION, excerpt: CLEAR_DECISION }
    expect(decisionPreselected({ ...decided, confidence: 0.7 })).toBe(true)
    expect(decisionPreselected({ ...decided, confidence: 0.6 })).toBe(false)
    expect(decisionPreselected({ ...decided, confidence: null })).toBe(false)
  })

  it('an unmarked decision keeps the existing confidence rule', () => {
    const unmarked = { description: 'Vendor B for the pilot', excerpt: 'Vendor B for the pilot.' }
    expect(decisionPreselected({ ...unmarked, confidence: 0.8 })).toBe(true)
    expect(decisionPreselected({ ...unmarked, confidence: 0.5 })).toBe(false)
  })
})
