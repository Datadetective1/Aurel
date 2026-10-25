import { describe, expect, it } from 'vitest'
import {
  CALENDAR_STATE,
  STALE_AFTER_MS,
  calendarActions,
  calendarCardState,
  calendarFreshness,
  calendarState,
  formatSyncTime,
  type CalendarState,
} from './freshness'

/**
 * FINDING 8.6: HOW CURRENT A CALENDAR IS, SAID THE SAME WAY EVERYWHERE
 * =============================================================================
 * The owner's Microsoft connection last synced at 02:43 UTC on 28 Aug 2026 and
 * read as "Connected · synced 9:43 PM" two months later: a time, no date, and
 * nothing to say it was stale. These pin the date, the account's time zone,
 * the one-day flag, and which connection offers what.
 * =============================================================================
 */

const OWNER_LAST_SYNC = '2026-08-28T02:43:27Z'
const TODAY = new Date('2026-10-25T15:00:00Z')

describe('the last sync, with its date, in the account time zone', () => {
  it.each([
    ['America/Chicago', 'Aug 27, 9:43 PM'],
    ['Europe/London', 'Aug 28, 3:43 AM'],
    ['Asia/Kolkata', 'Aug 28, 8:13 AM'],
    ['UTC', 'Aug 28, 2:43 AM'],
  ])('in %s it reads "%s"', (timeZone, expected) => {
    expect(formatSyncTime(OWNER_LAST_SYNC, timeZone, TODAY)).toBe(expected)
  })

  it('gives the year when it is not this year, in the account zone', () => {
    // 23:30 UTC on 31 Dec is still 2026 in Chicago, already 2027 by now.
    expect(
      formatSyncTime('2026-12-31T23:30:00Z', 'America/Chicago', new Date('2027-01-02T12:00:00Z')),
    ).toBe('Dec 31, 2026, 5:30 PM')
  })

  it('falls back to UTC for a zone the runtime does not know, rather than failing', () => {
    expect(formatSyncTime(OWNER_LAST_SYNC, 'Mars/Olympus_Mons', TODAY)).toBe('Aug 28, 2:43 AM')
  })
})

describe('fresh, stale and never synced', () => {
  const at = (iso: string | null, now = TODAY, state: CalendarState = 'connected') =>
    calendarFreshness({ state, lastSyncedAt: iso }, { timeZone: 'America/Chicago', now })

  it("the owner's connection is stale, says since when, and that sync is manual", () => {
    const f = at(OWNER_LAST_SYNC)
    expect(f).toMatchObject({ kind: 'stale', stale: true, label: 'Last synced Aug 27, 9:43 PM' })
    expect(f.note).toBe(
      'Not synced since Aug 27. Atturel syncs your calendar only when you press Sync now, so meetings added or changed since then are missing.',
    )
  })

  it('a sync within the last day is fresh, with no flag', () => {
    const f = at('2026-10-25T14:12:00Z')
    expect(f).toEqual({
      kind: 'fresh',
      label: 'Last synced Oct 25, 9:12 AM',
      stale: false,
      note: null,
    })
  })

  it('turns stale only past a full day', () => {
    const synced = new Date(TODAY.getTime() - STALE_AFTER_MS).toISOString()
    expect(at(synced).stale).toBe(false)
    expect(at(synced, new Date(TODAY.getTime() + 1)).stale).toBe(true)
  })

  it('a connection that never synced says so, and how to sync it', () => {
    expect(at(null)).toEqual({
      kind: 'never',
      label: 'Never synced',
      stale: true,
      note: 'Not synced yet. Atturel syncs your calendar only when you press Sync now.',
    })
  })

  it('an unreadable timestamp reads as never synced, not as a date', () => {
    expect(at('not a date').kind).toBe('never')
  })

  it('after a failed sync, the note leaves the remedy to Try again', () => {
    expect(at(OWNER_LAST_SYNC, TODAY, 'error').note).toBe(
      'Not synced since Aug 27, so meetings added or changed since then are missing.',
    )
  })

  it.each(['expired', 'revoked', 'admin_consent_required', 'plan_required'] as const)(
    'a %s connection keeps its date but adds no "press Sync now" note',
    (state) => {
      const f = at(OWNER_LAST_SYNC, TODAY, state)
      expect(f.label).toBe('Last synced Aug 27, 9:43 PM')
      expect(f.stale).toBe(true)
      expect(f.note).toBeNull()
    },
  )
})

describe('the state a connection is shown in', () => {
  const state = (stored: string | null, configured = true, planAllows = true) =>
    calendarState({ stored, configured, planAllows })

  it('shows each stored status as itself', () => {
    for (const s of ['connected', 'expired', 'revoked', 'error', 'admin_consent_required']) {
      expect(state(s)).toBe(s)
    }
  })

  it('a deployment without the provider, then the plan, come first', () => {
    expect(state('connected', false)).toBe('unavailable')
    expect(state('connected', true, false)).toBe('plan_required')
  })

  it('nothing saved is not connected; an unknown status is never "connected"', () => {
    expect(state(null)).toBe('not_connected')
    expect(state('active')).toBe('error')
  })

  it('a failed sync is not called expired, and does not ask for a reconnect', () => {
    expect(CALENDAR_STATE.error.label).toBe('Sync failed')
    expect(CALENDAR_STATE.error.detail).toContain('There is no need to reconnect')
    expect(CALENDAR_STATE.expired.label).toBe('Reconnect needed')
    expect(CALENDAR_STATE.revoked.label).toBe('Reconnect needed')
  })
})

describe('what each saved connection offers', () => {
  it.each([
    ['connected', 'Sync now', false],
    ['error', 'Try again', false],
    ['expired', null, true],
    ['revoked', null, true],
    ['admin_consent_required', null, true],
    ['plan_required', null, false],
    ['unavailable', null, false],
  ] as const)('%s: sync %s, reconnect %s, and always disconnect', (state, sync, reconnect) => {
    expect(calendarActions(state, true)).toEqual({ sync, reconnect, disconnect: true })
  })

  it('nothing saved offers nothing to sync or disconnect', () => {
    expect(calendarActions('not_connected', false)).toEqual({
      sync: null,
      reconnect: false,
      disconnect: false,
    })
  })
})

describe('the Calendar card in Settings', () => {
  const card = (connections: { saved: boolean; status: CalendarState }[], configured = true) =>
    calendarCardState({ configured, connections })

  it('a working connection is connected, even with another that is not', () => {
    expect(
      card([
        { saved: true, status: 'connected' },
        { saved: true, status: 'expired' },
      ]),
    ).toBe('connected')
  })

  it.each(['error', 'expired', 'revoked', 'admin_consent_required', 'plan_required'] as const)(
    'a saved %s connection needs attention, so it stays on screen to retry or disconnect',
    (status) => {
      expect(card([{ saved: true, status }])).toBe('attention')
    },
  )

  it('nothing saved is a deployment that is set up, or not', () => {
    expect(card([{ saved: false, status: 'not_connected' }])).toBe('setup')
    expect(card([], false)).toBe('unavailable')
  })
})
