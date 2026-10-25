import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FINDING 8.6: SYNC NOW, ITS LIMIT, ITS FAILURES, AND DISCONNECT
 * =============================================================================
 * The real action and the real sync, over an in-memory database that applies
 * each statement atomically after yielding -- so two requests interleave the
 * way a website and an iPhone pressing Sync now in the same second do, and a
 * conditional UPDATE is checked against the row as the earlier one left it,
 * as Postgres does under its row lock. The provider is a stub: nothing here
 * reaches Microsoft or Google.
 * =============================================================================
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>[]>,
  provider: {
    refresh: (() => {}) as unknown as import('vitest').Mock,
    listEvents: (() => {}) as unknown as import('vitest').Mock,
    revoke: (() => {}) as unknown as import('vitest').Mock,
  },
  allowed: true,
  checkCapability: (() => {}) as unknown as import('vitest').Mock,
}))

/** Yield, then apply: each statement is atomic, and others may run between them. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** PostgREST's `or=(a.op.value,…)`, for the operators the claim uses. */
function orFilter(expression: string): (row: Row) => boolean {
  const terms = expression.split(',').map((term) => {
    const first = term.indexOf('.')
    const second = term.indexOf('.', first + 1)
    return {
      column: term.slice(0, first),
      op: term.slice(first + 1, second),
      value: term.slice(second + 1),
    }
  })
  return (row) =>
    terms.some(({ column, op, value }) => {
      const cell = row[column] ?? null
      if (op === 'is' && value === 'null') return cell === null
      if (op === 'lt') return cell !== null && Date.parse(String(cell)) < Date.parse(value)
      throw new Error(`unsupported or-filter ${op}`)
    })
}

function fakeDatabase() {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = []
      let op:
        | { kind: 'select' }
        | { kind: 'update'; values: Row }
        | { kind: 'delete' }
        | { kind: 'upsert'; values: Row; onConflict: string } = { kind: 'select' }
      let returning = false
      const rows = () => (h.db[table] ??= [])
      const matching = () => rows().filter((row) => filters.every((f) => f(row)))

      async function run(): Promise<Row[] | null> {
        await tick()
        if (op.kind === 'select') return matching().map((row) => ({ ...row }))
        if (op.kind === 'update') {
          const hit = matching()
          for (const row of hit) Object.assign(row, op.values)
          return returning ? hit.map((row) => ({ ...row })) : null
        }
        if (op.kind === 'delete') {
          const hit = new Set(matching())
          h.db[table] = rows().filter((row) => !hit.has(row))
          return null
        }
        const keys = op.onConflict.split(',')
        const values = op.values
        const existing = rows().find((row) => keys.every((k) => row[k] === values[k]))
        if (existing) Object.assign(existing, values)
        else rows().push({ id: `${table}-${rows().length + 1}`, ...values })
        return null
      }

      const chain = {
        select: () => {
          if (op.kind !== 'select') returning = true
          return chain
        },
        update: (values: Row) => {
          op = { kind: 'update', values }
          return chain
        },
        delete: () => {
          op = { kind: 'delete' }
          return chain
        },
        upsert: (values: Row, options: { onConflict: string }) => {
          op = { kind: 'upsert', values, onConflict: options.onConflict }
          return chain
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return chain
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value)
          return chain
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]))
          return chain
        },
        or: (expression: string) => {
          filters.push(orFilter(expression))
          return chain
        },
        maybeSingle: async () => ({ data: (await run())?.[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          run()
            .then((data) => ({ data, error: null }), reject)
            .then(resolve, reject),
      }
      return chain
    },
  }
}

vi.mock('@/lib/auth', () => ({
  requireOnboardedUser: async () => ({ user: { id: 'u-1', email: 'owner@example.com' } }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeDatabase() }))
vi.mock('@/lib/billing/entitlements', () => ({
  checkCapability: (...args: unknown[]) => h.checkCapability(...args),
}))
vi.mock('@/lib/calendar', () => ({ calendarProvider: () => h.provider }))
vi.mock('@/lib/crypto', () => ({
  encryptSecret: (value: string | null | undefined) => (value ? `enc:${value}` : null),
  decryptSecret: (value: string | null) => (value?.startsWith('enc:') ? value.slice(4) : null),
  canStoreSecrets: () => true,
}))
vi.mock('@/lib/workspace', () => ({ ownership: async () => ({}) }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { syncCalendarNow, disconnectCalendar } = await import('./calendar-actions')
const { syncCalendar, previousAttempt } = await import('@/lib/calendar/sync')

const NOW = new Date('2026-10-25T15:00:00Z')

/** The owner's connection as it stood: last synced 28 Aug, access token long expired. */
const connection = (over: Row = {}): Row => ({
  id: 'int-1',
  user_id: 'u-1',
  provider: 'microsoft',
  status: 'connected',
  access_token_encrypted: 'enc:old-access',
  refresh_token_encrypted: 'enc:stored-refresh',
  token_expires_at: '2026-08-28T03:40:00Z',
  calendar_id: null,
  sync_cursor: null,
  last_synced_at: '2026-08-28T02:43:27Z',
  last_sync_attempt_at: '2026-08-28T02:43:27Z',
  last_error: null,
  ...over,
})

const EVENT = {
  externalId: 'ev-1',
  calendarId: null,
  title: 'Quarterly review',
  description: null,
  startsAt: '2026-10-27T15:00:00Z',
  endsAt: '2026-10-27T16:00:00Z',
  timeZone: 'UTC',
  isAllDay: false,
  location: null,
  meetingUrl: null,
  organizerEmail: null,
  attendees: [],
  recurrenceId: null,
  isRecurring: false,
  status: 'confirmed',
  isPrivate: false,
  providerUpdatedAt: '2026-10-20T10:00:00Z',
}

const refreshed = {
  ok: true,
  value: {
    accessToken: 'new-access',
    expiresAt: '2026-10-25T16:00:00Z',
    scopes: [],
    accountEmail: null,
  },
}

const row = () => h.db.integration_accounts!.find((r) => r.id === 'int-1')!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db = {
    integration_accounts: [connection()],
    external_calendar_events: [],
    people: [],
  }
  h.provider.refresh = vi.fn(async () => refreshed)
  h.provider.listEvents = vi.fn(async () => ({
    ok: true,
    value: { events: [EVENT], cursor: null },
  }))
  h.provider.revoke = vi.fn(async () => {})
  h.checkCapability = vi.fn(async () => ({ allowed: true }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a failed refresh: only a refused grant asks for a reconnect', () => {
  it.each([
    ['unavailable', 'error', 'unavailable'],
    ['rate_limited', 'error', 'rate_limited'],
    ['error', 'error', 'error'],
    ['unauthorized', 'expired', 'needs_reconnect'],
    ['admin_consent_required', 'admin_consent_required', 'admin_consent_required'],
  ])('a provider answering %s leaves the connection %s', async (failure, status, reason) => {
    h.provider.refresh = vi.fn(async () => ({ ok: false, reason: failure }))
    const outcome = await syncCalendar(fakeDatabase() as never, 'u-1', 'int-1')
    expect(outcome).toMatchObject({ ok: false, reason })
    expect(row()).toMatchObject({ status, last_error: reason })
    // The grant is left exactly as it was, and the last good sync keeps its date.
    expect(row().refresh_token_encrypted).toBe('enc:stored-refresh')
    expect(row().last_synced_at).toBe('2026-08-28T02:43:27Z')
    expect(h.provider.listEvents).not.toHaveBeenCalled()
  })
})

describe('a failed read of the calendar', () => {
  it.each([
    ['unauthorized', 'revoked', 'needs_reconnect'],
    ['unavailable', 'error', 'unavailable'],
    ['rate_limited', 'error', 'rate_limited'],
  ])('a listing refused as %s leaves the connection %s', async (failure, status, reason) => {
    h.provider.listEvents = vi.fn(async () => ({ ok: false, reason: failure }))
    const outcome = await syncCalendar(fakeDatabase() as never, 'u-1', 'int-1')
    expect(outcome).toMatchObject({ ok: false, reason })
    expect(row().status).toBe(status)
    expect(h.db.external_calendar_events).toHaveLength(0)
  })
})

describe('a successful sync', () => {
  it('stores the meetings, keeps the refresh token, and stamps one instant', async () => {
    const outcome = await syncCalendar(fakeDatabase() as never, 'u-1', 'int-1')
    expect(outcome).toMatchObject({ ok: true, imported: 1 })
    expect(row()).toMatchObject({
      status: 'connected',
      last_error: null,
      access_token_encrypted: 'enc:new-access',
      refresh_token_encrypted: 'enc:stored-refresh',
      last_synced_at: NOW.toISOString(),
      last_sync_attempt_at: NOW.toISOString(),
    })
    expect(h.db.external_calendar_events).toHaveLength(1)
    expect(h.db.external_calendar_events![0]).toMatchObject({ user_id: 'u-1', external_id: 'ev-1' })
  })
})

describe('Sync now: one attempt a minute, from any device', () => {
  it('a website and an iPhone pressing at once start one sync, not two', async () => {
    let finish: () => void = () => {}
    h.provider.listEvents = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true, value: { events: [EVENT], cursor: null } })
        }),
    )
    const web = syncCalendarNow('microsoft')
    const phone = syncCalendarNow('microsoft')
    // The second press is answered while the first is still reading.
    const second = await Promise.race([web, phone])
    expect(second).toMatchObject({ ok: true, code: 'in_progress' })
    expect(second.message).toBe('A sync is already running. Check back in a moment.')
    await vi.waitFor(() => expect(h.provider.listEvents).toHaveBeenCalled())
    finish()
    const results = await Promise.all([web, phone])
    expect(results.map((r) => r.code).sort()).toEqual(['in_progress', 'synced'])
    expect(h.provider.refresh).toHaveBeenCalledTimes(1)
    expect(h.provider.listEvents).toHaveBeenCalledTimes(1)
  })

  it('five presses at once still make one provider call', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => syncCalendarNow('microsoft')))
    expect(results.filter((r) => r.code === 'synced')).toHaveLength(1)
    expect(h.provider.listEvents).toHaveBeenCalledTimes(1)
  })

  it('inside the minute after a sync that worked, says so', async () => {
    expect(await syncCalendarNow('microsoft')).toMatchObject({ ok: true, code: 'synced' })
    vi.setSystemTime(new Date(NOW.getTime() + 20_000))
    expect(await syncCalendarNow('microsoft')).toEqual({
      ok: true,
      code: 'recently_synced',
      message: 'Synced moments ago. Try again in a minute.',
    })
    expect(h.provider.listEvents).toHaveBeenCalledTimes(1)
  })

  it('inside the minute after a sync that failed, never says "up to date"', async () => {
    h.provider.refresh = vi.fn(async () => ({ ok: false, reason: 'unavailable' }))
    expect(await syncCalendarNow('microsoft')).toMatchObject({ code: 'unavailable' })
    vi.setSystemTime(new Date(NOW.getTime() + 20_000))
    const again = await syncCalendarNow('microsoft')
    expect(again).toEqual({
      code: 'recently_failed',
      error: 'The last attempt, moments ago, did not complete. Try again in a minute.',
    })
    expect(JSON.stringify(again)).not.toMatch(/up to date/i)
    expect(h.provider.refresh).toHaveBeenCalledTimes(1)
  })

  it('after a temporary failure, Try again works once the minute has passed', async () => {
    h.provider.refresh = vi.fn(async () => ({ ok: false, reason: 'rate_limited' }))
    const failed = await syncCalendarNow('microsoft')
    expect(failed).toMatchObject({ code: 'rate_limited' })
    expect(failed.error).not.toMatch(/reconnect/i)
    expect(row().status).toBe('error')

    h.provider.refresh = vi.fn(async () => refreshed)
    vi.setSystemTime(new Date(NOW.getTime() + 61_000))
    expect(await syncCalendarNow('microsoft')).toMatchObject({ ok: true, code: 'synced' })
    expect(row()).toMatchObject({ status: 'connected', last_error: null })
  })

  it('a refused grant asks for a reconnect, in those words', async () => {
    h.provider.refresh = vi.fn(async () => ({ ok: false, reason: 'unauthorized' }))
    const result = await syncCalendarNow('microsoft')
    expect(result).toMatchObject({ code: 'needs_reconnect' })
    expect(result.error).toMatch(/Reconnect/)
    expect(row().status).toBe('expired')
  })

  it('an unreachable provider is retryable, and nothing was changed', async () => {
    h.provider.listEvents = vi.fn(async () => ({ ok: false, reason: 'unavailable' }))
    const result = await syncCalendarNow('microsoft')
    expect(result).toEqual({
      code: 'unavailable',
      error: 'The calendar provider could not be reached. Nothing was changed. Try again shortly.',
    })
  })

  it('a plan without calendar sync starts nothing and claims nothing', async () => {
    h.checkCapability = vi.fn(async () => ({ allowed: false, message: 'Calendar sync is Pro.' }))
    expect(await syncCalendarNow('microsoft')).toEqual({
      code: 'plan_required',
      error: 'Calendar sync is Pro.',
    })
    expect(row().last_sync_attempt_at).toBe('2026-08-28T02:43:27Z')
    expect(h.provider.refresh).not.toHaveBeenCalled()
  })

  it('a calendar that is not connected is said to be, and nothing runs', async () => {
    h.db.integration_accounts = []
    expect(await syncCalendarNow('google')).toMatchObject({ code: 'not_connected' })
    expect(h.provider.refresh).not.toHaveBeenCalled()
  })

  it("another account's connection is never claimed", async () => {
    h.db.integration_accounts = [connection({ user_id: 'someone-else' })]
    expect(await syncCalendarNow('microsoft')).toMatchObject({ code: 'not_connected' })
    expect(h.db.integration_accounts[0]!.last_sync_attempt_at).toBe('2026-08-28T02:43:27Z')
  })
})

describe('how the attempt holding the limit went', () => {
  const at = (synced: string | null, attempt: string | null, error: string | null = null) =>
    previousAttempt({ last_synced_at: synced, last_sync_attempt_at: attempt, last_error: error })

  it('reads succeeded, failed, still running, or unknown from the row', () => {
    const t = NOW.toISOString()
    expect(at(t, t)).toBe('succeeded')
    expect(at('2026-08-28T02:43:27Z', t, 'unavailable')).toBe('failed')
    expect(at('2026-08-28T02:43:27Z', t)).toBe('in_progress')
    expect(at(null, t)).toBe('in_progress')
    expect(at(null, null)).toBe('unknown')
  })
})

describe('Disconnect, in every saved state', () => {
  it.each(['connected', 'error', 'expired', 'revoked', 'admin_consent_required'])(
    'a %s connection is removed with its meetings',
    async (status) => {
      h.db.integration_accounts = [connection({ status })]
      h.db.external_calendar_events = [
        { id: 'e-1', user_id: 'u-1', integration_id: 'int-1' },
        { id: 'e-2', user_id: 'someone-else', integration_id: 'int-9' },
      ]
      expect(await disconnectCalendar('microsoft')).toEqual({
        ok: true,
        message: 'Calendar disconnected.',
      })
      expect(h.db.integration_accounts).toHaveLength(0)
      expect(h.db.external_calendar_events.map((e) => e.id)).toEqual(['e-2'])
    },
  )

  it('needs no plan: a downgraded account can still remove its calendar', async () => {
    h.checkCapability = vi.fn(async () => ({ allowed: false, message: 'Pro only.' }))
    expect(await disconnectCalendar('microsoft')).toMatchObject({ ok: true })
    expect(h.checkCapability).not.toHaveBeenCalled()
    expect(h.db.integration_accounts).toHaveLength(0)
  })
})
