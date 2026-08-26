import { describe, expect, it } from 'vitest'
import { isFuture, relativeDay } from './format'
describe('a conversation is never described as having happened in the future', () => {
  /**
   * Found on production: a person header read "Last spoke tomorrow".
   *
   * A debrief took its interaction date straight from the meeting's
   * scheduled_at, so debriefing a meeting scheduled for later dated the
   * conversation in the future — and the header then made a past-tense claim
   * about something that had not happened. In a product whose first principle
   * is that nothing is presented as fact unless it is one, that is not a
   * cosmetic bug.
   *
   * relativeDay itself was always right. These pin the behaviour the callers
   * depend on.
   */

  it('still distinguishes a future day from a past one', () => {
    const day = 86_400_000
    expect(relativeDay(new Date(Date.now() + day))).toBe('Tomorrow')
    expect(relativeDay(new Date(Date.now() - day))).toBe('Yesterday')
    expect(relativeDay(new Date())).toBe('Today')
  })

  it('detects a future timestamp, which is what the header branches on', () => {
    // Rows written before both write paths refused a future date still carry
    // one, so anything phrased in the past tense has to check.
    expect(isFuture(new Date(Date.now() + 86_400_000))).toBe(true)
    expect(isFuture(new Date(Date.now() - 86_400_000))).toBe(false)
  })

  it('treats a missing timestamp as not-future rather than throwing', () => {
    // The caller reaches this only when last_interaction_at is set, but a
    // predicate that throws on null is a trap for the next caller.
    expect(isFuture(null)).toBe(false)
    expect(isFuture(undefined)).toBe(false)
    expect(isFuture('not a date')).toBe(false)
  })
})
