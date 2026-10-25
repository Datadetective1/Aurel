import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * HELD RESEARCH: ONLY "THIS IS THEM" ADDS ANYTHING
 * =============================================================================
 * The app's research run holds every page it finds. Confirming one is the
 * moment its facts enter the person's record, once; "not them" drops what was
 * held, so nothing from that page can be added later.
 * =============================================================================
 */

type Op = [string, unknown[]]
let answer: (table: string, ops: Op[]) => { data: unknown; error: unknown } = () => ({
  data: null,
  error: null,
})
let calls: { table: string; ops: Op[] }[] = []

function client() {
  return {
    from(table: string) {
      const ops: Op[] = []
      calls.push({ table, ops })
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') {
              return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
                Promise.resolve(answer(table, ops)).then(res, rej)
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => {
                ops.push([String(prop), []])
                return Promise.resolve(answer(table, ops))
              }
            }
            return (...args: unknown[]) => {
              ops.push([String(prop), args])
              return chain
            }
          },
        },
      )
      return chain
    },
  }
}
const wrote = (table: string, method: string) =>
  calls
    .filter((c) => c.table === table)
    .flatMap((c) => c.ops.filter(([m]) => m === method).map(([, a]) => a[0]))

const ingestUrl = vi.fn()
const reholdForReview = vi.fn()
const recordUsage = vi.fn()
const search = vi.fn()
let discovery: { canDiscover: boolean; discoveryHint: string | null } = {
  canDiscover: false,
  discoveryHint: 'Add a link.',
}
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'u-1' }) }))
vi.mock('@/lib/workspace', () => ({ getWorkspace: async () => ({ workspaceId: 'ws-1' }) }))
vi.mock('@/lib/organizations', () => ({ resolveOrganization: async () => 'org-1' }))
vi.mock('@/lib/billing/entitlements', () => ({
  checkCapability: async () => ({ allowed: true }),
  recordUsage: (...args: unknown[]) => recordUsage(...args),
}))
vi.mock('@/lib/research/providers', () => ({
  resolveSearchProvider: () => ({ id: 'test', search: (q: string) => search(q) }),
  researchCapability: () => discovery,
}))
vi.mock('@/lib/research/ingest', async (original) => ({
  ...(await original<typeof import('@/lib/research/ingest')>()),
  ingestUrl,
  reholdForReview,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }))

const { addContext, confirmSourceMatch, reconsiderSourceMatch, rejectSourceMatch, researchPerson } =
  await import('./research-actions')

const PERSON = '7f0d3c1e-5a4b-4c8d-9e2f-1a2b3c4d5e6f'
const HELD = {
  facts: [
    {
      kind: 'current_role',
      value: 'VP Sales',
      detail: null,
      excerpt: 'Dana Whitfield is VP Sales',
      evidenceLevel: 'observed',
      isCurrent: true,
    },
    {
      kind: 'prior_role',
      value: 'Halcyon',
      detail: null,
      excerpt: 'joined from Halcyon',
      evidenceLevel: 'inferred',
      isCurrent: false,
    },
  ],
  observations: [],
  asOf: null,
}

function linkWith(signals: object) {
  answer = (table, ops) => {
    const did = (m: string) => ops.some(([op]) => op === m)
    if (table === 'source_person_links' && ops.some(([op]) => op === 'maybeSingle')) {
      return { data: { workspace_id: 'ws-1', match_signals: signals }, error: null }
    }
    if (table === 'professional_facts' && did('insert'))
      return { data: { id: `f-${calls.length}` }, error: null }
    if (table === 'professional_facts') return { data: [], error: null }
    return { data: null, error: null }
  }
}

beforeEach(() => {
  calls = []
  ingestUrl.mockReset()
  reholdForReview.mockReset()
  recordUsage.mockReset()
  search.mockReset()
  discovery = { canDiscover: false, discoveryHint: 'Add a link.' }
})

describe('"This is them" on a held page', () => {
  it('adds what was held to the record, through the research writers', async () => {
    linkWith({ exactNameInTitle: true, held: HELD })
    const result = await confirmSourceMatch('s-1', PERSON)

    expect(result.factsCreated).toBe(2)
    const facts = wrote('professional_facts', 'insert') as {
      value: string
      evidence_level: string
      person_id: string
    }[]
    expect(facts.map((f) => [f.value, f.evidence_level, f.person_id])).toEqual([
      ['VP Sales', 'observed', PERSON],
      ['Halcyon', 'inferred', PERSON],
    ])
    // Each fact points back at the page it came from.
    expect(wrote('fact_sources', 'insert')).toHaveLength(2)
  })

  it('confirms the link and clears what was held, so it is added only once', async () => {
    linkWith({ exactNameInTitle: true, held: HELD })
    await confirmSourceMatch('s-1', PERSON)
    const update = wrote('source_person_links', 'update')[0] as {
      identity_match_status: string
      reviewed_by_user: boolean
      match_signals: object
    }
    expect(update.identity_match_status).toBe('confirmed')
    expect(update.reviewed_by_user).toBe(true)
    expect(update.match_signals).toEqual({ exactNameInTitle: true })
  })

  it('a page with nothing held adds nothing, as before', async () => {
    linkWith({ exactNameInTitle: true })
    const result = await confirmSourceMatch('s-1', PERSON)
    expect(result.factsCreated).toBe(0)
    expect(wrote('professional_facts', 'insert')).toEqual([])
  })

  it('held results that are not well-formed never reach the record', async () => {
    linkWith({ held: { facts: 'not facts', observations: [] } })
    const result = await confirmSourceMatch('s-1', PERSON)
    expect(result.factsCreated).toBe(0)
    expect(wrote('professional_facts', 'insert')).toEqual([])
  })
})

describe('"Not them" on a held page', () => {
  it('marks it as someone else and drops what was held', async () => {
    linkWith({ exactNameInTitle: true, held: HELD })
    await rejectSourceMatch('s-1', PERSON)
    const update = wrote('source_person_links', 'update')[0] as {
      identity_match_status: string
      reviewed_by_user: boolean
      match_signals: object
    }
    expect(update.identity_match_status).toBe('no_match')
    expect(update.reviewed_by_user).toBe(true)
    expect(update.match_signals).toEqual({ exactNameInTitle: true })
    expect(wrote('professional_facts', 'insert')).toEqual([])
  })
})

describe('a research run that holds', () => {
  beforeEach(() => {
    answer = (table, ops) => {
      if (table === 'people' && ops.some(([op]) => op === 'maybeSingle')) {
        return {
          data: {
            id: PERSON,
            full_name: 'Dana Whitfield',
            job_title: 'VP Sales',
            profile_url: 'https://northwind.example/dana',
            email: null,
            identity_locked: false,
            archived_at: null,
            organizations: { name: 'Northwind' },
          },
          error: null,
        }
      }
      if (table === 'research_jobs') return { data: { id: 'job-1' }, error: null }
      return { data: null, error: null }
    }
  })

  it('passes the hold to every page, and says nothing is in the record yet', async () => {
    ingestUrl.mockResolvedValue({
      sourceId: 's-1',
      accessStatus: 'identity_uncertain',
      held: true,
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
    })
    const result = await researchPerson(PERSON, { holdForReview: true })

    expect(ingestUrl).toHaveBeenCalledWith(
      'https://northwind.example/dana',
      expect.objectContaining({ holdForReview: true }),
    )
    expect(result).toMatchObject({ ok: true, sourcesHeld: 1, factsCreated: 0, needsReview: true })
    expect(result.message).toMatch(/Nothing is in their record until you check it/)
    expect(wrote('people', 'update')).toContainEqual(
      expect.objectContaining({ research_status: 'needs_review' }),
    )
  })

  it('the web’s run holds the profile link’s page too: typing a link in is not checking it', async () => {
    ingestUrl.mockResolvedValue({
      sourceId: 's-1',
      accessStatus: 'identity_uncertain',
      held: true,
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
    })
    const result = await researchPerson(PERSON)
    expect(ingestUrl).toHaveBeenCalledWith(
      'https://northwind.example/dana',
      expect.objectContaining({ holdForReview: true, userSupplied: true }),
    )
    expect(result).toMatchObject({ ok: true, sourcesHeld: 1, factsCreated: 0, needsReview: true })
  })

  it('pages the web’s search finds keep per-page review as before; only the typed link is held', async () => {
    discovery = { canDiscover: true, discoveryHint: null }
    search.mockResolvedValue({
      ok: true,
      costUnits: 1,
      results: [{ url: 'https://northwind.example/team/dana-whitfield' }],
    })
    ingestUrl.mockImplementation(async (url: string) =>
      url === 'https://northwind.example/dana'
        ? { sourceId: 's-1', accessStatus: 'identity_uncertain', held: true, factsCreated: 0 }
        : { sourceId: 's-2', accessStatus: 'analyzed', factsCreated: 1, observationsProposed: 0 },
    )
    const result = await researchPerson(PERSON)

    expect(ingestUrl).toHaveBeenCalledWith(
      'https://northwind.example/dana',
      expect.objectContaining({ holdForReview: true }),
    )
    expect(ingestUrl).toHaveBeenCalledWith(
      'https://northwind.example/team/dana-whitfield',
      expect.objectContaining({ holdForReview: false, userSupplied: false }),
    )
    expect(result).toMatchObject({ ok: true, sourcesHeld: 1, sourcesAccepted: 1 })
    expect(result.message).toMatch(/1 more may be about Dana Whitfield/)
  })
})

describe('a link added with Add context', () => {
  it('is read because the user asked, and held for their check', async () => {
    answer = () => ({ data: null, error: null })
    ingestUrl.mockResolvedValue({
      sourceId: 's-1',
      accessStatus: 'identity_uncertain',
      held: true,
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
      message: 'Strong match. Check it is them before Atturel adds anything.',
    })
    const form = new FormData()
    form.set('personId', PERSON)
    form.set('input', 'https://northwind.example/dana')
    const result = await addContext({}, form)

    expect(ingestUrl).toHaveBeenCalledWith(
      'https://northwind.example/dana',
      expect.objectContaining({ holdForReview: true, userSupplied: true }),
    )
    expect(result).toMatchObject({ ok: true, sourcesHeld: 1, needsReview: true })
    expect(result.message).toMatch(/nothing from it is in their record until you say it is them/)
  })

  it('a page the user marked as someone else is not used, and the answer says so', async () => {
    answer = () => ({ data: null, error: null })
    ingestUrl.mockResolvedValue({
      sourceId: 's-1',
      accessStatus: 'identity_uncertain',
      reused: true,
      held: false,
      identity: { status: 'no_match', confidence: 0, explanation: 'You already decided.' },
      factsCreated: 0,
      observationsProposed: 0,
      usage: null,
      message: null,
    })
    const form = new FormData()
    form.set('personId', PERSON)
    form.set('input', 'https://northwind.example/dana')
    const result = await addContext({}, form)

    expect(result.ok).toBeUndefined()
    expect(result.error).toMatch(/marked that page as being about someone else/)
    expect(result.error).toMatch(/Reconsider/)
  })
})

describe('Reconsider a page marked "not them"', () => {
  function decided(status: string, reviewed: boolean) {
    answer = (table, ops) => {
      if (table === 'source_person_links' && ops.some(([op]) => op === 'maybeSingle')) {
        return {
          data: {
            identity_match_status: status,
            reviewed_by_user: reviewed,
            match_signals: { exactNameInTitle: true },
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }
  }

  it('is offered only for a page the user marked as someone else', async () => {
    decided('confirmed', true)
    const result = await reconsiderSourceMatch('s-1', PERSON)
    expect(result.error).toMatch(/Only a page you marked as someone else/)
    expect(wrote('source_person_links', 'update')).toEqual([])
    expect(reholdForReview).not.toHaveBeenCalled()

    decided('no_match', false)
    expect((await reconsiderSourceMatch('s-1', PERSON)).error).toMatch(/Only a page you marked/)
    expect(reholdForReview).not.toHaveBeenCalled()
  })

  it('lifts "not them" and holds the page for review, metered as one source read', async () => {
    decided('no_match', true)
    reholdForReview.mockResolvedValue({
      sourceId: 's-1',
      held: true,
      factsCreated: 0,
      observationsProposed: 0,
      usage: { provider: 'anthropic', model: 'm', inputTokens: 10, outputTokens: 5 },
    })
    const result = await reconsiderSourceMatch('s-1', PERSON)

    expect(result).toMatchObject({ ok: true, sourcesHeld: 1, needsReview: true })
    expect(wrote('source_person_links', 'update')).toEqual([
      { identity_match_status: 'unreviewed', reviewed_by_user: false, match_signals: {} },
    ])
    expect(reholdForReview).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'ws-1',
      userId: 'u-1',
      personId: PERSON,
      sourceId: 's-1',
    })
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ meter: 'source_ingest', subjectId: 's-1' }),
    )
    // Nothing reaches the record until the user says it is them.
    expect(wrote('professional_facts', 'insert')).toEqual([])
  })

  const RESTORED = {
    identity_match_status: 'no_match',
    reviewed_by_user: true,
    match_signals: { exactNameInTitle: true },
  }

  it('when the page still does not read as them, says so, adds nothing, and "not them" stands', async () => {
    decided('no_match', true)
    reholdForReview.mockResolvedValue({
      sourceId: 's-1',
      factsCreated: 0,
      observationsProposed: 0,
      usage: { provider: 'anthropic', model: 'm', inputTokens: 10, outputTokens: 5 },
      message: 'On reading it, this source does not appear to be about Dana Whitfield.',
    })
    const result = await reconsiderSourceMatch('s-1', PERSON)
    expect(result).toMatchObject({ ok: false })
    expect(result.error).toMatch(/does not appear to be about Dana Whitfield/)
    expect(result.error).toMatch(/It stays marked as someone else/)
    // The user's decision is put back exactly, so no later run can link it.
    expect(wrote('source_person_links', 'update').at(-1)).toEqual(RESTORED)
    // The reading happened, so it is metered.
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ meter: 'source_ingest' }))
    expect(wrote('professional_facts', 'insert')).toEqual([])
  })

  it('if reading it again fails, "not them" stands and nothing is charged', async () => {
    decided('no_match', true)
    reholdForReview.mockRejectedValue(new Error('network'))
    const result = await reconsiderSourceMatch('s-1', PERSON)
    expect(result.error).toMatch(/could not be read again\. It stays marked as someone else/)
    expect(wrote('source_person_links', 'update').at(-1)).toEqual(RESTORED)
    expect(recordUsage).not.toHaveBeenCalled()
  })
})
