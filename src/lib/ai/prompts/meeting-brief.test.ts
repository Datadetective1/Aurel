import { describe, expect, it } from 'vitest'
import { meetingBriefPrompt } from './meeting-brief'
import type { MeetingContext, PersonContext, UserContext } from '../types'

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
    ...overrides,
  }
}

function brief(objective: string | null, participants: PersonContext[] = [person()]) {
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
  return meetingBriefPrompt.compose({ meeting, user })
}

/** Catches the doubled-stop and run-on patterns the composer used to produce. */
function assertCleanSentence(text: string, label: string) {
  expect(text, `${label}: doubled full stop`).not.toMatch(/\.\s*\./)
  expect(text, `${label}: stop before a dash continuation`).not.toMatch(/\.\s+—/)
  expect(text, `${label}: stop before a comma`).not.toMatch(/\.\s*,/)
  expect(text, `${label}: ungrammatical "having <verb>"`).not.toMatch(
    /having (get|make|secure|obtain|agree|approve)\b/i,
  )
}

const OBJECTIVE_PHRASINGS = [
  'Get approval to move two engineers onto the migration before the quarter closes.',
  'I want to secure sign-off on the revised budget.',
  'Agreement on the scope for phase two.',
  'We need to decide whether to delay the launch',
  'To confirm the owner for the compliance workstream.',
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
