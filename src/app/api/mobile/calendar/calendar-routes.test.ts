import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../../../tests/stubs/fake-supabase'

/**
 * FINDING 8.6 ON THE IPHONE: SYNC NOW, AND THE ACCOUNT SCREEN'S CALENDAR
 * =============================================================================
 * The real route handlers and the real bearer-only front door, with the
 * session, the plan and the website's sync action stubbed. Sync runs only from
 * its POST; the account screen only reads. Either answer describes the
 * connection in the account's time zone, and neither ever carries a token --
 * even when the row the query returns has them.
 * =============================================================================
 */

const NOW = new Date('2026-10-25T15:00:00Z')
let bearer = true
let user: { id: string; email: string } | null = { id: 'u-1', email: 'owner@example.com' }
let onboarded = true
let calendarIntegration = true
let rows: Row[] = []

const syncCalendarNow = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  bearerToken: async () => (bearer ? 'a.b.c' : null),
  createClient: async () => fakeClient({ integration_accounts: rows }).client,
}))
vi.mock('@/lib/auth', () => ({
  getOptionalUser: async () => user,
  getProfile: async () =>
    user
      ? {
          id: user.id,
          full_name: 'Owner',
          preferred_name: null,
          timezone: 'America/Chicago',
          demo_seeded_at: null,
          onboarding_completed_at: onboarded ? '2026-08-01T00:00:00Z' : null,
        }
      : null,
}))
vi.mock('@/lib/billing/entitlements', () => ({
  getEntitlements: async () => ({
    plan: 'pro',
    tier: 'pro',
    provider: 'stripe',
    periodStart: '2026-10-01T00:00:00Z',
    quotas: { transcription_seconds: null },
    capabilities: { calendarIntegration },
  }),
  usageInPeriod: async () => 0,
}))
vi.mock('@/app/(app)/calendar-actions', () => ({
  syncCalendarNow: (...args: unknown[]) => syncCalendarNow(...args),
}))
vi.mock('@/lib/account/deletion.server', () => ({ deleteCurrentAccount: vi.fn() }))
vi.mock('@/lib/calendar/provider', async (original) => ({
  ...(await original<typeof import('@/lib/calendar/provider')>()),
  providerConfigured: () => true,
}))

const sync = await import('./[provider]/sync/route')
const account = await import('../account/route')

const press = (provider = 'microsoft') =>
  sync.POST(
    new Request(`https://app.example/api/mobile/calendar/${provider}/sync`, { method: 'POST' }),
    {
      params: Promise.resolve({ provider }),
    },
  )

/** A stored connection, tokens and all, as the database holds it. */
const stored = (over: Row = {}): Row => ({
  id: 'int-1',
  user_id: 'u-1',
  provider: 'microsoft',
  status: 'connected',
  external_account_email: 'owner@example.com',
  last_synced_at: '2026-08-28T02:43:27Z',
  last_sync_attempt_at: '2026-08-28T02:43:27Z',
  last_error: null,
  access_token_encrypted: 'enc:SECRET-ACCESS',
  refresh_token_encrypted: 'enc:SECRET-REFRESH',
  token_expires_at: '2026-08-28T03:40:00Z',
  scopes: ['Calendars.Read'],
  ...over,
})

/** What the sync left behind, in the array the route's client already holds. */
const replaceRows = (...next: Row[]) => rows.splice(0, rows.length, ...next)

function expectNoTokens(body: unknown) {
  const text = JSON.stringify(body)
  expect(text).not.toContain('SECRET')
  expect(text).not.toMatch(/token|scopes|refresh_|access_/i)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  bearer = true
  user = { id: 'u-1', email: 'owner@example.com' }
  onboarded = true
  calendarIntegration = true
  rows = [stored()]
  syncCalendarNow.mockReset()
})

describe('POST /api/mobile/calendar/:provider/sync: who may press it', () => {
  it('answers 401 without a bearer token, and syncs nothing', async () => {
    bearer = false
    const response = await press()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthenticated' })
    expect(syncCalendarNow).not.toHaveBeenCalled()
  })

  it('answers 401 for a token that names no user', async () => {
    user = null
    expect((await press()).status).toBe(401)
    expect(syncCalendarNow).not.toHaveBeenCalled()
  })

  it('answers 403 before onboarding is finished', async () => {
    onboarded = false
    const response = await press()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'onboarding_required' })
    expect(syncCalendarNow).not.toHaveBeenCalled()
  })

  it('answers 404 for a provider it does not know', async () => {
    expect((await press('yahoo')).status).toBe(404)
    expect(syncCalendarNow).not.toHaveBeenCalled()
  })

  it("answers the plan's 403 when calendar sync is not part of it", async () => {
    syncCalendarNow.mockResolvedValue({
      code: 'plan_required',
      error: 'Calendar sync is part of Pro.',
    })
    const response = await press()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Calendar sync is part of Pro.',
      code: 'plan_required',
    })
  })

  it('answers 404 when that calendar is not connected', async () => {
    syncCalendarNow.mockResolvedValue({
      code: 'not_connected',
      error: 'That calendar is not connected.',
    })
    expect((await press()).status).toBe(404)
  })

  it('is a POST and nothing else: opening the app cannot start a sync', () => {
    expect(Object.keys(sync).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST'])
  })
})

describe('what the app is told after a press', () => {
  it('a sync that worked: the outcome, and the connection as the website describes it', async () => {
    syncCalendarNow.mockImplementation(async () => {
      replaceRows(
        stored({ last_synced_at: NOW.toISOString(), last_sync_attempt_at: NOW.toISOString() }),
      )
      return { ok: true, code: 'synced', message: '3 meetings up to date.' }
    })
    const response = await press()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(syncCalendarNow).toHaveBeenCalledWith('microsoft')
    expect(body).toEqual({
      outcome: { ok: true, code: 'synced', message: '3 meetings up to date.' },
      connection: {
        provider: 'microsoft',
        status: 'connected',
        accountEmail: 'owner@example.com',
        lastSyncedAt: NOW.toISOString(),
        view: {
          label: 'Connected',
          tone: 'positive',
          detail: '',
          // 15:00 UTC is 10:00 in Chicago, the account's zone.
          synced: 'Last synced Oct 25, 10:00 AM',
          stale: false,
          note: null,
          sync: 'Sync now',
          reconnect: false,
        },
      },
    })
    expectNoTokens(body)
  })

  it('a temporary failure stays retryable: Try again, no reconnect', async () => {
    syncCalendarNow.mockImplementation(async () => {
      replaceRows(stored({ status: 'error', last_error: 'unavailable' }))
      return {
        code: 'unavailable',
        error:
          'The calendar provider could not be reached. Nothing was changed. Try again shortly.',
      }
    })
    const body = await (await press()).json()
    expect(body.outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message:
        'The calendar provider could not be reached. Nothing was changed. Try again shortly.',
    })
    expect(body.connection.view).toMatchObject({
      label: 'Sync failed',
      tone: 'caution',
      synced: 'Last synced Aug 27, 9:43 PM',
      stale: true,
      sync: 'Try again',
      reconnect: false,
    })
    expectNoTokens(body)
  })

  it('a refused grant asks for a reconnect on the website, and offers no sync', async () => {
    syncCalendarNow.mockImplementation(async () => {
      replaceRows(stored({ status: 'expired', last_error: 'needs_reconnect' }))
      return { code: 'needs_reconnect', error: 'Your calendar no longer accepts this connection.' }
    })
    const body = await (await press()).json()
    expect(body.connection.view).toMatchObject({
      label: 'Reconnect needed',
      sync: null,
      reconnect: true,
    })
  })

  it('inside the one-minute limit after a failure, says so rather than "up to date"', async () => {
    syncCalendarNow.mockResolvedValue({
      code: 'recently_failed',
      error: 'The last attempt, moments ago, did not complete. Try again in a minute.',
    })
    const body = await (await press()).json()
    expect(body.outcome).toEqual({
      ok: false,
      code: 'recently_failed',
      message: 'The last attempt, moments ago, did not complete. Try again in a minute.',
    })
  })

  it('a connection disconnected on the website meanwhile is 404, not a stale view', async () => {
    syncCalendarNow.mockImplementation(async () => {
      replaceRows()
      return { ok: true, code: 'synced', message: 'No new meetings in the next two weeks.' }
    })
    expect((await press()).status).toBe(404)
  })

  it("only the caller's own connection is described", async () => {
    rows = [stored({ user_id: 'someone-else' })]
    syncCalendarNow.mockResolvedValue({ ok: true, code: 'synced', message: 'Done.' })
    expect((await press()).status).toBe(404)
  })
})

describe('GET /api/mobile/account: the calendar, read-only', () => {
  const read = async () => {
    const response = await account.GET()
    return { status: response.status, body: await response.json() }
  }

  it('answers 401 without a bearer token', async () => {
    bearer = false
    expect((await read()).status).toBe(401)
  })

  it('describes each connection with its date, in the account zone, and never syncs', async () => {
    const { status, body } = await read()
    expect(status).toBe(200)
    expect(body.calendar.manageUrl).toMatch(/\/settings\/capabilities$/)
    expect(body.calendar.connections).toEqual([
      {
        provider: 'microsoft',
        status: 'connected',
        accountEmail: 'owner@example.com',
        lastSyncedAt: '2026-08-28T02:43:27Z',
        view: {
          label: 'Connected',
          tone: 'positive',
          detail: '',
          synced: 'Last synced Aug 27, 9:43 PM',
          stale: true,
          note: 'Not synced since Aug 27. Atturel syncs your calendar only when you press Sync now, so meetings added or changed since then are missing.',
          sync: 'Sync now',
          reconnect: false,
        },
      },
    ])
    expect(syncCalendarNow).not.toHaveBeenCalled()
    expectNoTokens(body.calendar)
  })

  it('a connection that never synced says so', async () => {
    rows = [stored({ last_synced_at: null, last_sync_attempt_at: null })]
    const { body } = await read()
    expect(body.calendar.connections[0].view).toMatchObject({
      synced: 'Never synced',
      stale: true,
      sync: 'Sync now',
    })
  })

  it('a plan without calendar sync offers no Sync now', async () => {
    calendarIntegration = false
    const { body } = await read()
    expect(body.calendar.connections[0].view).toMatchObject({ label: 'Pro', sync: null })
  })
})
