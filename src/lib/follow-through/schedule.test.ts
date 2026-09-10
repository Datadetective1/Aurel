import { describe, expect, it } from 'vitest'
import { clampHour, hourLabel, localClock, modeFor, shouldSendNow } from './schedule'

/**
 * The clock decisions behind the daily email. A user in Tokyo and a user in
 * Chicago are served their own days by the same run; a missed hour is caught
 * up, never doubled; and nothing goes to someone who turned it off.
 */

describe('localClock', () => {
  it('reckons the day and hour where the user is', () => {
    // 13:00 UTC on the 10th: 8am Chicago (CDT), 22:00 Tokyo, still the 10th in both.
    const now = new Date('2026-09-10T13:00:00Z')
    expect(localClock(now, 'America/Chicago')).toMatchObject({ date: '2026-09-10', hour: 8, weekday: 4 })
    expect(localClock(now, 'Asia/Tokyo')).toMatchObject({ date: '2026-09-10', hour: 22 })
    // 23:30 UTC is already the 11th in Tokyo.
    expect(localClock(new Date('2026-09-10T23:30:00Z'), 'Asia/Tokyo').date).toBe('2026-09-11')
  })

  it('falls back to UTC for a missing or nonsense zone rather than throwing', () => {
    const now = new Date('2026-09-10T13:00:00Z')
    expect(localClock(now, null).timeZone).toBe('UTC')
    expect(localClock(now, 'Mars/Olympus').hour).toBe(13)
  })
})

describe('shouldSendNow', () => {
  const clock = localClock(new Date('2026-09-10T13:00:00Z'), 'America/Chicago') // 8am
  const base = {
    mode: 'hourly' as const,
    clock,
    preferredHour: 8,
    emailNotifications: true,
    followThroughEmail: true,
    onboarded: true,
    hasEmail: true,
    alreadySentToday: false,
  }

  it('sends at the preferred hour', () => {
    expect(shouldSendNow(base)).toEqual({ send: true, reason: 'send' })
  })

  it('waits before the preferred hour, and catches up after it', () => {
    expect(shouldSendNow({ ...base, preferredHour: 9 }).reason).toBe('before_preferred_hour')
    expect(shouldSendNow({ ...base, preferredHour: 6 }).send).toBe(true)
  })

  it('never sends twice in one local day', () => {
    expect(shouldSendNow({ ...base, alreadySentToday: true }).reason).toBe('already_sent_today')
  })

  it('respects both switches, onboarding, and a missing address', () => {
    expect(shouldSendNow({ ...base, emailNotifications: false }).reason).toBe('opted_out')
    expect(shouldSendNow({ ...base, followThroughEmail: false }).reason).toBe('opted_out')
    expect(shouldSendNow({ ...base, onboarded: false }).reason).toBe('not_onboarded')
    expect(shouldSendNow({ ...base, hasEmail: false }).reason).toBe('no_email')
  })

  it('ignores the preferred hour on a once-a-day schedule', () => {
    expect(shouldSendNow({ ...base, mode: 'daily', preferredHour: 20 }).send).toBe(true)
  })
})

describe('modeFor and labels', () => {
  it('reads the mode from the query, then from the cron schedule header', () => {
    expect(modeFor({ query: 'hourly', scheduleHeader: null })).toBe('hourly')
    expect(modeFor({ query: null, scheduleHeader: '0 * * * *' })).toBe('hourly')
    expect(modeFor({ query: null, scheduleHeader: '0 13 * * *' })).toBe('daily')
    expect(modeFor({ query: null, scheduleHeader: null })).toBe('daily')
  })

  it('clamps hours and labels them', () => {
    expect(clampHour(30)).toBe(23)
    expect(clampHour(null)).toBe(8)
    expect(hourLabel(0)).toBe('12:00 AM')
    expect(hourLabel(8)).toBe('8:00 AM')
    expect(hourLabel(17)).toBe('5:00 PM')
  })
})
