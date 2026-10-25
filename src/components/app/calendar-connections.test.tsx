// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brand } from '@/lib/brand'
import { calendarFreshness, type CalendarState } from '@/lib/calendar/freshness'
import type { CalendarConnection } from './calendar-connections'

/**
 * FINDING 8.6 IN WEBSITE SETTINGS
 * =============================================================================
 * Each saved connection says when it last synced, date included, and flags a
 * sync more than a day old. A failed sync offers Try again, not Reconnect;
 * only a refused grant asks for a reconnect. Disconnect is there in every
 * saved state.
 * =============================================================================
 */

const syncCalendarNow = vi.fn()
const disconnectCalendar = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(app)/calendar-actions', () => ({
  syncCalendarNow: (...args: unknown[]) => syncCalendarNow(...args),
  disconnectCalendar: (...args: unknown[]) => disconnectCalendar(...args),
}))

const { CalendarConnections } = await import('./calendar-connections')

afterEach(() => {
  cleanup()
  syncCalendarNow.mockReset()
  disconnectCalendar.mockReset()
})

const NOW = new Date('2026-10-25T15:00:00Z')

function show(
  status: CalendarState,
  lastSyncedAt: string | null = '2026-08-28T02:43:27Z',
  saved = true,
) {
  const connection: CalendarConnection = {
    provider: 'microsoft',
    label: 'Microsoft 365',
    status,
    saved,
    accountEmail: saved ? 'owner@example.com' : null,
    freshness: saved
      ? calendarFreshness(
          { state: status, lastSyncedAt },
          { timeZone: 'America/Chicago', now: NOW },
        )
      : null,
    eventCount: 0,
  }
  render(<CalendarConnections connections={[connection]} />)
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name })
const link = (name: string) => screen.queryByRole('link', { name })

describe('a connected calendar', () => {
  it('two months since the last sync: the date, and a flag that says sync is manual', () => {
    show('connected')
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText(/0 upcoming meetings · Last synced Aug 27, 9:43 PM/)).toBeTruthy()
    expect(
      screen.getByText(
        `Not synced since Aug 27. ${brand.name} syncs your calendar only when you press Sync now, so meetings added or changed since then are missing.`,
      ),
    ).toBeTruthy()
    expect(button(/Sync now/)).toBeTruthy()
    expect(button(/Disconnect/)).toBeTruthy()
    expect(link('Reconnect')).toBeNull()
  })

  it('synced within the day: the date and time, and no flag', () => {
    show('connected', '2026-10-25T14:12:00Z')
    expect(screen.getByText(/Last synced Oct 25, 9:12 AM/)).toBeTruthy()
    expect(screen.queryByText(/Not synced since/)).toBeNull()
  })

  it('never synced: says so, and how', () => {
    show('connected', null)
    expect(screen.getByText(/Never synced/)).toBeTruthy()
    expect(
      screen.getByText(
        `Not synced yet. ${brand.name} syncs your calendar only when you press Sync now.`,
      ),
    ).toBeTruthy()
  })

  it('Sync now shows what the server said, including a failure inside the minute', async () => {
    syncCalendarNow.mockResolvedValue({
      code: 'recently_failed',
      error: 'The last attempt, moments ago, did not complete. Try again in a minute.',
    })
    show('connected')
    fireEvent.click(button(/Sync now/)!)
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'The last attempt, moments ago, did not complete. Try again in a minute.',
      ),
    )
    expect(syncCalendarNow).toHaveBeenCalledWith('microsoft')
  })
})

describe('a calendar that needs something', () => {
  it('a failed sync offers Try again and Disconnect, and no reconnect', () => {
    show('error')
    expect(screen.getByText('Sync failed')).toBeTruthy()
    expect(screen.getByText(/There is no need to reconnect/)).toBeTruthy()
    expect(screen.getByText('Last synced Aug 27, 9:43 PM')).toBeTruthy()
    expect(button(/Try again/)).toBeTruthy()
    expect(button(/Disconnect/)).toBeTruthy()
    expect(link('Reconnect')).toBeNull()
  })

  it.each(['expired', 'revoked'] as const)(
    'a %s grant offers Reconnect and Disconnect, and no sync',
    (status) => {
      show(status)
      expect(screen.getByText('Reconnect needed')).toBeTruthy()
      expect(link('Reconnect')!.getAttribute('href')).toBe('/api/calendar/microsoft/connect')
      expect(button(/Disconnect/)).toBeTruthy()
      expect(button(/Sync now|Try again/)).toBeNull()
      expect(screen.getByText('Last synced Aug 27, 9:43 PM')).toBeTruthy()
    },
  )

  it('waiting on an administrator still offers Disconnect', () => {
    show('admin_consent_required')
    expect(screen.getByText('Needs approval')).toBeTruthy()
    expect(button(/Disconnect/)).toBeTruthy()
  })

  it('a plan that no longer includes calendars still offers Disconnect', () => {
    show('plan_required')
    expect(link('See Pro')).toBeTruthy()
    expect(button(/Disconnect/)).toBeTruthy()
    expect(button(/Sync now|Try again/)).toBeNull()
  })

  it('Disconnect from a failed state calls the action', async () => {
    disconnectCalendar.mockResolvedValue({ ok: true, message: 'Calendar disconnected.' })
    show('expired')
    fireEvent.click(button(/Disconnect/)!)
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Calendar disconnected.'),
    )
    expect(disconnectCalendar).toHaveBeenCalledWith('microsoft')
  })
})

describe('nothing saved', () => {
  it('offers Connect, and nothing to sync or disconnect', () => {
    show('not_connected', null, false)
    expect(link('Connect')).toBeTruthy()
    expect(button(/Sync now|Try again|Disconnect/)).toBeNull()
    expect(screen.queryByText(/synced/i)).toBeNull()
  })
})
