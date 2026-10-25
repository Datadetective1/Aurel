import { describe, expect, it } from 'vitest'
import {
  conversationPrompt,
  decisionWorthProposing,
  normaliseDecision,
  type ConversationAnalysis,
  type ConversationInput,
} from './conversation'
import { PROPOSED_CONFIDENCE_CAP, readDecision } from '@/lib/conversations/decisions'
import { decisionPreselected, LOOP_PRESELECT_THRESHOLD } from '@/lib/conversations/loops'
import type { PersonContext, UserContext } from '../types'

/**
 * FINDING 8.7, ON BOTH EXTRACTION PATHS
 * =============================================================================
 * The audit's test conversation: one clear decision, and the proposal
 * variants. On the fallback composer and on a model's answer (simulated, as a
 * model that gets it wrong), only the clear decision comes out as a decision
 * that starts ticked. Every proposal is either not a decision at all or a
 * decision below pre-selection that reads as "Proposed, not decided".
 * =============================================================================
 */

const user: UserContext = {
  id: 'u1',
  displayName: 'Alex Rivera',
  jobTitle: 'Director of Engineering',
  company: 'Northwind',
  coachingStyle: 'balanced',
  timeZone: 'America/Chicago',
  interactionProfile: null,
}

function person(id: string, fullName: string, preferred: string | null = null): PersonContext {
  return {
    id,
    fullName,
    preferredName: preferred,
    displayName: fullName,
    jobTitle: null,
    organization: null,
    relationshipType: 'peer',
    relevance: 3,
    notes: null,
    topics: [],
    firstInteractionAt: null,
    lastInteractionAt: null,
    interactionCount: 1,
    observations: { confirmed: [], observed: [], inferred: [] },
    recentInteractions: [],
    openCommitments: [],
    decisions: [],
    professionalFacts: [],
    publicSources: [],
    lastResearchedAt: null,
  }
}

const participants = [person('p-ravi', 'Ravi Menon'), person('p-jason', 'Jason Ortiz', 'Jason')]
const valid = new Set(participants.map((p) => p.id))

/** (A) The clear decision. */
const A = 'We decided to move the launch to March.'
/** (B) and its variants. */
const PROPOSALS = [
  "I'd suggest we go with vendor B.",
  "I'd suggest going with vendor B.",
  'Ravi recommended going with vendor B.',
  'We could go with vendor B.',
  "Let's consider moving to vendor B.",
  'How about we go with vendor B?',
]

const TYPED = [A, ...PROPOSALS].join('\n')
const TRANSCRIPT = [
  `Alex Rivera: ${A}`,
  `Ravi Menon: ${PROPOSALS[0]}`,
  `Ravi Menon: ${PROPOSALS[1]}`,
  `Jason: ${PROPOSALS[2]}`,
  `Jason: ${PROPOSALS[3]}`,
  `Ravi Menon: ${PROPOSALS[4]}`,
  `Alex Rivera: ${PROPOSALS[5]}`,
].join('\n')

function input(
  source: string,
  sourceKind: ConversationInput['conversation']['sourceKind'],
): ConversationInput {
  return {
    user,
    participants,
    priorObjective: null,
    conversation: {
      id: 'c1',
      title: 'Launch and vendor',
      occurredAt: '2026-09-10T15:00:00Z',
      source,
      sourceKind,
      wentWell: null,
    },
  }
}

/** What reaches the database, and what Review would start ticked. */
function written(out: ConversationAnalysis) {
  return out.decisions
    .map((d) => normaliseDecision(d, valid))
    .filter(decisionWorthProposing)
    .map((d) => ({ ...d, preselected: decisionPreselected(d), reading: readDecision(d) }))
}

describe.each([
  ['typed notes', TYPED, 'typed_notes'],
  ['a transcript', TRANSCRIPT, 'pasted_transcript'],
] as const)('the fallback composer, on %s', (_label, source, kind) => {
  const out = conversationPrompt.compose(input(source, kind))
  const decisions = written(out)

  it('the clear decision is the only decision, and the only one that starts ticked', () => {
    const settled = decisions.filter((d) => d.reading === 'decided')
    expect(settled.map((d) => d.description)).toEqual([A])
    expect(decisions.filter((d) => d.preselected).map((d) => d.description)).toEqual([A])
    expect(settled[0]!.confidence).toBeGreaterThanOrEqual(LOOP_PRESELECT_THRESHOLD)
  })

  it('every proposal written as a decision is labelled proposed, below pre-selection', () => {
    const proposed = decisions.filter((d) => d.description !== A)
    // "I'd suggest going with…" and "Ravi recommended going with…" carry the
    // composer's decision cue; before the fix they were 0.7 and pre-ticked.
    expect(proposed.map((d) => d.description)).toEqual([PROPOSALS[1], PROPOSALS[2]])
    for (const d of proposed) {
      expect(d.reading).toBe('proposed')
      expect(d.confidence).toBeLessThanOrEqual(PROPOSED_CONFIDENCE_CAP)
      expect(d.preselected).toBe(false)
    }
  })

  it('no variant is a decision at or above pre-selection', () => {
    for (const phrase of PROPOSALS) {
      const asDecision = decisions.find((d) => d.description === phrase)
      if (asDecision) expect(asDecision.confidence).toBeLessThan(LOOP_PRESELECT_THRESHOLD)
    }
  })

  it('"How about…?" is an open question, not a decision, and starts unticked', () => {
    const question = out.loops.find((l) => /How about we go with vendor B/.test(l.description))
    expect(question?.kind).toBe('question')
    expect(question!.confidence).toBeLessThan(LOOP_PRESELECT_THRESHOLD)
  })

  it('the outcome is the decision, never a proposal', () => {
    expect(out.outcome).toBe(A)
  })
})

describe('the fallback composer, a proposal first', () => {
  it('does not become the outcome', () => {
    const out = conversationPrompt.compose(
      input(`${PROPOSALS[1]}\n${PROPOSALS[2]}\n${A}`, 'typed_notes'),
    )
    expect(out.decisions[0]!.description).toBe(PROPOSALS[1])
    expect(out.outcome).toBe(A)
  })

  it('with only proposals, there is no outcome to state', () => {
    const out = conversationPrompt.compose(input(`${PROPOSALS[1]}\n${PROPOSALS[2]}`, 'typed_notes'))
    expect(out.outcome).toBe('No explicit outcome recorded.')
  })
})

describe('a model answer that calls every variant a decision', () => {
  // What a model gets wrong: every line read as settled, at 0.9, with a
  // paraphrase that drops the hedge. The excerpt is still the words said.
  const answer: ConversationAnalysis = {
    summary: 'Launch timing and vendor choice.',
    outcome: 'The launch moves to March.',
    topics: [],
    loops: [],
    decisions: [A, ...PROPOSALS].map((excerpt) => ({
      description: excerpt === A ? 'Move the launch to March' : 'Go with vendor B',
      context: null,
      personIds: ['p-ravi', 'Ravi Menon'],
      confidence: 0.9,
      excerpt,
    })),
    objections: [],
    proposedMemories: [],
    nextTime: [],
  }

  const reconciled = conversationPrompt.reconcile!(answer, input(TRANSCRIPT, 'pasted_transcript'))
  const decisions = written(reconciled)

  it('keeps the clear decision as it was read, and starts only that one ticked', () => {
    const a = decisions.find((d) => d.excerpt === A)!
    expect(a.reading).toBe('decided')
    expect(a.confidence).toBe(0.9)
    expect(decisions.filter((d) => d.preselected).map((d) => d.excerpt)).toEqual([A])
  })

  it('caps every proposal below pre-selection and reads it as proposed', () => {
    const proposals = decisions.filter((d) => d.excerpt !== A)
    expect(proposals).toHaveLength(PROPOSALS.length)
    for (const d of proposals) {
      expect(d.reading).toBe('proposed')
      expect(d.confidence).toBe(PROPOSED_CONFIDENCE_CAP)
      expect(d.preselected).toBe(false)
    }
  })

  it('still drops a name given where an id belongs', () => {
    expect(decisions.every((d) => d.personIds.join() === 'p-ravi')).toBe(true)
  })
})

describe('the instruction to the model', () => {
  it('says a proposal is not a decision, with the audit examples', () => {
    const system = conversationPrompt.system(input(TYPED, 'typed_notes'))
    expect(system).toContain('A PROPOSAL IS NOT A DECISION')
    expect(system).toContain("I'd suggest going with vendor B")
    expect(system).toContain('never present a proposal or suggestion as the outcome')
  })
})
