// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../../../tests/stubs/fake-supabase'

/**
 * FINDING 8.6 IN SETTINGS › CAPABILITIES, AS A CUSTOMER SEES IT
 * =============================================================================
 * The real page, rendered for a non-owner account. Customers see only what is
 * working, so a calendar connection that failed or expired used to vanish
 * from their Settings, taking Try again, Reconnect and Disconnect with it. It
 * now stays, first, under "Needs attention", with the control its state
 * calls for -- even on a deployment that no longer configures the provider.
 * =============================================================================
 */

const h = vi.hoisted(() => ({
  tier: 'pro',
  configured: true,
  rows: [] as Record<string, unknown>[],
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(app)/calendar-actions', () => ({
  syncCalendarNow: vi.fn(),
  disconnectCalendar: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  requireOnboardedUser: async () => ({
    user: { id: 'u-1' },
    profile: { timezone: 'America/Chicago' },
  }),
}))
vi.mock('@/lib/billing/entitlements', () => ({
  getEntitlements: async () => ({
    tier: h.tier,
    plan: 'pro',
    capabilities: { calendarIntegration: true },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () =>
    fakeClient({ integration_accounts: h.rows, external_calendar_events: [] }).client,
}))
vi.mock('@/lib/calendar', () => ({
  calendarCapability: () =>
    (['microsoft', 'google'] as const).map((id) => ({
      id,
      label: id === 'microsoft' ? 'Microsoft 365' : 'Google Calendar',
      configured: id === 'microsoft' && h.configured,
      missingEnv: id === 'microsoft' && h.configured ? [] : ['CLIENT_ID'],
      tokenKey: 'ok',
      nearMatches: [],
      scopes: [],
    })),
}))
vi.mock('@/lib/ai/provider', () => ({
  aiStatus: () => ({ generative: false, provider: 'none', model: 'none' }),
}))
vi.mock('@/lib/research/providers', () => ({
  researchCapability: () => ({
    canDiscover: false,
    searchProvider: 'none',
    enrichmentProvider: 'none',
  }),
}))
vi.mock('@/lib/email/send', () => ({ senderAddress: () => 'noreply@example.com' }))
vi.mock('@/lib/env', async (original) => ({
  ...(await original<typeof import('@/lib/env')>()),
  features: { transcription: false, emailDelivery: false, billing: false, scheduledJobs: false },
}))

const { default: CapabilitiesSettingsPage } = await import('./page')

const saved = (status: string, over: Row = {}): Row => ({
  user_id: 'u-1',
  provider: 'microsoft',
  status,
  external_account_email: 'customer@example.com',
  last_synced_at: '2026-08-28T02:43:27Z',
  ...over,
})

async function show() {
  render(await CapabilitiesSettingsPage())
}

/** The section under a heading, so a control is found where it belongs. */
const section = (name: string) =>
  within(screen.getByRole('heading', { name }).closest('section') as HTMLElement)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
  h.tier = 'pro'
  h.configured = true
  h.rows = []
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a customer whose calendar connection needs attention', () => {
  it('a failed sync stays on screen, first, with Try again and Disconnect', async () => {
    h.rows = [saved('error')]
    await show()
    const attention = section('Needs attention')
    expect(attention.getByText('Sync failed')).toBeTruthy()
    expect(attention.getByText('Last synced Aug 27, 9:43 PM')).toBeTruthy()
    expect(attention.getByRole('button', { name: /Try again/ })).toBeTruthy()
    expect(attention.getByRole('button', { name: /Disconnect/ })).toBeTruthy()
    expect(attention.queryByRole('link', { name: 'Reconnect' })).toBeNull()
  })

  it('an expired grant stays on screen with Reconnect and Disconnect, and no sync', async () => {
    h.rows = [saved('expired')]
    await show()
    const attention = section('Needs attention')
    expect(attention.getByText('Reconnect needed')).toBeTruthy()
    expect(attention.getByRole('link', { name: 'Reconnect' }).getAttribute('href')).toBe(
      '/api/calendar/microsoft/connect',
    )
    expect(attention.getByRole('button', { name: /Disconnect/ })).toBeTruthy()
    expect(attention.queryByRole('button', { name: /Sync now|Try again/ })).toBeNull()
  })

  it('with no calendar provider configured any more, it can still be disconnected', async () => {
    h.configured = false
    h.rows = [saved('expired')]
    await show()
    const attention = section('Needs attention')
    expect(attention.getByText('Microsoft 365')).toBeTruthy()
    expect(attention.getByRole('button', { name: /Disconnect/ })).toBeTruthy()
    expect(attention.queryByRole('link', { name: /Reconnect|Connect/ })).toBeNull()
  })
})

describe('a customer whose calendar is connected', () => {
  it('is listed as working, with Sync now, Disconnect and the stale note', async () => {
    h.rows = [saved('connected')]
    await show()
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull()
    const working = section('Working now')
    expect(working.getByRole('button', { name: /Sync now/ })).toBeTruthy()
    expect(working.getByRole('button', { name: /Disconnect/ })).toBeTruthy()
    expect(working.getByText(/Not synced since Aug 27/)).toBeTruthy()
  })
})

describe('a customer with nothing saved', () => {
  it('sees no Calendar card, as before (connecting from Settings is a separate follow-up)', async () => {
    await show()
    expect(screen.queryByText('Microsoft 365')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull()
  })
})
