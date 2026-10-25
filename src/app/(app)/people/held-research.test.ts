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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'u-1' }) }))
vi.mock('@/lib/workspace', () => ({ getWorkspace: async () => ({ workspaceId: 'ws-1' }) }))
vi.mock('@/lib/organizations', () => ({ resolveOrganization: async () => 'org-1' }))
vi.mock('@/lib/billing/entitlements', () => ({
  checkCapability: async () => ({ allowed: true }),
  recordUsage: vi.fn(),
}))
vi.mock('@/lib/research/providers', () => ({
  resolveSearchProvider: () => ({ id: 'none', search: vi.fn() }),
  researchCapability: () => ({ canDiscover: false, discoveryHint: 'Add a link.' }),
}))
vi.mock('@/lib/research/ingest', async (original) => ({
  ...(await original<typeof import('@/lib/research/ingest')>()),
  ingestUrl,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }))

const { confirmSourceMatch, rejectSourceMatch, researchPerson } = await import('./research-actions')

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

  it('the web’s run does not hold', async () => {
    ingestUrl.mockResolvedValue({
      sourceId: 's-1',
      accessStatus: 'analyzed',
      factsCreated: 1,
      observationsProposed: 0,
      usage: null,
    })
    await researchPerson(PERSON)
    expect(ingestUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ holdForReview: false }),
    )
  })
})
