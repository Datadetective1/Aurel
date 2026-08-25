import { describe, expect, it } from 'vitest'
import { debriefPrompt } from './debrief'
import type { PersonContext, UserContext } from '../types'

/**
 * Debrief extraction quality.
 *
 * A commitment is a promise someone made. Getting this wrong is not cosmetic:
 * a false commitment shows up on Today as an overdue promise, and the product
 * then tells the user they owe someone something they never agreed to.
 */

const user: UserContext = {
  id: 'u1',
  displayName: 'Alex',
  jobTitle: 'Director of Engineering',
  company: 'Northwind',
  coachingStyle: 'balanced',
  interactionProfile: null,
}

function person(): PersonContext {
  return {
    id: 'p1',
    fullName: 'Satya Nadella',
    preferredName: 'Satya',
    displayName: 'Satya Nadella',
    jobTitle: 'CEO',
    organization: 'Microsoft',
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
    professionalFacts: [],
    publicSources: [],
    lastResearchedAt: null,
  }
}

function debrief(source: string) {
  return debriefPrompt.compose({
    interaction: {
      id: 'i1',
      title: 'Partnership introduction',
      occurredAt: '2026-08-28T10:00:00Z',
      source,
      wentWell: 4,
    },
    participants: [person()],
    user,
    priorObjective: null,
  })
}

describe('debrief commitment extraction', () => {
  const notes =
    'Satya asked for the utilisation numbers before agreeing to anything, and said he wants the ' +
    'cost impact stated before the recommendation. He pushed back on the proposed timeline, ' +
    'citing the compliance deadline. Agreed to a follow-up technical session in two weeks. ' +
    'I owe him the revised timeline by Friday.'

  it('does not treat an objection as a commitment', () => {
    const result = debrief(notes)
    const descriptions = result.commitments.map((c) => c.description).join(' ')
    // "citing the compliance deadline" is a reason, not a promise.
    expect(descriptions).not.toContain('pushed back')
  })

  it('still records the objection as an objection', () => {
    const result = debrief(notes)
    expect(result.objections.join(' ')).toContain('pushed back')
  })

  it('attributes "I owe him ..." to the user, not to nobody', () => {
    const result = debrief(notes)
    const owed = result.commitments.find((c) => /revised timeline/i.test(c.description))
    expect(owed).toBeDefined()
    expect(owed!.owner).toBe('user')
  })

  it('reads the due date out of the sentence', () => {
    const result = debrief(notes)
    const owed = result.commitments.find((c) => /revised timeline/i.test(c.description))
    expect(owed!.dueOn).toBeTruthy()
  })

  it('does not invent a commitment from the word "deadline" alone', () => {
    const result = debrief('The team mentioned the compliance deadline in passing.')
    expect(result.commitments).toEqual([])
  })

  it('keeps a genuine future commitment', () => {
    const result = debrief('I will send the revised deck by Tuesday.')
    expect(result.commitments).toHaveLength(1)
    expect(result.commitments[0]!.owner).toBe('user')
  })
})

describe('debrief prompt contract', () => {
  const system = debriefPrompt.system({
    interaction: {
      id: 'i1',
      title: 'Migration timeline',
      occurredAt: '2026-08-25T10:00:00Z',
      source: 'notes',
      wentWell: null,
    },
    participants: [person()],
    user,
    priorObjective: null,
  })

  it('forbids putting a name where an id belongs', () => {
    // The first production run against a real model returned the user's display
    // name as ownerPersonId for every commitment. The column is a uuid, so each
    // insert failed and — because the result was unchecked — both commitments
    // vanished while the UI reported the debrief saved.
    expect(system).toMatch(/ownerPersonId must be null unless owner is "person"/)
    expect(system).toMatch(/Never put a name here/)
  })

  it('asks for relative due dates to be resolved rather than dropped', () => {
    // "by Friday" is how people write, and returning null for it loses the
    // due date on most real commitments.
    expect(system).toMatch(/Resolve relative references against today's date/)
    expect(system).toMatch(/by Friday/)
  })

  it('gives the model the weekday, without which no weekday is resolvable', () => {
    expect(system).toMatch(
      /Today is (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{4}-\d{2}-\d{2}\./,
    )
  })
})
