import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../../../tests/stubs/fake-supabase'

/**
 * SEARCHING YOUR PEOPLE, AND RESEARCHING ONE OF THEM, ARE SEPARATE
 * =============================================================================
 * Search is the web's people search over the caller's own saved, active
 * people, and nothing else. Public research runs only from its own route,
 * only when asked, and holds what it finds. Adding or editing someone --
 * profile link included -- never starts it.
 * =============================================================================
 */

const researchPerson = vi.fn()
const confirmSourceMatch = vi.fn()
const rejectSourceMatch = vi.fn()
const loadResearchReview = vi.fn()
const createPersonCore = vi.fn()
const updatePerson = vi.fn()
let supabase: unknown

vi.mock('@/lib/mobile/route', () => ({
  mobileContext: async () => ({
    ok: true,
    user: { id: 'u-1' },
    profile: {},
    supabase,
    timeZone: 'UTC',
  }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  planRequired: (message: string) =>
    Response.json({ error: message, code: 'plan_required' }, { status: 403 }),
  readJson: async (request: Request) => {
    try {
      return await request.json()
    } catch {
      return null
    }
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/conversations/avatars', () => ({
  resolveFaces: async () => new Map(),
  resolveFace: async () => null,
}))
vi.mock('@/lib/conversations/queries', () => ({ listLoops: async () => [] }))
vi.mock('@/app/(app)/people/actions', () => ({ createPersonCore, updatePerson }))
vi.mock('@/app/(app)/people/research-actions', () => ({
  researchPerson,
  confirmSourceMatch,
  rejectSourceMatch,
}))
vi.mock('@/lib/research/review.server', () => ({ loadResearchReview }))
vi.mock('@/lib/visual/person.server', () => ({ loadPersonRecordVisual: vi.fn() }))
vi.mock('@/lib/people/lifecycle.server', () => ({ deletePersonRecord: vi.fn() }))

const people = await import('./route')
const personRoute = await import('./[id]/route')
const research = await import('./[id]/research/route')
const decision = await import('./[id]/sources/[sourceId]/route')

const P = '7f0d3c1e-5a4b-4c8d-9e2f-1a2b3c4d5e6f'
const S = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const ctx = (id = P) => ({ params: Promise.resolve({ id }) })

const person = (over: Row): Row => ({
  user_id: 'u-1',
  archived_at: null,
  preferred_name: null,
  avatar_url: null,
  avatar_path: null,
  job_title: null,
  relationship_type: 'peer',
  last_interaction_at: null,
  is_demo: false,
  organizations: null,
  ...over,
})

function withSearch(rpcRows: { entity: string; id: string }[], rows: Row[], error: unknown = null) {
  const fake = fakeClient({ people: rows })
  const rpc = vi.fn(async () => ({ data: error ? null : rpcRows, error }))
  supabase = { ...(fake.client as object), rpc }
  return { rpc, fake }
}

const review = (sourceIds: string[] = []) => ({
  person: {
    id: P,
    name: 'Dana',
    fullName: 'Dana Whitfield',
    organization: 'Northwind',
    jobTitle: null,
    hasProfileUrl: false,
  },
  canDiscover: true,
  hint: null,
  lastResearchedAt: null,
  sources: sourceIds.map((id) => ({ id, state: 'waiting' })),
  notUsed: 0,
})

beforeEach(() => {
  for (const fn of [
    researchPerson,
    confirmSourceMatch,
    rejectSourceMatch,
    loadResearchReview,
    createPersonCore,
    updatePerson,
  ]) {
    fn.mockReset()
  }
})

describe('search: the web’s people search, over your own saved people only', () => {
  const rows = [
    person({ id: 'p-dana', full_name: 'Dana Whitfield', organization_id: 'o-nw' }),
    person({ id: 'p-sam', full_name: 'Sam Ortiz', organization_id: 'o-nw' }),
    person({
      id: 'p-gone',
      full_name: 'Rhea Okafor',
      organization_id: 'o-nw',
      archived_at: '2026-10-01T00:00:00Z',
    }),
    person({ id: 'p-theirs', full_name: 'Someone Else', organization_id: 'o-nw', user_id: 'u-2' }),
  ]

  it('asks the same search function the web uses', async () => {
    const { rpc } = withSearch([{ entity: 'person', id: 'p-dana' }], rows)
    await people.GET(new Request('https://x/api/mobile/people?q=dana'))
    expect(rpc).toHaveBeenCalledWith('search_everything', { q: 'dana', max_results: 50 })
  })

  it('returns matched people first, then people saved at a matching company -- never archived, never anyone else’s', async () => {
    withSearch(
      [
        { entity: 'person', id: 'p-dana' },
        { entity: 'organization', id: 'o-nw' },
        { entity: 'meeting', id: 'm-1' },
      ],
      rows,
    )
    const res = await people.GET(new Request('https://x/api/mobile/people?q=north'))
    const body = (await res.json()) as { people: { id: string }[] }
    expect(body.people.map((p) => p.id)).toEqual(['p-dana', 'p-sam'])
  })

  it('a person the search returns from someone else’s record is still not shown', async () => {
    withSearch([{ entity: 'person', id: 'p-theirs' }], rows)
    const body = (await (
      await people.GET(new Request('https://x/api/mobile/people?q=someone'))
    ).json()) as { people: unknown[] }
    expect(body.people).toEqual([])
  })

  it('one letter searches nothing, as on the web', async () => {
    const { rpc } = withSearch([], rows)
    const body = (await (
      await people.GET(new Request('https://x/api/mobile/people?q=d'))
    ).json()) as { people: unknown[] }
    expect(rpc).not.toHaveBeenCalled()
    expect(body.people).toEqual([])
  })

  it('a failed search says so, rather than "no one matches"', async () => {
    withSearch([], rows, { code: '57014' })
    const res = await people.GET(new Request('https://x/api/mobile/people?q=dana'))
    expect(res.status).toBe(502)
  })

  it('never starts public research', async () => {
    withSearch([{ entity: 'person', id: 'p-dana' }], rows)
    await people.GET(new Request('https://x/api/mobile/people?q=dana'))
    expect(researchPerson).not.toHaveBeenCalled()
  })
})

describe('entering details never starts research', () => {
  it('adding someone with a name, role, company and profile link', async () => {
    createPersonCore.mockResolvedValue({ personId: P, research: true })
    const res = await people.POST(
      new Request('https://x/api/mobile/people', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Dana Whitfield',
          jobTitle: 'VP Sales',
          organizationName: 'Northwind',
          profileUrl: 'https://northwind.example/dana',
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(researchPerson).not.toHaveBeenCalled()
  })

  it('saving a profile link on someone already saved', async () => {
    supabase = fakeClient({ people: [person({ id: P, full_name: 'Dana Whitfield' })] }).client
    updatePerson.mockResolvedValue({ ok: true })
    await personRoute.PATCH(
      new Request('https://x', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: 'Dana Whitfield',
          profileUrl: 'https://northwind.example/dana',
        }),
      }),
      ctx(),
    )
    expect(updatePerson).toHaveBeenCalled()
    expect(researchPerson).not.toHaveBeenCalled()
  })
})

describe('research: only when asked, and held for review', () => {
  it('opening it reads what is on record and never searches', async () => {
    loadResearchReview.mockResolvedValue(review())
    const res = await research.GET(new Request('https://x'), ctx())
    expect(res.status).toBe(200)
    expect(researchPerson).not.toHaveBeenCalled()
  })

  it('asking runs the web’s research, holding every page it finds', async () => {
    loadResearchReview.mockResolvedValue(review(['s-1']))
    researchPerson.mockResolvedValue({ ok: true, message: 'Reviewed 3 sources.', sourcesHeld: 1 })
    const res = await research.POST(new Request('https://x', { method: 'POST' }), ctx())
    const body = (await res.json()) as {
      outcome: { ok: boolean; message: string }
      sources: unknown[]
    }
    expect(researchPerson).toHaveBeenCalledWith(P, { holdForReview: true })
    expect(body.outcome).toMatchObject({ ok: true, message: 'Reviewed 3 sources.' })
    expect(body.sources).toHaveLength(1)
  })

  it('not being able to tell who they are is an outcome, with what would help', async () => {
    loadResearchReview.mockResolvedValue(review())
    researchPerson.mockResolvedValue({
      ok: false,
      error: "I couldn't confidently identify Dana Whitfield.",
      identity: { missing: ['jobTitle'] },
    })
    const body = (await (
      await research.POST(new Request('https://x', { method: 'POST' }), ctx())
    ).json()) as { outcome: unknown }
    expect(body.outcome).toEqual({
      ok: false,
      message: "I couldn't confidently identify Dana Whitfield.",
      missing: ['jobTitle'],
    })
  })

  it('a plan without research is the plan’s answer, not an error', async () => {
    loadResearchReview.mockResolvedValue(review())
    researchPerson.mockResolvedValue({
      error: 'You have used this month’s research.',
      upgrade: true,
    })
    const res = await research.POST(new Request('https://x', { method: 'POST' }), ctx())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'plan_required' })
  })

  it('someone not on record, or archived, is not found and nothing runs', async () => {
    loadResearchReview.mockResolvedValue(null)
    const res = await research.POST(new Request('https://x', { method: 'POST' }), ctx())
    expect(res.status).toBe(404)
    expect(researchPerson).not.toHaveBeenCalled()
  })
})

describe('"This is them" and "Not them"', () => {
  const post = (body: unknown, sourceId = S) =>
    decision.POST(new Request('https://x', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: P, sourceId }),
    })

  it('confirming uses the web’s confirm, and says what was added', async () => {
    loadResearchReview.mockResolvedValue(review([S]))
    confirmSourceMatch.mockResolvedValue({ ok: true, factsCreated: 2, observationsProposed: 0 })
    const body = (await (await post({ decision: 'confirm' })).json()) as {
      ok: boolean
      factsAdded: number
    }
    expect(confirmSourceMatch).toHaveBeenCalledWith(S, P)
    expect(body).toMatchObject({ ok: true, factsAdded: 2 })
  })

  it('rejecting uses the web’s reject, and adds nothing', async () => {
    loadResearchReview.mockResolvedValue(review([S]))
    rejectSourceMatch.mockResolvedValue({ ok: true })
    const body = (await (await post({ decision: 'reject' })).json()) as { factsAdded: number }
    expect(rejectSourceMatch).toHaveBeenCalledWith(S, P)
    expect(confirmSourceMatch).not.toHaveBeenCalled()
    expect(body.factsAdded).toBe(0)
  })

  it('only a page research found for this person can be decided', async () => {
    loadResearchReview.mockResolvedValue(review(['some-other-page']))
    const res = await post({ decision: 'confirm' })
    expect(res.status).toBe(404)
    expect(confirmSourceMatch).not.toHaveBeenCalled()
  })

  it('a decision must be one of the two', async () => {
    const res = await post({ decision: 'maybe' })
    expect(res.status).toBe(400)
  })
})
