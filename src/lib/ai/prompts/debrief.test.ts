import { describe, expect, it } from 'vitest'
import { debriefPrompt, normaliseCommitment } from './debrief'
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

describe('normaliseCommitment', () => {
  const room = new Set(['p1', 'p2'])
  const base = { description: 'Send the utilisation breakdown', owner: 'user' as const, ownerPersonId: null, dueOn: null }

  it('discards an ownerPersonId that is not a uuid in the room', () => {
    // The exact production failure: the model answered with a display name.
    // The column is a uuid, so the insert failed and the commitment was lost.
    const result = normaliseCommitment({ ...base, ownerPersonId: 'AI Activation Check' }, room)
    expect(result.ownerPersonId).toBeNull()
  })

  it('discards a real uuid belonging to someone who was not there', () => {
    const result = normaliseCommitment(
      { ...base, owner: 'person', ownerPersonId: '00000000-0000-4000-8000-000000000000' },
      room,
    )
    expect(result.ownerPersonId).toBeNull()
  })

  it('keeps an id that is genuinely a participant', () => {
    const result = normaliseCommitment({ ...base, owner: 'person', ownerPersonId: 'p2' }, room)
    expect(result.ownerPersonId).toBe('p2')
    expect(result.owner).toBe('person')
  })

  it("downgrades 'person' to 'shared' when there is nobody to point at", () => {
    // A commitment owed by an unidentified person is not something the user can
    // act on, and showing it as owed by someone else would be a claim about a
    // person the record cannot name.
    const result = normaliseCommitment({ ...base, owner: 'person', ownerPersonId: 'Dana' }, room)
    expect(result.owner).toBe('shared')
  })

  it('never downgrades an owner the user actually holds', () => {
    expect(normaliseCommitment({ ...base, owner: 'user' }, room).owner).toBe('user')
    expect(normaliseCommitment({ ...base, owner: 'shared' }, room).owner).toBe('shared')
  })

  it('keeps a well-formed date and drops one the database would reject', () => {
    expect(normaliseCommitment({ ...base, dueOn: '2026-08-28' }, room).dueOn).toBe('2026-08-28')
    // Losing the date is survivable. Losing the whole commitment is not.
    expect(normaliseCommitment({ ...base, dueOn: 'next Friday' }, room).dueOn).toBeNull()
    expect(normaliseCommitment({ ...base, dueOn: '2026-13-45' }, room).dueOn).toBeNull()
    expect(normaliseCommitment({ ...base, dueOn: '' }, room).dueOn).toBeNull()
  })

  it('truncates a description rather than letting the insert fail on length', () => {
    const result = normaliseCommitment({ ...base, description: 'x'.repeat(900) }, room)
    expect(result.description).toHaveLength(500)
  })
})
