import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CREATE MEETING — the walkthrough regressions
 * =============================================================================
 * A new user created "Ansys Renewals" for Oct 21, 2026 at 8:53 AM in Chicago,
 * with the objective "Get approval to move two engineers onto the migration
 * before the quarter closes", and pressed "Create and prepare". The meeting came
 * back with no objective, at 3:53 AM, unprepared.
 *
 * These tests drive the real server action with the database, session and
 * framework stubbed at their edges, and assert on what is actually written.
 * =============================================================================
 */

const inserts: { table: string; row: Record<string, unknown> | Record<string, unknown>[] }[] = []
let profileTimezone: string | null = 'America/Chicago'
/** The caller's own, active people; anyone else is dropped from the attendees. */
let activePeople: string[] = ['person-1']

class Redirect extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT ${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/billing/entitlements', () => ({
  checkCapability: vi.fn(async () => ({ allowed: true })),
  recordUsage: vi.fn(),
}))
vi.mock('@/lib/ai/context', () => ({ getMeetingContext: vi.fn(), getUserContext: vi.fn() }))
vi.mock('@/lib/ai/provider', () => ({ runPrompt: vi.fn() }))
vi.mock('@/lib/workspace', () => ({
  ownership: async () => ({ user_id: 'user-1', workspace_id: 'ws-1', visibility: 'private' }),
  ownershipNoVisibility: async () => ({ user_id: 'user-1', workspace_id: 'ws-1' }),
}))
vi.mock('@/lib/auth', () => ({
  requireUser: async () => ({ id: 'user-1' }),
  getProfile: async () => ({ id: 'user-1', timezone: profileTimezone }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row })
        const result = { data: { id: 'meeting-1' }, error: null }
        return { select: () => ({ single: async () => result }), then: undefined }
      },
      // The attendee check: people of this user, not archived, among the ids.
      select: () => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          in: async (_column: string, ids: string[]) => ({
            data: ids.filter((id) => activePeople.includes(id)).map((id) => ({ id })),
          }),
        }
        return chain
      },
    }),
  }),
}))

const { createMeeting } = await import('./actions')

function walkthroughForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData()
  const fields: Record<string, string> = {
    title: 'Ansys Renewals',
    kind: 'customer_meeting',
    scheduledAt: '2026-10-21T08:53',
    objective: 'Get approval to move two engineers onto the migration before the quarter closes.',
    stakes: '',
    extraContext: '',
    importance: '4',
    ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  form.append('attendee', 'person-1:decision_maker')
  return form
}

async function submit(form: FormData) {
  try {
    return { state: await createMeeting({}, form), redirectedTo: null }
  } catch (error) {
    if (error instanceof Redirect) return { state: null, redirectedTo: error.to }
    throw error
  }
}

const meetingInsert = () =>
  inserts.find((i) => i.table === 'meetings')?.row as Record<string, unknown> | undefined

beforeEach(() => {
  inserts.length = 0
  profileTimezone = 'America/Chicago'
  activePeople = ['person-1']
})

describe('objective persistence', () => {
  it('writes the objective the user typed, verbatim', async () => {
    await submit(walkthroughForm())
    expect(meetingInsert()?.objective).toBe(
      'Get approval to move two engineers onto the migration before the quarter closes.',
    )
    expect(meetingInsert()?.title).toBe('Ansys Renewals')
  })

  it('writes the selected participant with their role', async () => {
    await submit(walkthroughForm())
    const attendees = inserts.find((i) => i.table === 'meeting_attendees')?.row as Record<
      string,
      unknown
    >[]
    expect(attendees).toEqual([
      expect.objectContaining({
        meeting_id: 'meeting-1',
        person_id: 'person-1',
        role: 'decision_maker',
      }),
    ])
  })

  it("drops an attendee who is archived or not the caller's own", async () => {
    activePeople = []
    await submit(walkthroughForm())
    expect(meetingInsert()?.title).toBe('Ansys Renewals')
    expect(inserts.find((i) => i.table === 'meeting_attendees')).toBeUndefined()
  })

  it('refuses an empty objective instead of silently storing null', async () => {
    const { state, redirectedTo } = await submit(walkthroughForm({ objective: '   ' }))
    expect(redirectedTo).toBeNull()
    expect(meetingInsert()).toBeUndefined()
    expect(state?.fieldErrors?.objective?.[0]).toMatch(/what you need/i)
  })

  it('echoes every typed value on a refusal, so the form reset cannot erase them', async () => {
    const { state } = await submit(walkthroughForm({ title: '' }))
    expect(state?.fieldErrors?.title).toBeDefined()
    expect(state?.values).toMatchObject({
      objective: 'Get approval to move two engineers onto the migration before the quarter closes.',
      scheduledAt: '2026-10-21T08:53',
      kind: 'customer_meeting',
    })
  })
})

describe('meeting time is read in the account zone', () => {
  it('stores 8:53 AM Chicago as 13:53Z, not 08:53Z', async () => {
    await submit(walkthroughForm())
    expect(meetingInsert()?.scheduled_at).toBe('2026-10-21T13:53:00.000Z')
  })

  it('uses the account zone, whatever it is', async () => {
    profileTimezone = 'Asia/Tokyo'
    await submit(walkthroughForm())
    expect(meetingInsert()?.scheduled_at).toBe('2026-10-20T23:53:00.000Z')
  })

  it('rejects a date that does not exist', async () => {
    const { state } = await submit(walkthroughForm({ scheduledAt: '2026-02-31T09:00' }))
    expect(state?.fieldErrors?.scheduledAt?.[0]).toMatch(/not valid/i)
    expect(meetingInsert()).toBeUndefined()
  })

  it('leaves the time empty when none was given', async () => {
    await submit(walkthroughForm({ scheduledAt: '' }))
    expect(meetingInsert()?.scheduled_at).toBeNull()
  })
})

describe('"Create and prepare" does what it says', () => {
  it('lands on the brief with preparation requested', async () => {
    const { redirectedTo } = await submit(walkthroughForm())
    expect(redirectedTo).toBe('/meetings/meeting-1/brief?prepare=1')
  })
})
