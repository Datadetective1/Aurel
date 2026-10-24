import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE PHONE'S WRITE ROUTES
 * =============================================================================
 * Each one is a thin door onto a web action. These tests drive the real route
 * handlers with the actions and the session stubbed, and assert on what the
 * action receives and what the phone is told.
 * =============================================================================
 */

const USER = { id: 'user-1' }
let signedIn = true
let bearer = true
let ownedPeople: string[] = []

const actions = {
  createMeetingCore: vi.fn(),
  generateBrief: vi.fn(),
  setLoopStatus: vi.fn(),
  createPersonCore: vi.fn(),
  signUpCore: vi.fn(),
  saveAboutCore: vi.fn(),
  loadDemoData: vi.fn(),
  removeSampleRecord: vi.fn(),
}

vi.mock('@/lib/mobile/route', async () => {
  const real = await vi.importActual<typeof import('@/lib/mobile/route')>('@/lib/mobile/route')
  return {
    ...real,
    mobileContext: async () =>
      signedIn
        ? {
            ok: true,
            user: USER,
            profile: { id: USER.id },
            timeZone: 'America/Chicago',
            supabase: {
              from: () => {
                const chain = {
                  select: () => chain,
                  eq: () => chain,
                  in: (_c: string, ids: string[]) => ({
                    then: (r: (v: unknown) => unknown) =>
                      r({
                        data: ids.filter((id) => ownedPeople.includes(id)).map((id) => ({ id })),
                      }),
                  }),
                  maybeSingle: async () => ({ data: { grounded_fallback: false } }),
                }
                return chain
              },
            },
          }
        : { ok: false, response: real.json({ error: 'unauthenticated' }, 401) },
  }
})
vi.mock('@/lib/supabase/server', () => ({ bearerToken: async () => (bearer ? 'a.b.c' : null) }))
vi.mock('@/lib/auth', () => ({ getOptionalUser: async () => (signedIn ? USER : null) }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/app/(app)/meetings/actions', () => ({
  createMeetingCore: actions.createMeetingCore,
  generateBrief: actions.generateBrief,
}))
vi.mock('@/app/(app)/loops/actions', () => ({ setLoopStatus: actions.setLoopStatus }))
vi.mock('@/app/(app)/people/actions', () => ({ createPersonCore: actions.createPersonCore }))
vi.mock('@/app/(auth)/actions', () => ({ signUpCore: actions.signUpCore }))
vi.mock('@/app/onboarding/actions', () => ({ saveAboutCore: actions.saveAboutCore }))
vi.mock('@/app/(app)/settings/actions', () => ({ loadDemoData: actions.loadDemoData }))
vi.mock('@/lib/demo/reset', () => ({ removeSampleRecord: actions.removeSampleRecord }))
vi.mock('@/lib/conversations/avatars', () => ({ resolveFaces: vi.fn() }))
vi.mock('@/lib/conversations/queries', () => ({ listLoops: vi.fn() }))

const meetings = await import('./meetings/route')
const prepare = await import('./meetings/[id]/prepare/route')
const loops = await import('./loops/[id]/route')
const people = await import('./people/route')
const signUp = await import('./sign-up/route')
const onboarding = await import('./onboarding/route')
const sample = await import('./sample-data/route')

const ID = '6f1c8a52-1b7e-4c1a-9f0e-2a3b4c5d6e7f'
const post = (body: unknown) =>
  new Request('https://www.atturel.com/x', { method: 'POST', body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  signedIn = true
  bearer = true
  ownedPeople = []
  for (const fn of Object.values(actions)) fn.mockReset()
})

describe('POST /api/mobile/meetings', () => {
  it('passes only the caller’s own people to the web action', async () => {
    ownedPeople = ['p-mine']
    actions.createMeetingCore.mockResolvedValue({ meetingId: 'm-1' })
    const res = await meetings.POST(
      post({
        title: 'Q3 review',
        objective: 'Get the headcount approved',
        scheduledAt: '2026-10-25T09:00',
        attendeeIds: ['p-mine', 'p-someone-elses'],
      }),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, meetingId: 'm-1' })
    const form = actions.createMeetingCore.mock.calls[0]![0] as FormData
    expect(form.get('title')).toBe('Q3 review')
    expect(form.get('objective')).toBe('Get the headcount approved')
    expect(form.get('scheduledAt')).toBe('2026-10-25T09:00')
    expect(form.getAll('attendee')).toEqual(['p-mine:contributor'])
  })

  it('says what was wrong in the web action’s own words', async () => {
    actions.createMeetingCore.mockResolvedValue({
      fieldErrors: { objective: ['Say what you need from this meeting. One sentence is enough.'] },
    })
    const res = await meetings.POST(post({ title: 'x', objective: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Say what you need/)
  })

  it('refuses without a session', async () => {
    signedIn = false
    expect((await meetings.POST(post({}))).status).toBe(401)
    expect(actions.createMeetingCore).not.toHaveBeenCalled()
  })
})

describe('POST /api/mobile/meetings/:id/prepare', () => {
  it('runs the web Generate and reports whether a model wrote it', async () => {
    actions.generateBrief.mockResolvedValue({ ok: true, artifactId: 'a-1' })
    const res = await prepare.POST(post({}), params(ID))
    expect(actions.generateBrief).toHaveBeenCalledWith(ID)
    expect(await res.json()).toEqual({ ok: true, grounded: false })
  })

  it('carries a plan refusal as a refusal, not a crash', async () => {
    actions.generateBrief.mockResolvedValue({ ok: false, error: 'Limit reached.', upgrade: true })
    const res = await prepare.POST(post({}), params(ID))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: 'Limit reached.', upgrade: true })
  })

  it('does not look up an id that is not one', async () => {
    expect((await prepare.POST(post({}), params('../people'))).status).toBe(404)
    expect(actions.generateBrief).not.toHaveBeenCalled()
  })
})

describe('POST /api/mobile/loops/:id', () => {
  it('accepts only the four loop actions', async () => {
    const res = await loops.POST(post({ action: 'delete' }), params(ID))
    expect(res.status).toBe(400)
    expect(actions.setLoopStatus).not.toHaveBeenCalled()
  })

  it('closes a loop through the web action', async () => {
    actions.setLoopStatus.mockResolvedValue({ ok: true })
    const res = await loops.POST(post({ action: 'done' }), params(ID))
    expect(actions.setLoopStatus).toHaveBeenCalledWith(ID, 'done')
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('POST /api/mobile/people', () => {
  it('adds a person through the web action, limit and all', async () => {
    actions.createPersonCore.mockResolvedValue({ error: 'The free plan holds 5 people.' })
    const res = await people.POST(post({ fullName: 'Jordan Lee' }))
    expect(res.status).toBe(422)
    expect((actions.createPersonCore.mock.calls[0]![0] as FormData).get('fullName')).toBe(
      'Jordan Lee',
    )
  })
})

describe('POST /api/mobile/sign-up', () => {
  it('needs no session and says whether the email must be confirmed', async () => {
    signedIn = false
    bearer = false
    actions.signUpCore.mockResolvedValue({ ok: true, email: 'a@b.co', needsConfirmation: true })
    const res = await signUp.POST(
      post({ fullName: 'A', email: 'a@b.co', password: 'x'.repeat(12) }),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, needsConfirmation: true })
  })

  it('passes the web’s generic refusal through unchanged', async () => {
    actions.signUpCore.mockResolvedValue({
      ok: false,
      error: 'We could not create that account. Try a different email address.',
    })
    const res = await signUp.POST(
      post({ fullName: 'A', email: 'a@b.co', password: 'x'.repeat(12) }),
    )
    expect((await res.json()).error).toBe(
      'We could not create that account. Try a different email address.',
    )
  })
})

describe('POST /api/mobile/onboarding', () => {
  it('requires the bearer token, but not a finished onboarding', async () => {
    bearer = false
    expect((await onboarding.POST(post({ fullName: 'A' }))).status).toBe(401)

    bearer = true
    actions.saveAboutCore.mockResolvedValue({ ok: true })
    const res = await onboarding.POST(post({ fullName: 'Amary', timezone: 'America/Chicago' }))
    expect(await res.json()).toEqual({ ok: true })
    const form = actions.saveAboutCore.mock.calls[0]![0] as FormData
    expect(form.get('timezone')).toBe('America/Chicago')
  })
})

describe('/api/mobile/sample-data', () => {
  it('loads through the web action and removes through the reset', async () => {
    actions.loadDemoData.mockResolvedValue({ message: 'Demo data loaded.' })
    expect((await sample.POST()).status).toBe(200)

    actions.removeSampleRecord.mockResolvedValue({ ok: true, conversationsRemoved: 1 })
    const res = await sample.DELETE()
    expect(actions.removeSampleRecord).toHaveBeenCalledWith(expect.anything(), USER.id)
    expect(await res.json()).toEqual({ ok: true, message: 'Sample record removed.' })
  })
})
