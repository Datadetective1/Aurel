import { describe, expect, it } from 'vitest'
import { formatDate, isFuture, relativeDay } from './format'
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

describe('formatDate is the same on the server and in the browser', () => {
  /**
   * React error #418 — a hydration text mismatch — was firing on every person
   * page in production. `toLocaleDateString(undefined, ...)` means "whatever
   * this runtime is": en-US/UTC on the server, the browser's own settings on
   * the client. Client components render on both sides, so the two disagreed
   * and React threw away the server HTML and re-rendered.
   */

  it('does not shift the day with the ambient time zone', () => {
    // 23:30 UTC is already the next day east of London and still the previous
    // one in California. Pinned to UTC it is one date everywhere.
    expect(formatDate('2026-08-25T23:30:00Z')).toBe('25 Aug 2026')
    expect(formatDate('2026-08-25T00:30:00Z')).toBe('25 Aug 2026')
  })

  it('is stable regardless of the runtime locale', () => {
    // Same instant, formatted twice — if the locale were ambient this would be
    // the assertion that broke on a machine set to anything but en-GB.
    expect(formatDate('2003-05-13T12:00:00Z')).toBe('13 May 2003')
  })

  it('still renders an em dash for a missing date', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})
