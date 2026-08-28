import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKeyIn,
  daysBetween,
  endOfDayUtc,
  formatDateIn,
  formatDayLabelIn,
  formatTimeIn,
  hourIn,
  isOverdueIn,
  relativeDayIn,
  safeZone,
  startOfDayUtc,
  todayIn,
} from './tz'

/**
 * The reported defect, and its neighbours.
 *
 * At 21:22 in Chicago on 27 August 2026, UTC is already the 28th. Every
 * assertion below is a place the product previously answered with the server's
 * calendar instead of the user's.
 */

/** 2026-08-27 21:22 America/Chicago (CDT, UTC-5) === 2026-08-28 02:22Z */
const THE_BUG = new Date('2026-08-28T02:22:00Z')

describe('the reported defect: Chicago evening while UTC has rolled over', () => {
  it('reports the local day, not the UTC day', () => {
    expect(todayIn('America/Chicago', THE_BUG)).toBe('2026-08-27')
    // What the old code did, kept as a witness that the two genuinely differ.
    expect(THE_BUG.toISOString().slice(0, 10)).toBe('2026-08-28')
  })

  it('renders the heading as Thursday the 27th', () => {
    expect(formatDayLabelIn(THE_BUG, 'America/Chicago')).toBe('Thursday, August 27')
  })

  it('still says Friday the 28th for someone actually in UTC', () => {
    expect(formatDayLabelIn(THE_BUG, 'UTC')).toBe('Friday, August 28')
    expect(todayIn('UTC', THE_BUG)).toBe('2026-08-28')
  })

  it('calls a commitment due on the 27th "Today", not "Yesterday"', () => {
    expect(relativeDayIn('2026-08-27', 'America/Chicago', THE_BUG)).toBe('Today')
    expect(relativeDayIn('2026-08-28', 'America/Chicago', THE_BUG)).toBe('Tomorrow')
    expect(relativeDayIn('2026-08-26', 'America/Chicago', THE_BUG)).toBe('Yesterday')
  })

  it('does not mark a commitment due today as overdue', () => {
    expect(isOverdueIn('2026-08-27', 'America/Chicago', THE_BUG)).toBe(false)
    expect(isOverdueIn('2026-08-26', 'America/Chicago', THE_BUG)).toBe(true)
    // The same row, for a user genuinely in UTC, IS overdue. Both are correct.
    expect(isOverdueIn('2026-08-27', 'UTC', THE_BUG)).toBe(true)
  })

  it('reports the local hour, so the greeting says evening', () => {
    expect(hourIn('America/Chicago', THE_BUG)).toBe(21)
    expect(hourIn('UTC', THE_BUG)).toBe(2)
  })

  it('bounds "today" between local midnights, not UTC midnight', () => {
    const start = startOfDayUtc('2026-08-27', 'America/Chicago')
    const end = endOfDayUtc('2026-08-27', 'America/Chicago')
    expect(start.toISOString()).toBe('2026-08-27T05:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-28T05:00:00.000Z')
    // A 3pm Chicago meeting falls inside the local day. Under the old UTC
    // midnight bound it was excluded from Today all evening.
    const meeting = new Date('2026-08-27T20:00:00Z')
    expect(meeting >= start && meeting < end).toBe(true)
    expect(meeting >= new Date('2026-08-28T00:00:00Z')).toBe(false)
  })
})

describe('other zones, same instant', () => {
  it('Los Angeles is still the 27th', () => {
    expect(todayIn('America/Los_Angeles', THE_BUG)).toBe('2026-08-27')
    expect(hourIn('America/Los_Angeles', THE_BUG)).toBe(19)
  })

  it('London has already turned over', () => {
    expect(todayIn('Europe/London', THE_BUG)).toBe('2026-08-28')
    expect(hourIn('Europe/London', THE_BUG)).toBe(3)
  })

  it('Tokyo is most of a day ahead', () => {
    expect(todayIn('Asia/Tokyo', THE_BUG)).toBe('2026-08-28')
    expect(hourIn('Asia/Tokyo', THE_BUG)).toBe(11)
  })

  it('Kolkata resolves a half-hour offset', () => {
    expect(todayIn('Asia/Kolkata', THE_BUG)).toBe('2026-08-28')
    expect(hourIn('Asia/Kolkata', THE_BUG)).toBe(7)
    expect(startOfDayUtc('2026-08-28', 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-27T18:30:00.000Z',
    )
  })

  it('Chatham resolves a 45-minute offset', () => {
    expect(startOfDayUtc('2026-08-28', 'Pacific/Chatham').toISOString()).toBe(
      '2026-08-27T11:15:00.000Z',
    )
  })
})

describe('Los Angeles either side of local midnight', () => {
  // 2026-08-28 06:59Z === 2026-08-27 23:59 PDT
  const justBefore = new Date('2026-08-28T06:59:00Z')
  // 2026-08-28 07:00Z === 2026-08-28 00:00 PDT
  const justAfter = new Date('2026-08-28T07:00:00Z')

  it('holds the old day until the very last minute', () => {
    expect(todayIn('America/Los_Angeles', justBefore)).toBe('2026-08-27')
    expect(hourIn('America/Los_Angeles', justBefore)).toBe(23)
  })

  it('turns over exactly at local midnight', () => {
    expect(todayIn('America/Los_Angeles', justAfter)).toBe('2026-08-28')
    expect(hourIn('America/Los_Angeles', justAfter)).toBe(0)
  })

  it('flips Today and Tomorrow across that one minute', () => {
    expect(relativeDayIn('2026-08-28', 'America/Los_Angeles', justBefore)).toBe('Tomorrow')
    expect(relativeDayIn('2026-08-28', 'America/Los_Angeles', justAfter)).toBe('Today')
  })
})

describe('daylight saving', () => {
  it('spring forward: the 23-hour day still starts and ends correctly', () => {
    // US DST begins 08 Mar 2026. 02:00 local never happens.
    const start = startOfDayUtc('2026-03-08', 'America/Chicago')
    const end = endOfDayUtc('2026-03-08', 'America/Chicago')
    expect(start.toISOString()).toBe('2026-03-08T06:00:00.000Z')
    expect(end.toISOString()).toBe('2026-03-09T05:00:00.000Z')
    expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000)
  })

  it('fall back: the 25-hour day still starts and ends correctly', () => {
    // US DST ends 01 Nov 2026. 01:00 local happens twice.
    const start = startOfDayUtc('2026-11-01', 'America/Chicago')
    const end = endOfDayUtc('2026-11-01', 'America/Chicago')
    expect(start.toISOString()).toBe('2026-11-01T05:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-02T06:00:00.000Z')
    expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000)
  })

  it('the ambiguous hour lands on the correct calendar day', () => {
    // 06:30Z on 01 Nov is 01:30 CDT, the first pass through the repeated hour.
    expect(todayIn('America/Chicago', new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01')
    // 07:30Z is 01:30 CST, the second pass. Same calendar day.
    expect(todayIn('America/Chicago', new Date('2026-11-01T07:30:00Z'))).toBe('2026-11-01')
  })

  it('adds a day across spring forward without overshooting', () => {
    // Adding 86,400,000ms to the 8th would land on the 9th at 01:00 local and
    // still read as the 9th -- but on a midnight-shifting zone it overshoots.
    // Calendar arithmetic cannot.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  })

  it('southern-hemisphere DST runs the other way', () => {
    // Sydney leaves DST on 05 Apr 2026: a 25-hour day.
    const start = startOfDayUtc('2026-04-05', 'Australia/Sydney')
    const end = endOfDayUtc('2026-04-05', 'Australia/Sydney')
    expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000)
  })

  it('a zone that shifts at midnight itself still yields a valid instant', () => {
    // Some zones move the clock at 00:00, so local midnight can be skipped
    // entirely. The result must still be the first instant of that day.
    const start = startOfDayUtc('2026-09-06', 'America/Santiago')
    expect(Number.isNaN(start.getTime())).toBe(false)
    expect(dayKeyIn(start, 'America/Santiago')).toBe('2026-09-06')
  })
})

describe('date-only values are calendar days, not instants', () => {
  it('does not shift a due date backwards in a zone behind UTC', () => {
    // new Date('2026-08-27') is UTC midnight, which is the 26th in Chicago.
    // Treating due dates as instants is what made "due today" render as
    // "Yesterday" for every user west of Greenwich.
    expect(dayKeyIn('2026-08-27', 'America/Chicago')).toBe('2026-08-27')
    expect(dayKeyIn('2026-08-27', 'Asia/Tokyo')).toBe('2026-08-27')
    expect(dayKeyIn('2026-08-27', 'Pacific/Honolulu')).toBe('2026-08-27')
  })

  it('formats a date-only value the same everywhere', () => {
    for (const zone of ['America/Chicago', 'Asia/Tokyo', 'Europe/London', 'Pacific/Auckland']) {
      expect(formatDateIn('2026-08-27', zone)).toBe('27 Aug 2026')
      expect(formatDayLabelIn('2026-08-27', zone)).toBe('Thursday, August 27')
    }
  })
})

describe('instants are placed in the reader’s zone', () => {
  it('formats a time in the account holder’s zone', () => {
    expect(formatTimeIn(THE_BUG, 'America/Chicago')).toBe('9:22 PM')
    expect(formatTimeIn(THE_BUG, 'Asia/Tokyo')).toBe('11:22 AM')
    expect(formatTimeIn(THE_BUG, 'UTC')).toBe('2:22 AM')
  })

  it('dates a record by the day the user experienced it', () => {
    expect(formatDateIn(THE_BUG, 'America/Chicago')).toBe('27 Aug 2026')
    expect(formatDateIn(THE_BUG, 'UTC')).toBe('28 Aug 2026')
  })
})

describe('robustness', () => {
  it('falls back to UTC for an unusable zone rather than throwing', () => {
    expect(safeZone('Mars/Olympus_Mons')).toBe('UTC')
    expect(safeZone('')).toBe('UTC')
    expect(safeZone(null)).toBe('UTC')
    expect(safeZone(undefined)).toBe('UTC')
    expect(() => todayIn('Not/AZone', THE_BUG)).not.toThrow()
    expect(todayIn('Not/AZone', THE_BUG)).toBe('2026-08-28')
  })

  it('renders a dash for missing or malformed input', () => {
    expect(relativeDayIn(null, 'America/Chicago', THE_BUG)).toBe('—')
    expect(relativeDayIn(undefined, 'America/Chicago', THE_BUG)).toBe('—')
    expect(relativeDayIn('not a date', 'America/Chicago', THE_BUG)).toBe('—')
    expect(formatTimeIn(null, 'America/Chicago')).toBe('—')
    expect(formatDateIn(null, 'America/Chicago')).toBe('—')
  })

  it('counts calendar days, including across a month and a year boundary', () => {
    expect(daysBetween('2026-08-27', '2026-08-28')).toBe(1)
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-08-28', '2026-08-27')).toBe(-1)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap year
  })

  it('a day key round-trips through its own local midnight', () => {
    for (const zone of [
      'America/Chicago',
      'America/Los_Angeles',
      'Europe/London',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Pacific/Auckland',
      'UTC',
    ]) {
      for (const key of ['2026-01-15', '2026-03-08', '2026-06-30', '2026-11-01', '2026-12-31']) {
        expect(dayKeyIn(startOfDayUtc(key, zone), zone)).toBe(key)
      }
    }
  })
})
