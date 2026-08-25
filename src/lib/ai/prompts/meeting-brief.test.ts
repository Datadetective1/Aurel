import { describe, expect, it } from 'vitest'
import { meetingBriefPrompt, readsAsImperative } from './meeting-brief'
import type {
  MeetingContext,
  PersonContext,
  ProfessionalFactContext,
  UserContext,
} from '../types'

/**
 * Copy-quality tests for the composed brief.
 *
 * The composer splices user-written objectives into sentences. Objectives arrive
 * in whatever voice the user chose — "Get approval", "I need sign-off",
 * "Agreement on scope" — and an earlier frame produced "leave today having get
 * approval". These tests keep every generated sentence grammatical across those
 * phrasings, and keep punctuation from doubling up.
 */

const user: UserContext = {
  id: 'u1',
  displayName: 'Alex',
  jobTitle: 'Director of Engineering',
  company: 'Northwind',
  coachingStyle: 'balanced',
  interactionProfile: null,
}

function person(overrides: Partial<PersonContext> = {}): PersonContext {
  return {
    id: 'p1',
    fullName: 'Maya Chen',
    preferredName: 'Maya',
    displayName: 'Maya Chen',
    jobTitle: 'VP Engineering',
    organization: 'Acme',
    relationshipType: 'peer',
    relevance: 4,
    notes: null,
    topics: [],
    firstInteractionAt: null,
    lastInteractionAt: null,
    interactionCount: 0,
    observations: { confirmed: [], observed: [], inferred: [] },
    recentInteractions: [],
    openCommitments: [],
    professionalFacts: [],
    publicSources: [],
    lastResearchedAt: null,
    ...overrides,
  }
}

function input(objective: string | null, participants: PersonContext[] = [person()]) {
  const meeting: MeetingContext = {
    id: 'm1',
    title: 'Q3 capacity review',
    kind: 'executive_review',
    scheduledAt: null,
    durationMinutes: null,
    objective,
    stakes: null,
    extraContext: null,
    importance: 4,
    participants,
  }
  return { meeting, user }
}

function brief(objective: string | null, participants: PersonContext[] = [person()]) {
  return meetingBriefPrompt.compose(input(objective, participants))
}

/** Catches the doubled-stop and run-on patterns the composer used to produce. */
function assertCleanSentence(text: string, label: string) {
  expect(text, `${label}: doubled full stop`).not.toMatch(/\.\s*\./)
  expect(text, `${label}: stop before a dash continuation`).not.toMatch(/\.\s+—/)
  expect(text, `${label}: stop before a comma`).not.toMatch(/\.\s*,/)
  expect(text, `${label}: ungrammatical "having <verb>"`).not.toMatch(
    /having (get|make|secure|obtain|agree|approve)\b/i,
  )
  // "A clear answer on leave with a decision" — an imperative objective spliced
  // into a frame that needs a noun phrase. This shipped once.
  expect(text, `${label}: command spliced after a preposition`).not.toMatch(
    /\b(on|about|regarding)\s+(leave|get|secure|agree|decide|close|align|confirm|approve|settle)\b/i,
  )
  expect(text, `${label}: command spliced after "is"`).not.toMatch(
    /\bis\s+(leave|get|secure|agree|decide|close|align|confirm|approve|settle)\b/i,
  )
}

const OBJECTIVE_PHRASINGS = [
  'Get approval to move two engineers onto the migration before the quarter closes.',
  'I want to secure sign-off on the revised budget.',
  'Agreement on the scope for phase two.',
  'We need to decide whether to delay the launch',
  'To confirm the owner for the compliance workstream.',
  // The phrasing that produced "A clear answer on leave with a decision".
  'Leave with a decision on the platform investment.',
  'Close the loop on the migration timeline',
  'Getting sign-off on the hiring plan.',
  'Alignment between engineering and finance',
]

describe('meeting brief copy quality', () => {
  it('produces grammatical output for every objective phrasing', () => {
    for (const objective of OBJECTIVE_PHRASINGS) {
      const result = brief(objective)
      assertCleanSentence(result.howToOpen, `howToOpen for "${objective}"`)
      assertCleanSentence(result.outcomeToLeaveWith, `outcomeToLeaveWith for "${objective}"`)
      assertCleanSentence(result.sixtySecond, `sixtySecond for "${objective}"`)
      for (const step of result.recommendedApproach) {
        assertCleanSentence(step, `approach step for "${objective}"`)
      }
    }
  })

  it('tells a command apart from a thing', () => {
    expect(readsAsImperative('Leave with a decision on the platform investment')).toBe(true)
    expect(readsAsImperative('Get approval for the extra headcount')).toBe(true)
    expect(readsAsImperative('Close the loop on the timeline')).toBe(true)

    expect(readsAsImperative('Agreement on the scope for phase two')).toBe(false)
    expect(readsAsImperative('Getting sign-off on the hiring plan')).toBe(false)
    expect(readsAsImperative('Alignment between engineering and finance')).toBe(false)
    expect(readsAsImperative('')).toBe(false)

    // "I want to" / "To" are stripped first, so what follows decides.
    expect(readsAsImperative('I want to secure sign-off')).toBe(true)
    expect(readsAsImperative('To confirm the owner')).toBe(true)
  })

  it('states an imperative objective rather than splicing it', () => {
    const result = brief('Leave with a decision on the platform investment.')
    expect(result.outcomeToLeaveWith).not.toContain('answer on leave')
    expect(result.outcomeToLeaveWith.toLowerCase()).toContain('leave with a decision')
    expect(result.howToOpen).not.toContain('is leave with')
  })

  it('still splices a noun-phrase objective, which reads better', () => {
    const result = brief('Agreement on the scope for phase two.')
    expect(result.outcomeToLeaveWith).toContain('A clear answer on agreement on the scope')
  })

  it('never emits the "having get approval" construction', () => {
    const result = brief('Get approval to move two engineers onto the migration.')
    expect(result.howToOpen).not.toContain('having get')
  })

  it('works when there is no objective', () => {
    const result = brief(null)
    expect(result.objective).toMatch(/no objective/i)
    assertCleanSentence(result.howToOpen, 'howToOpen without objective')
    // And it must say so in the uncertainties rather than quietly proceeding.
    expect(result.uncertainties.join(' ')).toMatch(/objective/i)
  })

  it('always fills the required uncertainties section', () => {
    const result = brief('Get approval for the migration.')
    expect(result.uncertainties.length).toBeGreaterThan(0)
  })

  it('is honest when there is no interaction history', () => {
    const result = brief('Get approval for the migration.')
    expect(result.sixtySecond.toLowerCase()).toContain('no recorded history')
    expect(result.participants[0]!.relationshipNote).toMatch(/no recorded interactions/i)
  })

  it('returns null room dynamics for a one-to-one', () => {
    // Room dynamics with a single participant would be invented structure.
    expect(brief('Get approval.', [person()]).roomDynamics).toBeNull()
  })

  it('builds room dynamics when there is an actual room', () => {
    const result = brief('Get approval.', [
      person({ id: 'p1', displayName: 'Maya Chen', meetingRole: 'decision_maker' }),
      person({ id: 'p2', displayName: 'Daniel Brooks', preferredName: 'Daniel' }),
    ])
    expect(result.roomDynamics).not.toBeNull()
    expect(result.roomDynamics!.decisionOwner).toBe('Maya Chen')
    for (const step of result.roomDynamics!.sequencing) {
      assertCleanSentence(step, 'sequencing step')
    }
  })

  it('surfaces an overdue commitment ahead of the ask', () => {
    const result = brief('Get approval for the migration.', [
      person({
        openCommitments: [
          {
            id: 'c1',
            description: 'Send the utilisation numbers',
            owner: 'user',
            ownerName: null,
            dueOn: '2020-01-01',
            isOverdue: true,
          },
        ],
      }),
    ])
    expect(result.recommendedApproach[0]).toMatch(/utilisation numbers/i)
    expect(result.howToOpen).toMatch(/close the loop/i)
    expect(result.howToOpen).toContain('Send the utilisation numbers')
    assertCleanSentence(result.howToOpen, 'overdue howToOpen')
  })

  it('validates against its schema for every phrasing', () => {
    for (const objective of OBJECTIVE_PHRASINGS) {
      expect(() => meetingBriefPrompt.schema.parse(brief(objective))).not.toThrow()
    }
  })

  it('cites every observation and commitment it was given', () => {
    const input = {
      meeting: {
        id: 'm1',
        title: 'Q3 capacity review',
        kind: 'executive_review' as const,
        scheduledAt: null,
        durationMinutes: null,
        objective: 'Get approval.',
        stakes: null,
        extraContext: null,
        importance: 4,
        participants: [
          person({
            observations: {
              confirmed: [
                {
                  id: 'o1',
                  content: 'Wants the cost impact first.',
                  category: 'communication' as const,
                  evidenceLevel: 'confirmed' as const,
                  reinforcementCount: 2,
                  lastReinforcedAt: null,
                  sources: [],
                },
              ],
              observed: [],
              inferred: [],
            },
          }),
        ],
      },
      user,
    }
    const citations = meetingBriefPrompt.cite(input)
    expect(citations.some((c) => c.observationId === 'o1')).toBe(true)
    expect(citations.every((c) => c.label.length > 0)).toBe(true)
  })
})

/**
 * FIRST-MEETING INTELLIGENCE
 * =============================================================================
 * The V1→V2 difference: before any private interaction exists, a brief must
 * still be useful from public evidence — and must say plainly that it is public
 * evidence, not a read on the person.
 * =============================================================================
 */

function fact(overrides: Partial<ProfessionalFactContext> = {}): ProfessionalFactContext {
  return {
    id: 'f1',
    kind: 'current_role',
    value: 'VP Engineering',
    detail: 'Meridian Systems',
    evidenceLevel: 'observed',
    asOf: '2026-06-01',
    hasConflict: false,
    sourceTitles: ['Meridian leadership page'],
    ...overrides,
  }
}

describe('first-meeting intelligence', () => {
  const stranger = (facts: ProfessionalFactContext[]) =>
    person({
      fullName: 'Jordan Avery',
      preferredName: 'Jordan',
      displayName: 'Jordan Avery',
      interactionCount: 0,
      observations: { confirmed: [], observed: [], inferred: [] },
      recentInteractions: [],
      professionalFacts: facts,
      publicSources: [
        {
          id: 's1',
          title: 'Meridian leadership page',
          url: 'https://meridian.example.com/team',
          publisher: 'Meridian Systems',
          sourceType: 'company_bio',
          retrievedAt: '2026-08-20T00:00:00Z',
          publishedAt: '2026-06-01T00:00:00Z',
          identityStatus: 'confirmed',
        },
      ],
    })

  it('uses public evidence when there is no relationship history at all', () => {
    const result = brief('Agreement on the platform investment.', [stranger([fact()])])
    const participant = result.participants[0]!

    expect(participant.publicContext.length).toBeGreaterThan(0)
    expect(participant.publicContext[0]!.statement).toContain('VP Engineering')
    // The claim must carry where it came from.
    expect(participant.publicContext[0]!.sourceLabel).toBe('Meridian leadership page')
  })

  it('says relationship history is none yet, in those words', () => {
    const result = brief('Agreement on scope.', [stranger([fact()])])
    expect(result.participants[0]!.relationshipNote).toMatch(/relationship history: none yet/i)
  })

  it('marks guidance preliminary rather than presenting it as a read', () => {
    const result = brief('Agreement on scope.', [stranger([fact()])])
    expect(result.participants[0]!.publicOnly).toBe(true)
    expect(result.participants[0]!.relationshipNote).toMatch(/preliminary/i)
  })

  it('keeps public context out of the relationship fields', () => {
    const result = brief('Agreement on scope.', [stranger([fact()])])
    const p = result.participants[0]!
    // A company bio must never surface as "how to approach them".
    expect(p.guidance.join(' ')).not.toContain('VP Engineering')
    expect(p.whatMatters.join(' ')).not.toContain('VP Engineering')
  })

  it('states that what is known is public, not behavioural', () => {
    const result = brief('Agreement on scope.', [stranger([fact()])])
    expect(result.uncertainties.join(' ')).toMatch(
      /comes from public sources.*not from working with them/i,
    )
  })

  it('warns when a public detail is old rather than presenting it as current', () => {
    const old = fact({ asOf: '2019-01-01' })
    const result = brief('Agreement on scope.', [stranger([old])])
    expect(result.uncertainties.join(' ')).toMatch(/over a year old/i)
  })

  it('warns when the source stated no date at all', () => {
    const undated = fact({ asOf: null })
    const result = brief('Agreement on scope.', [stranger([undated])])
    expect(result.uncertainties.join(' ')).toMatch(/did not state when they were written/i)
    // And the line itself must not imply currency.
    const statement = result.participants[0]!.publicContext[0]!.statement
    expect(statement).toContain('date not stated')
  })

  it('surfaces a disagreement between sources instead of picking one', () => {
    const conflicted = fact({ hasConflict: true })
    const result = brief('Agreement on scope.', [stranger([conflicted])])
    expect(result.uncertainties.join(' ')).toMatch(/sources disagree/i)
    expect(result.participants[0]!.publicContext[0]!.statement).toContain('sources disagree')
  })

  it('flags a single-mention fact as inferred', () => {
    const thin = fact({ evidenceLevel: 'inferred', kind: 'theme', value: 'platform migration' })
    const result = brief('Agreement on scope.', [stranger([thin])])
    expect(result.participants[0]!.publicContext[0]!.statement).toContain('inferred from one mention')
  })

  it('cites the public sources so the user can open them', () => {
    const citations = meetingBriefPrompt.cite?.(input('Agreement on scope.', [stranger([fact()])]))
    expect(citations?.some((c) => c.sourceUrl === 'https://meridian.example.com/team')).toBe(true)
  })

  it('does not claim public knowledge for someone with no research at all', () => {
    const result = brief('Agreement on scope.', [stranger([])])
    const p = result.participants[0]!
    expect(p.publicContext).toEqual([])
    expect(p.publicOnly).toBe(false)
    expect(result.uncertainties.join(' ')).toMatch(/no interaction history/i)
  })
})
