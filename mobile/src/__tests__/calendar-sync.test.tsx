import * as React from 'react'
import { Linking } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { CalendarConnection, CalendarConnectionView, CalendarSyncResponse } from '@atturel/web/lib/mobile/contracts'
import { ThemeProvider } from '../theme'

/**
 * FINDING 8.6 ON THE IPHONE ACCOUNT SCREEN
 * =============================================================================
 * Each connection reads as the website describes it: its state, when it last
 * synced (date and time, in the account's zone), and a flag when that was over
 * a day ago. Sync now runs only when pressed and shows what the server said. A
 * failed sync offers Try again; only a refused grant sends the person to the
 * website to reconnect. No tokens reach the app: these are the fields it gets.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: false },
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const mockPost = jest.fn()
jest.mock('~/lib/api', () => {
  class ApiError extends Error {
    failure: { kind: string; message?: string }
    constructor(mockFailure: { kind: string; message?: string }) {
      super(mockFailure.kind)
      this.failure = mockFailure
    }
  }
  return { ApiError, api: { post: (path: string, body: unknown) => mockPost(path, body) } }
})
const { ApiError } = jest.requireMock('~/lib/api') as { ApiError: new (failure: { kind: string; message?: string }) => Error }

const { CalendarConnections } = require('../components/calendar-connections') as typeof import('../components/calendar-connections')

const MANAGE = 'https://www.atturel.com/settings/capabilities'

const view = (over: Partial<CalendarConnectionView> = {}): CalendarConnectionView => ({
  label: 'Connected',
  tone: 'positive',
  detail: '',
  synced: 'Last synced Aug 27, 9:43 PM',
  stale: true,
  note: 'Not synced since Aug 27. Atturel syncs your calendar only when you press Sync now, so meetings added or changed since then are missing.',
  sync: 'Sync now',
  reconnect: false,
  ...over,
})

const connection = (over: Partial<CalendarConnection> = {}): CalendarConnection => ({
  provider: 'microsoft',
  status: 'connected',
  accountEmail: 'owner@example.com',
  lastSyncedAt: '2026-08-28T02:43:27Z',
  view: view(),
  ...over,
})

const onGone = jest.fn()
const show = (c: CalendarConnection) =>
  render(
    <ThemeProvider force="pearl">
      <CalendarConnections connections={[c]} manageUrl={MANAGE} onGone={onGone} />
    </ThemeProvider>,
  )

beforeEach(() => {
  mockPost.mockReset()
  onGone.mockReset()
})

describe('a connected calendar, two months since its last sync', () => {
  it('shows the date and time, the stale flag, and Sync now', async () => {
    await show(connection())
    expect(screen.getByText('Connected · Last synced Aug 27, 9:43 PM')).toBeTruthy()
    expect(screen.getByText(/Not synced since Aug 27\. Atturel syncs your calendar only when you press Sync now/)).toBeTruthy()
    expect(screen.getByLabelText('Sync now')).toBeTruthy()
    expect(screen.queryByLabelText('Reconnect at atturel.com')).toBeNull()
  })

  it('Sync now asks the server, then shows its answer and the new state', async () => {
    let answer: (r: CalendarSyncResponse) => void = () => {}
    mockPost.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    await show(connection())
    await fireEvent.press(screen.getByLabelText('Sync now'))
    expect(mockPost).toHaveBeenCalledWith('/api/mobile/calendar/microsoft/sync', {})
    // Busy while it runs, so a second tap cannot send a second request.
    expect(screen.getByLabelText('Sync now').props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    await fireEvent.press(screen.getByLabelText('Sync now'))
    expect(mockPost).toHaveBeenCalledTimes(1)

    answer({
      outcome: { ok: true, code: 'synced', message: '3 meetings up to date.' },
      connection: connection({ lastSyncedAt: '2026-10-25T15:00:00Z', view: view({ synced: 'Last synced Oct 25, 10:00 AM', stale: false, note: null }) }),
    })
    await waitFor(() => expect(screen.getByText('3 meetings up to date.')).toBeTruthy())
    expect(screen.getByText('Connected · Last synced Oct 25, 10:00 AM')).toBeTruthy()
    expect(screen.queryByText(/Not synced since/)).toBeNull()
  })

  it('a failure inside the minute is said as a failure', async () => {
    mockPost.mockResolvedValue({
      outcome: { ok: false, code: 'recently_failed', message: 'The last attempt, moments ago, did not complete. Try again in a minute.' },
      connection: connection(),
    })
    await show(connection())
    await fireEvent.press(screen.getByLabelText('Sync now'))
    await waitFor(() => expect(screen.getByRole('alert').props.children).toBe('The last attempt, moments ago, did not complete. Try again in a minute.'))
  })

  it('offline: says nothing was synced', async () => {
    mockPost.mockRejectedValue(new ApiError({ kind: 'offline' }))
    await show(connection())
    await fireEvent.press(screen.getByLabelText('Sync now'))
    await waitFor(() => expect(screen.getByText('You are offline. Nothing was synced.')).toBeTruthy())
  })

  it("the plan's answer is shown as the plan's", async () => {
    mockPost.mockRejectedValue(new ApiError({ kind: 'plan_required', message: 'Calendar sync is part of Pro.' }))
    await show(connection())
    await fireEvent.press(screen.getByLabelText('Sync now'))
    await waitFor(() => expect(screen.getByText('Calendar sync is part of Pro.')).toBeTruthy())
  })

  it('a connection removed on the website reloads the screen', async () => {
    mockPost.mockRejectedValue(new ApiError({ kind: 'not_found' }))
    await show(connection())
    await fireEvent.press(screen.getByLabelText('Sync now'))
    await waitFor(() => expect(onGone).toHaveBeenCalled())
  })
})

describe('a calendar that needs something', () => {
  it('a failed sync offers Try again, and no reconnect', async () => {
    await show(connection({ status: 'error', view: view({ label: 'Sync failed', tone: 'caution', detail: 'The last sync did not complete because the calendar could not be reached. Try again shortly. There is no need to reconnect.', sync: 'Try again', note: 'Not synced since Aug 27, so meetings added or changed since then are missing.' }) }))
    expect(screen.getByText('Sync failed · Last synced Aug 27, 9:43 PM')).toBeTruthy()
    expect(screen.getByLabelText('Try again')).toBeTruthy()
    expect(screen.queryByLabelText('Reconnect at atturel.com')).toBeNull()
  })

  it('a refused grant links to the website to reconnect, and offers no sync', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await show(connection({ status: 'expired', view: view({ label: 'Reconnect needed', tone: 'caution', detail: 'Your calendar no longer accepts this connection. Reconnect to keep meetings up to date.', sync: null, reconnect: true, note: null }) }))
    expect(screen.getByText('Reconnect needed · Last synced Aug 27, 9:43 PM')).toBeTruthy()
    expect(screen.queryByLabelText('Sync now')).toBeNull()
    expect(screen.queryByLabelText('Try again')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Reconnect at atturel.com'))
    expect(open).toHaveBeenCalledWith(MANAGE)
    open.mockRestore()
  })

  it('a plan without calendar sync offers no button', async () => {
    await show(connection({ view: view({ label: 'Pro', tone: 'neutral', sync: null, note: null }) }))
    expect(screen.queryByLabelText('Sync now')).toBeNull()
  })
})

describe('an older server, which sends no description', () => {
  it('reads "connected" as Connected, not as a raw lowercase status', async () => {
    await show(connection({ view: undefined }))
    expect(screen.getByText(/^Connected · Last synced /)).toBeTruthy()
    expect(screen.queryByText(/^connected/)).toBeNull()
    expect(screen.queryByLabelText('Sync now')).toBeNull()
  })

  it('never synced says so', async () => {
    await show(connection({ view: undefined, lastSyncedAt: null }))
    expect(screen.getByText('Connected · Never synced')).toBeTruthy()
  })
})
