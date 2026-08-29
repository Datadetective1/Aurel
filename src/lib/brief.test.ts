import { describe, expect, it } from 'vitest'
import {
  countdownLabel,
  formatNames,
  listeningCues,
  minutesUntil,
  normalizeBrief,
  startProximity,
  type NormalizedBrief,
} from './brief'

/**
 * The graduated brief reads artifacts it did not write, including ones written
 * before fields existed. These tests are mostly about degenerate input, because
 * that is where the risk actually is: a brief stored months ago is cast, not
 * parsed, and a missing array would take down the only screen the user opens
 * seven minutes before a meeting.
 */

describe('normalizeBrief', () => {
  it('returns a fully-formed brief from nothing at all', () => {
    for (const input of [undefined, null, {}, 'not an object', 42, []]) {
      const brief = normalizeBrief(input)
      expect(brief.participants).toEqual([])
      expect(brief.recommendedApproach).toEqual([])
      expect(brief.likelyObjections).toEqual([])
      expect(brief.uncertainties).toEqual([])
      expect(brief.roomDynamics).toBeNull()
      expect(brief.objective).toBeNull()
      expect(brief.sixtySecond).toBeNull()
    }
  })

  it('keeps the fields a real brief carries', () => {
    const brief = normalizeBrief({
      sixtySecond: 'Meeting with Maya.',
      objective: 'Approval to move two engineers.',
      recommendedApproach: ['State the ask.', 'Give the cost impact.'],
      howToOpen: 'Name the outcome first.',
      outcomeToLeaveWith: 'An owner and a date.',
      emphasize: ['The decision.'],
      avoid: ['Methodology first.'],
      questionsToAsk: ['How do you want this?'],
      checklist: ['One-sentence ask'],
      uncertainties: ['No history with Priya.'],
    })

    expect(brief.sixtySecond).toBe('Meeting with Maya.')
    expect(brief.recommendedApproach).toHaveLength(2)
    expect(brief.emphasize).toEqual(['The decision.'])
    expect(brief.checklist).toEqual(['One-sentence ask'])
  })

  it('treats a blank string as absent rather than as content', () => {
    // An empty objective rendered as an empty <p> under a heading, which reads
    // as a section that failed rather than one that was never filled in.
    const brief = normalizeBrief({ objective: '   ', howToOpen: '', sixtySecond: '\n' })
    expect(brief.objective).toBeNull()
    expect(brief.howToOpen).toBeNull()
    expect(brief.sixtySecond).toBeNull()
  })

  it('drops non-string entries from string arrays instead of coercing them', () => {
    const brief = normalizeBrief({
      recommendedApproach: ['Real step.', null, 42, { step: 'no' }, '', 'Second step.'],
    })
    expect(brief.recommendedApproach).toEqual(['Real step.', 'Second step.'])
  })

  it('survives a participant list written before publicContext existed', () => {
    const brief = normalizeBrief({
      participants: [{ personId: 'p1', name: 'Maya Chen', guidance: ['Lead with the ask.'] }],
    })
    const [participant] = brief.participants
    expect(participant!.publicContext).toEqual([])
    expect(participant!.publicOnly).toBe(false)
    expect(participant!.whatMatters).toEqual([])
    expect(participant!.knownConcerns).toEqual([])
    expect(participant!.relationshipNote).toBeNull()
  })

  it('labels a participant with no name rather than rendering a blank row', () => {
    const brief = normalizeBrief({ participants: [{ personId: 'p1' }] })
    expect(brief.participants[0]!.name).toBe('Unnamed participant')
  })

  it('keeps an objection whose basis is missing', () => {
    // The basis is what makes an objection inspectable, but an objection
    // without one is still the most useful thing on the page.
    const brief = normalizeBrief({
      likelyObjections: [
        { objection: 'The timeline slipped.', response: 'Cite the compliance date.' },
        { objection: 'No response recorded.' },
      ],
    })
    expect(brief.likelyObjections).toHaveLength(1)
    expect(brief.likelyObjections[0]!.basis).toBeNull()
  })

  it('accepts roomDynamics with only some of its lists', () => {
    const brief = normalizeBrief({ roomDynamics: { unresolvedIssues: ['Who owns the budget.'] } })
    expect(brief.roomDynamics!.unresolvedIssues).toEqual(['Who owns the budget.'])
    expect(brief.roomDynamics!.sequencing).toEqual([])
    expect(brief.roomDynamics!.decisionOwner).toBeNull()
  })

  it('keeps roomDynamics null when the brief stored it as null', () => {
    expect(normalizeBrief({ roomDynamics: null }).roomDynamics).toBeNull()
  })
})

// -------------------------------------------------------------------------

const emptyBrief = (): NormalizedBrief => normalizeBrief({})

describe('listeningCues', () => {
  it('returns nothing when nothing is open', () => {
    expect(listeningCues(emptyBrief(), { openCommitments: [] })).toEqual([])
  })

  it('carries unresolved issues verbatim', () => {
    const brief = normalizeBrief({
      roomDynamics: { unresolvedIssues: ['Whether the compliance deadline has moved.'] },
    })
    const cues = listeningCues(brief, { openCommitments: [] })
    expect(cues).toEqual([
      { text: 'Whether the compliance deadline has moved.', note: 'Unresolved in your record' },
    ])
  })

  it('attributes a commitment to whoever owes it', () => {
    const cues = listeningCues(emptyBrief(), {
      openCommitments: [
        { description: 'Send the utilisation model', owner: 'user' },
        { description: 'Confirm the headcount', owner: 'person' },
        { description: 'Agree the sequencing', owner: 'shared' },
      ],
    })
    expect(cues.map((c) => c.note)).toEqual([
      'Still open — you owe this',
      'Still open — they owe this',
      'Still open between you',
    ])
    expect(cues[0]!.text).toBe('Send the utilisation model')
  })

  it('names people with no record, and says so without claiming anything about them', () => {
    const brief = normalizeBrief({
      participants: [
        { personId: 'p1', name: 'Maya Chen', publicOnly: false },
        { personId: 'p2', name: 'Priya Shah', publicOnly: true },
        { personId: 'p3', name: 'Lucas Martin', publicOnly: true },
      ],
    })
    const cues = listeningCues(brief, { openCommitments: [] })
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('How Priya Shah and Lucas Martin work — nothing is recorded yet.')
    expect(cues[0]!.note).toBe('Nothing to check this against')
  })

  it('never claims what anyone feels, wants, thinks or will do', () => {
    // The guardrail, asserted rather than assumed. Every cue is either a string
    // the record already held or a statement about an absence in it.
    const brief = normalizeBrief({
      roomDynamics: { unresolvedIssues: ['Who signs off the budget.'] },
      participants: [{ personId: 'p1', name: 'Priya Shah', publicOnly: true }],
    })
    const cues = listeningCues(brief, {
      openCommitments: [{ description: 'Send the model', owner: 'user' }],
    })

    const forbidden = /\b(feels?|wants?|thinks?|believes?|intends?|will (say|react|push|want))\b/i
    for (const cue of cues) {
      expect(cue.text).not.toMatch(forbidden)
      expect(cue.note).not.toMatch(forbidden)
    }
  })

  it('caps the list so the section stays readable in a corridor', () => {
    const brief = normalizeBrief({
      roomDynamics: { unresolvedIssues: ['One.', 'Two.', 'Three.'] },
    })
    const cues = listeningCues(brief, {
      openCommitments: [
        { description: 'A', owner: 'user' },
        { description: 'B', owner: 'user' },
        { description: 'C', owner: 'user' },
      ],
    })
    expect(cues).toHaveLength(4)
  })
})

describe('formatNames', () => {
  it('reads as a sentence at every length', () => {
    expect(formatNames([])).toBe('')
    expect(formatNames(['Maya'])).toBe('Maya')
    expect(formatNames(['Maya', 'Daniel'])).toBe('Maya and Daniel')
    expect(formatNames(['Maya', 'Daniel', 'Priya'])).toBe('Maya, Daniel and Priya')
  })
})

// -------------------------------------------------------------------------

const NOW = new Date('2026-08-28T09:00:00.000Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

describe('startProximity', () => {
  it('buckets by how close the meeting is', () => {
    expect(startProximity(at(7), NOW)).toBe('imminent')
    expect(startProximity(at(15), NOW)).toBe('imminent')
    expect(startProximity(at(16), NOW)).toBe('soon')
    expect(startProximity(at(60), NOW)).toBe('soon')
    expect(startProximity(at(61), NOW)).toBe('today')
    expect(startProximity(at(60 * 24), NOW)).toBe('today')
    expect(startProximity(at(60 * 25), NOW)).toBe('ahead')
    expect(startProximity(at(-1), NOW)).toBe('past')
  })

  it('is honest about a meeting with no time on it', () => {
    expect(startProximity(null, NOW)).toBe('unscheduled')
    expect(startProximity(undefined, NOW)).toBe('unscheduled')
    expect(startProximity('not a date', NOW)).toBe('unscheduled')
  })

  it('emits only bucket names, never a duration', () => {
    // The privacy contract: a minutes-to-start value alongside an event
    // timestamp reconstructs when a named user was in a specific meeting.
    const buckets = [at(-5), at(3), at(30), at(300), at(60 * 48), null].map((value) =>
      startProximity(value, NOW),
    )
    for (const bucket of buckets) {
      expect(bucket).toMatch(/^(unscheduled|past|imminent|soon|today|ahead)$/)
    }
  })
})

describe('countdownLabel', () => {
  it('counts down in the units a person would say', () => {
    expect(countdownLabel(at(7), NOW)).toBe('in 7 minutes')
    expect(countdownLabel(at(1), NOW)).toBe('in 1 minute')
    expect(countdownLabel(at(59), NOW)).toBe('in 59 minutes')
    expect(countdownLabel(at(90), NOW)).toBe('in 2 hours')
    expect(countdownLabel(at(60), NOW)).toBe('in 1 hour')
  })

  it('says a meeting is starting rather than counting to zero', () => {
    expect(countdownLabel(at(0), NOW)).toBe('starting now')
    expect(countdownLabel(at(0.4), NOW)).toBe('starting now')
  })

  it('switches to the past tense once it has begun', () => {
    expect(countdownLabel(at(-5), NOW)).toBe('started 5 minutes ago')
    expect(countdownLabel(at(-1), NOW)).toBe('started 1 minute ago')
    expect(countdownLabel(at(-120), NOW)).toBe('started 2 hours ago')
  })

  it('returns null rather than a placeholder when there is no time', () => {
    expect(countdownLabel(null, NOW)).toBeNull()
    expect(countdownLabel('nonsense', NOW)).toBeNull()
  })
})

describe('minutesUntil', () => {
  it('is negative once the meeting has started', () => {
    expect(minutesUntil(at(7), NOW)).toBe(7)
    expect(minutesUntil(at(-3), NOW)).toBe(-3)
    expect(minutesUntil(null, NOW)).toBeNull()
  })
})
