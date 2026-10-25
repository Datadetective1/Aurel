import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE PHONE'S PEOPLE CONTROLS (Phase 2A)
 * =============================================================================
 * Remove, restore, delete, correct, and the duplicate warning, through the
 * routes the app calls. The lifecycle rules themselves (what is unlinked,
 * what goes) are the shared core's and are exercised against the real
 * database on the preview; these tests hold the doors: ids, confirmation,
 * status codes, and that an app already installed sees nothing new.
 * =============================================================================
 */

const USER = { id: 'user-1' }
let signedIn = true
let activePeople: string[] = []

const core = {
  archivePersonRecord: vi.fn(),
  restorePersonRecord: vi.fn(),
  deletePersonRecord: vi.fn(),
  previewPersonDeletion: vi.fn(),
}
const actions = {
  createPersonCore: vi.fn(),
  updatePerson: vi.fn(),
  editLoopText: vi.fn(),
  deleteLoop: vi.fn(),
  setLoopStatus: vi.fn(),
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
            timeZone: 'UTC',
            supabase: {
              from: () => {
                let id = ''
                const chain = {
                  select: () => chain,
                  eq: (column: string, value: string) => {
                    if (column === 'id') id = value
                    return chain
                  },
                  is: () => chain,
                  maybeSingle: async () => ({ data: activePeople.includes(id) ? { id } : null }),
                }
                return chain
              },
            },
          }
        : { ok: false, response: real.json({ error: 'unauthenticated' }, 401) },
  }
})
vi.mock('@/lib/supabase/server', () => ({ bearerToken: async () => 'a.b.c' }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/people/lifecycle.server', () => core)
vi.mock('@/app/(app)/people/actions', () => ({
  createPersonCore: actions.createPersonCore,
  updatePerson: actions.updatePerson,
}))
vi.mock('@/app/(app)/loops/actions', () => ({
  editLoopText: actions.editLoopText,
  deleteLoop: actions.deleteLoop,
  setLoopStatus: actions.setLoopStatus,
}))
vi.mock('@/lib/conversations/avatars', () => ({ resolveFaces: vi.fn(), resolveFace: vi.fn() }))
vi.mock('@/lib/conversations/queries', () => ({ listLoops: vi.fn() }))
vi.mock('@/lib/visual/person.server', () => ({ loadPersonRecordVisual: vi.fn() }))
vi.mock('@/lib/visual/meeting.server', () => ({ toVisualLoop: vi.fn() }))

const people = await import('./people/route')
const person = await import('./people/[id]/route')
const archive = await import('./people/[id]/archive/route')
const restore = await import('./people/[id]/restore/route')
const deletion = await import('./people/[id]/deletion/route')
const loops = await import('./loops/[id]/route')

const ID = '6f1c8a52-1b7e-4c1a-9f0e-2a3b4c5d6e7f'
const request = (method: string, body?: unknown) =>
  new Request('https://www.atturel.com/x', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  signedIn = true
  activePeople = [ID]
  for (const fn of [...Object.values(core), ...Object.values(actions)]) fn.mockReset()
})

describe('adding someone from the phone', () => {
  it('an app that predates the duplicate check creates the person exactly as before', async () => {
    actions.createPersonCore.mockResolvedValue({ personId: 'p-new' })
    const res = await people.POST(request('POST', { fullName: 'Dana Whitfield' }))
    expect(res.status).toBe(201)
    expect(actions.createPersonCore.mock.calls[0]![1]).toEqual({ checkDuplicate: false })
  })

  it('an app that asks is told about the record that probably exists, and nothing is created', async () => {
    const duplicate = {
      id: 'p-old',
      name: 'Dana Whitfield',
      organization: 'Northwind',
      archived: true,
      reason: 'name',
    }
    actions.createPersonCore.mockResolvedValue({ duplicate, values: {} })
    const res = await people.POST(
      request('POST', { fullName: 'Dana Whitfield', checkDuplicate: true }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, duplicate })
    expect(actions.createPersonCore.mock.calls[0]![1]).toEqual({ checkDuplicate: true })
  })

  it('"add as someone new" goes through with the confirmation', async () => {
    actions.createPersonCore.mockResolvedValue({ personId: 'p-new' })
    await people.POST(
      request('POST', { fullName: 'Dana Whitfield', checkDuplicate: true, confirmDuplicate: true }),
    )
    const form = actions.createPersonCore.mock.calls[0]![0] as FormData
    expect(form.get('confirmDuplicate')).toBe('yes')
  })
})

describe('remove and restore', () => {
  it('rejects an id that is not one before anything runs', async () => {
    expect((await archive.POST(request('POST'), params('not-an-id'))).status).toBe(404)
    expect(core.archivePersonRecord).not.toHaveBeenCalled()
  })

  it('archives the caller’s own person, scoped to the caller', async () => {
    core.archivePersonRecord.mockResolvedValue('archived')
    const res = await archive.POST(request('POST'), params(ID))
    expect(res.status).toBe(200)
    expect(core.archivePersonRecord.mock.calls[0]!.slice(1)).toEqual([USER.id, ID])
  })

  it('someone else’s person is simply not found', async () => {
    core.archivePersonRecord.mockResolvedValue('not_found')
    expect((await archive.POST(request('POST'), params(ID))).status).toBe(404)
  })

  it('restoring past the plan limit is refused with the plan’s words', async () => {
    core.restorePersonRecord.mockResolvedValue({
      ok: false,
      reason: 'limit',
      message: 'The free plan holds 5 people.',
    })
    const res = await restore.POST(request('POST'), params(ID))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('The free plan holds 5 people.')
  })

  it('refuses without a session', async () => {
    signedIn = false
    expect((await restore.POST(request('POST'), params(ID))).status).toBe(401)
    expect(core.restorePersonRecord).not.toHaveBeenCalled()
  })
})

describe('permanent delete', () => {
  it('needs the confirmation spelled out', async () => {
    const res = await person.DELETE(request('DELETE', {}), params(ID))
    expect(res.status).toBe(400)
    expect(core.deletePersonRecord).not.toHaveBeenCalled()
  })

  it('is refused for someone who has not been removed first', async () => {
    core.deletePersonRecord.mockResolvedValue({ ok: false, reason: 'not_archived' })
    const res = await person.DELETE(request('DELETE', { confirm: 'delete' }), params(ID))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Remove them from your people first/)
  })

  it('reports how many loops were kept', async () => {
    core.deletePersonRecord.mockResolvedValue({ ok: true, keptLoops: 2, removedSources: 1 })
    const res = await person.DELETE(request('DELETE', { confirm: 'delete' }), params(ID))
    expect(await res.json()).toEqual({ ok: true, keptLoops: 2 })
  })

  it('the preview lists what goes, what stays unlinked, and the loops that still name them', async () => {
    core.previewPersonDeletion.mockResolvedValue({
      person: { id: ID, name: 'Dana', archivedAt: '2026-10-25T00:00:00Z' },
      deleted: { observations: 2, notes: 0, facts: 0, sources: 0, researchRuns: 0, photo: false },
      unlinked: {
        loops: 1,
        meetings: 1,
        conversations: 0,
        decisions: 0,
        notes: 0,
        briefCitations: 0,
      },
      retainedLoops: [
        { id: 'l1', description: 'Send Dana the deck', status: 'open', mentionsPerson: true },
      ],
    })
    const res = await deletion.GET(request('GET'), params(ID))
    expect(await res.json()).toEqual({
      person: { id: ID, name: 'Dana', archivedAt: '2026-10-25T00:00:00Z' },
      deleted: [
        "Dana's record: name, role, contact details and notes",
        '2 things you noted about them',
      ],
      unlinked: ['1 loop', '1 meeting'],
      retainedLoops: [
        { id: 'l1', description: 'Send Dana the deck', status: 'open', mentionsPerson: true },
      ],
    })
  })
})

describe('correcting a record', () => {
  it('only an active person of the caller’s can be edited from the phone', async () => {
    activePeople = []
    const res = await person.PATCH(request('PATCH', { fullName: 'Dana W.' }), params(ID))
    expect(res.status).toBe(404)
    expect(actions.updatePerson).not.toHaveBeenCalled()
  })

  it('sends the whole form to the web’s edit action', async () => {
    actions.updatePerson.mockResolvedValue({ message: 'Saved.' })
    const res = await person.PATCH(
      request('PATCH', {
        fullName: 'Dana Whitfield',
        pronouns: 'she/her',
        timezone: 'Europe/London',
      }),
      params(ID),
    )
    expect(res.status).toBe(200)
    const form = actions.updatePerson.mock.calls[0]![1] as FormData
    expect(form.get('personId')).toBe(ID)
    expect(form.get('pronouns')).toBe('she/her')
    expect(form.get('timezone')).toBe('Europe/London')
  })

  it('rewords or deletes a retained loop', async () => {
    actions.editLoopText.mockResolvedValue({ ok: true })
    actions.deleteLoop.mockResolvedValue({ ok: true })
    expect(
      (await loops.PATCH(request('PATCH', { description: 'Send the deck' }), params(ID))).status,
    ).toBe(200)
    expect(actions.editLoopText).toHaveBeenCalledWith(ID, 'Send the deck')
    expect((await loops.DELETE(request('DELETE'), params(ID))).status).toBe(200)
  })
})
