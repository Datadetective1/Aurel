import { describe, expect, it } from 'vitest'
import {
  bareAction,
  headline,
  isActiveOn,
  phraseFor,
  selectFollowThrough,
  subjectFor,
  timingFor,
  type DigestLoop,
} from './select'

/**
 * What goes in the follow-through email, and how it is said.
 *
 * The exclusions are the point: a cancelled loop, a done loop, a proposal the
 * user never confirmed, or a deferral whose date has not arrived must never be
 * mailed. And the wording must never tell the reader to do what somebody
 * else promised.
 */

const TODAY = '2026-09-10' // a Thursday
const MONDAY = '2026-09-14'
const formatDay = (d: string) => d

function loop(over: Partial<DigestLoop> = {}): DigestLoop {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    description: 'send the proposal',
    kind: 'commitment',
    owner: 'user',
    status: 'open',
    reviewStatus: 'confirmed',
    dueOn: TODAY,
    deferredUntil: null,
    createdAt: '2026-09-01T10:00:00Z',
    personId: 'p1',
    personName: 'Jason Ortiz',
    interactionId: 'c1',
    interactionTitle: 'Budget sync',
    interactionDay: '2026-08-24',
    ...over,
  }
}

const select = (loops: DigestLoop[], today = TODAY, weekday = 4) =>
  selectFollowThrough(loops, { today, weekday, formatDay })

describe('exclusions', () => {
  it('never mails done, cancelled, dropped or unconfirmed loops', () => {
    const out = select([
      loop({ status: 'done' }),
      loop({ status: 'cancelled' }),
      loop({ status: 'dropped' }),
      loop({ reviewStatus: 'proposed' }),
      loop({ reviewStatus: 'rejected' }),
    ])
    expect(out.items).toHaveLength(0)
  })

  it('keeps a deferred loop out until its date arrives', () => {
    const later = loop({ status: 'later', deferredUntil: '2026-09-12' })
    expect(isActiveOn(later, TODAY)).toBe(false)
    expect(isActiveOn(later, '2026-09-12')).toBe(true)
  })

  it('does not mail a loop due later this week', () => {
    expect(select([loop({ dueOn: '2026-09-13' })]).items).toHaveLength(0)
  })
})

describe('what qualifies', () => {
  it('includes due today and overdue, overdue first', () => {
    const out = select([
      loop({ id: 'today', dueOn: TODAY }),
      loop({ id: 'over', dueOn: '2026-09-08' }),
    ])
    expect(out.items.map((i) => i.loop.id)).toEqual(['over', 'today'])
    expect(out.items[0]!.timing).toEqual({ label: 'Overdue by 2 days', tone: 'overdue' })
    expect(out.items[1]!.timing).toEqual({ label: 'Due today', tone: 'today' })
  })

  it("includes tomorrow only for the user's own promise", () => {
    const out = select([
      loop({ id: 'mine', dueOn: '2026-09-11', owner: 'user' }),
      loop({ id: 'theirs', dueOn: '2026-09-11', owner: 'person' }),
    ])
    expect(out.items.map((i) => i.loop.id)).toEqual(['mine'])
    expect(out.items[0]!.timing.label).toBe('Due tomorrow')
  })

  it('raises undated loops only on Monday, and only once they are a few days old', () => {
    const undated = loop({ id: 'u', dueOn: null, owner: 'person', createdAt: '2026-09-01T00:00:00Z' })
    const fresh = loop({ id: 'f', dueOn: null, createdAt: '2026-09-13T00:00:00Z' })
    expect(select([undated, fresh], TODAY, 4).items).toHaveLength(0)
    const monday = select([undated, fresh], MONDAY, 1)
    expect(monday.items.map((i) => i.loop.id)).toEqual(['u'])
    expect(monday.items[0]!.timing).toEqual({ label: 'Waiting on them', tone: 'waiting' })
  })

  it('caps the list and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => loop({ id: `l${i}` }))
    const out = select(many)
    expect(out.items).toHaveLength(8)
    expect(out.more).toBe(3)
    expect(headline(out)).toBe('11 things worth following up on today.')
  })

  it('puts your own promises before theirs inside a bucket', () => {
    const out = select([
      loop({ id: 'theirs', owner: 'person' }),
      loop({ id: 'mine', owner: 'user' }),
    ])
    expect(out.items.map((i) => i.loop.id)).toEqual(['mine', 'theirs'])
    expect(out.yours).toBe(1)
  })
})

describe('wording distinguishes who owes what', () => {
  it('strips the extracted "I\'ll" so it reads after "you\'d"', () => {
    expect(bareAction("I'll send the proposal.")).toBe('send the proposal')
    expect(bareAction('I will circulate the notes')).toBe('circulate the notes')
    expect(bareAction('Send the proposal')).toBe('send the proposal')
  })

  it("says 'You said you'd' for the user's promise", () => {
    expect(phraseFor(loop({ description: "I'll send the proposal" }))).toBe(
      "You said you'd send the proposal.",
    )
  })

  it("says '<Name> said they'd' for another person's promise, never an instruction", () => {
    const phrase = phraseFor(loop({ owner: 'person', description: "I'll confirm the pricing assumptions" }))
    expect(phrase).toBe("Jason said they'd confirm the pricing assumptions.")
    expect(phrase).not.toMatch(/^You/)
  })

  it('says Still unanswered for a question', () => {
    expect(phraseFor(loop({ kind: 'question', description: 'who owns the migration budget' }))).toBe(
      'Still unanswered: Who owns the migration budget?',
    )
  })

  it('says Between you for a shared loop', () => {
    expect(phraseFor(loop({ owner: 'shared', description: 'agree the launch date' }))).toBe(
      'Between you and Jason: agree the launch date.',
    )
  })

  it('names the source conversation with the right verb', () => {
    const out = select([loop({ owner: 'person' }), loop({ kind: 'question', owner: 'shared' })])
    expect(out.items[0]!.source).toBe('Said in Budget sync, 2026-08-24')
    expect(out.items[1]!.source).toBe('Came up in Budget sync, 2026-08-24')
  })

  it('leads the subject with what is past due', () => {
    expect(subjectFor(select([loop({ dueOn: '2026-09-01' }), loop()]))).toBe('1 promise past due')
    expect(subjectFor(select([loop(), loop()]))).toBe('2 things due today')
    expect(timingFor(loop({ dueOn: null, owner: 'user' }), TODAY).label).toBe('No date')
  })
})
