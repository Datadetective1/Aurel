import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * RESEARCH THAT ADDS NOTHING UNSEEN
 * =============================================================================
 * The app's research reads and checks every page exactly as the web's does,
 * but holds what a page would add until the user says it is them. Nothing
 * reaches the person's record from a held page: no fact, no proposal, no
 * confirmed link -- not even for a link the user typed in themselves.
 * =============================================================================
 */

type Op = [string, unknown[]]
type Call = { table: string; ops: Op[] }

/** A Supabase client that records every query and answers from `answer`. */
function recordingClient(answer: (table: string, ops: Op[]) => { data: unknown; error: unknown }) {
  const calls: Call[] = []
  const client = {
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
  /** The first argument of every `method` call made on `table`. */
  const wrote = (table: string, method: string) =>
    calls
      .filter((c) => c.table === table)
      .flatMap((c) => c.ops.filter(([m]) => m === method).map(([, args]) => args[0]))
  return { client: client as never, calls, wrote }
}

const PERSON = {
  id: 'p-1',
  full_name: 'Dana Whitfield',
  job_title: 'VP Sales',
  email: null,
  organizations: { name: 'Northwind' },
}
const ABOUT_DANA = `${'Northwind builds logistics software for regional carriers. '.repeat(20)}Dana Whitfield is VP Sales at Northwind, having joined from Halcyon.`
const ABOUT_SOMEONE_ELSE =
  'A long page about a different person and a different company entirely. '.repeat(20)

const EXTRACTION = {
  mentionsTarget: true,
  sourceSummary: 'Company leadership page.',
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
  communicationObservations: [
    { content: 'Writes plainly.', excerpt: null, evidenceLevel: 'inferred' },
  ],
  containedInstructions: false,
  gaps: [],
}

let page = { text: ABOUT_DANA, title: 'Dana Whitfield | Northwind leadership' }
let extraction: typeof EXTRACTION = EXTRACTION
const runPrompt = vi.fn(async () => ({
  output: extraction,
  citations: [],
  provenance: {
    provider: 'test',
    model: 'm',
    promptVersion: 'v',
    latencyMs: 1,
    groundedFallback: false,
    tokenUsage: { input: 100, output: 50 },
  },
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/billing/entitlements', () => ({ recordUsage: vi.fn() }))
vi.mock('@/lib/ai/provider', () => ({ runPrompt }))
vi.mock('@/lib/sources/fetch', () => ({
  parseUrl: (u: string) => {
    try {
      return new URL(u)
    } catch {
      return null
    }
  },
  safeFetch: async (url: string) => ({
    ok: true,
    body: '<html></html>',
    contentType: 'text/html',
    finalUrl: url,
    status: 200,
    bytes: 20_000,
    truncated: false,
  }),
}))
vi.mock('@/lib/sources/extract', () => ({
  classifyUrl: () => ({ sourceType: 'company_page' }),
  extractFromHtml: () => ({
    text: page.text,
    title: page.title,
    publisher: 'Northwind',
    author: null,
    publishedAt: '2026-01-05T00:00:00.000Z',
    contentHash: 'hash-1',
    wordCount: 400,
  }),
  extractFromText: () => ({ text: page.text, title: null, contentHash: 'hash-1', wordCount: 400 }),
}))

const { ingestUrl, reholdForReview } = await import('./ingest')

function fresh(over: { existingSource?: object | null; prior?: object | null } = {}) {
  return recordingClient((table, ops) => {
    const last = ops[ops.length - 1]?.[0]
    const did = (m: string) => ops.some(([op]) => op === m)
    if (table === 'sources' && did('insert')) return { data: { id: 'src-1' }, error: null }
    if (table === 'sources' && did('update')) return { data: { id: 'src-1' }, error: null }
    if (table === 'sources' && last === 'maybeSingle')
      return { data: over.existingSource ?? null, error: null }
    if (table === 'people') return { data: PERSON, error: null }
    if (table === 'source_person_links' && last === 'maybeSingle') {
      return { data: over.prior ?? null, error: null }
    }
    if (table === 'professional_facts' && did('insert'))
      return { data: { id: 'f-new' }, error: null }
    if (table === 'professional_facts') return { data: [], error: null }
    if (table === 'observations' && did('insert')) return { data: { id: 'o-new' }, error: null }
    return { data: null, error: null }
  })
}

const options = (client: never, over: object = {}) => ({
  supabase: client,
  workspaceId: 'ws-1',
  userId: 'u-1',
  personId: 'p-1',
  holdForReview: true,
  ...over,
})

beforeEach(() => {
  page = { text: ABOUT_DANA, title: 'Dana Whitfield | Northwind leadership' }
  extraction = EXTRACTION
  runPrompt.mockClear()
})

describe('a page that may be them, held for review', () => {
  it('is read and checked, and what it would add is held on its link', async () => {
    const db = fresh()
    const result = await ingestUrl('https://northwind.example/team', options(db.client))

    expect(result.held).toBe(true)
    expect(result.factsCreated).toBe(0)
    expect(result.accessStatus).toBe('identity_uncertain')
    expect(runPrompt).toHaveBeenCalledTimes(1)

    const links = db.wrote('source_person_links', 'upsert') as {
      identity_match_status: string
      match_signals: {
        held?: { facts: unknown[]; observations: unknown[] }
        exactNameInTitle?: boolean
      }
    }[]
    const last = links[links.length - 1]!
    expect(last.identity_match_status).toBe('unreviewed')
    expect(last.match_signals.exactNameInTitle).toBe(true)
    expect(last.match_signals.held?.facts).toHaveLength(2)
    expect(last.match_signals.held?.observations).toHaveLength(1)
    expect(db.wrote('sources', 'update')).toContainEqual({ access_status: 'identity_uncertain' })
  })

  it('adds nothing to the record: no fact, no proposal, no confirmed link', async () => {
    const db = fresh()
    await ingestUrl('https://northwind.example/team', options(db.client))

    expect(db.wrote('professional_facts', 'insert')).toEqual([])
    expect(db.wrote('fact_sources', 'insert')).toEqual([])
    expect(db.wrote('observations', 'insert')).toEqual([])
    const statuses = (
      db.wrote('source_person_links', 'upsert') as { identity_match_status: string }[]
    ).map((l) => l.identity_match_status)
    expect(statuses).not.toContain('confirmed')
    expect(statuses).not.toContain('probable')
  })

  it('a link the user typed in is held like any other page', async () => {
    const db = fresh()
    const result = await ingestUrl(
      'https://northwind.example/dana',
      options(db.client, { userSupplied: true }),
    )
    expect(result.held).toBe(true)
    const links = db.wrote('source_person_links', 'upsert') as { identity_match_status: string }[]
    expect(links[links.length - 1]!.identity_match_status).toBe('unreviewed')
    expect(db.wrote('professional_facts', 'insert')).toEqual([])
  })

  it('a page already on file, new to this person, is held without touching the source', async () => {
    const db = fresh({
      existingSource: {
        id: 'src-old',
        source_url: 'https://northwind.example/team',
        source_title: 'Dana Whitfield | Northwind leadership',
        publisher: 'Northwind',
        published_at: null,
        extracted_text: ABOUT_DANA,
        access_status: 'analyzed',
        processing_status: 'complete',
        content_hash: 'hash-1',
        source_type: 'company_page',
      },
    })
    const result = await ingestUrl('https://northwind.example/team', options(db.client))
    expect(result.held).toBe(true)
    expect(result.sourceId).toBe('src-old')
    // It may stand behind someone else's facts: its own status is left alone.
    expect(db.wrote('sources', 'update')).toEqual([])
    expect(db.wrote('professional_facts', 'insert')).toEqual([])
  })
})

describe('what was already decided or found stays as it is', () => {
  it('a page the user said is not them is never offered again', async () => {
    const db = fresh({
      prior: {
        identity_match_status: 'no_match',
        identity_match_confidence: 0.8,
        reviewed_by_user: true,
        match_signals: {},
      },
    })
    const result = await ingestUrl('https://northwind.example/team', options(db.client))
    expect(result.held).toBe(false)
    expect(runPrompt).not.toHaveBeenCalled()
    expect(db.wrote('source_person_links', 'upsert')).toEqual([])
    expect(db.wrote('professional_facts', 'insert')).toEqual([])
  })

  it('searching again counts a page still waiting, without reading it again', async () => {
    const db = fresh({
      prior: {
        identity_match_status: 'unreviewed',
        identity_match_confidence: 0.8,
        reviewed_by_user: false,
        match_signals: {
          exactNameInTitle: true,
          held: { facts: [], observations: [], asOf: null },
        },
      },
    })
    const result = await ingestUrl('https://northwind.example/team', options(db.client))
    expect(result.held).toBe(true)
    expect(runPrompt).not.toHaveBeenCalled()
    expect(db.wrote('source_person_links', 'upsert')).toEqual([])
  })

  it('a page already in the record is left there, and counted as such', async () => {
    const db = fresh({
      prior: {
        identity_match_status: 'confirmed',
        identity_match_confidence: 1,
        reviewed_by_user: true,
        match_signals: {},
      },
    })
    const result = await ingestUrl('https://northwind.example/team', options(db.client))
    expect(result.held).toBe(false)
    expect(result.accessStatus).toBe('analyzed')
    expect(db.wrote('source_person_links', 'upsert')).toEqual([])
  })
})

describe('a page that is not them', () => {
  it('without their name, is set aside before anything reads it', async () => {
    page = { text: ABOUT_SOMEONE_ELSE, title: 'Another person' }
    const db = fresh()
    const result = await ingestUrl('https://elsewhere.example/', options(db.client))
    expect(result.held).toBeFalsy()
    expect(runPrompt).not.toHaveBeenCalled()
    const links = db.wrote('source_person_links', 'upsert') as {
      identity_match_status: string
      match_signals: object
    }[]
    expect(links[links.length - 1]!.identity_match_status).toBe('no_match')
    expect(links[links.length - 1]!.match_signals).not.toHaveProperty('held')
  })

  it('that the reading finds is not about them, holds nothing', async () => {
    extraction = { ...EXTRACTION, mentionsTarget: false }
    const db = fresh()
    const result = await ingestUrl('https://northwind.example/team', options(db.client))
    expect(result.held).toBeFalsy()
    const links = db.wrote('source_person_links', 'upsert') as {
      identity_match_status: string
      match_signals: object
    }[]
    expect(links[links.length - 1]!.identity_match_status).toBe('no_match')
    expect(links[links.length - 1]!.match_signals).not.toHaveProperty('held')
  })
})

describe('without the hold, the web’s research is unchanged', () => {
  it('links a strong page and adds its facts at once, as before', async () => {
    const db = fresh()
    const result = await ingestUrl(
      'https://northwind.example/team',
      options(db.client, { holdForReview: false }),
    )
    expect(result.held).toBeFalsy()
    expect(result.factsCreated).toBe(2)
    expect(db.wrote('professional_facts', 'insert')).toHaveLength(2)
    const links = db.wrote('source_person_links', 'upsert') as { identity_match_status: string }[]
    expect(links[0]!.identity_match_status).toBe('probable')
  })
})

describe('on the web’s run, the user’s decision stands (finding 5.8)', () => {
  const web = (client: never) => options(client, { holdForReview: false })

  it('a page the user said is not them is not linked or read again', async () => {
    const db = fresh({ prior: { identity_match_status: 'no_match', reviewed_by_user: true } })
    const result = await ingestUrl('https://northwind.example/team', web(db.client))
    expect(result.identity?.status).toBe('no_match')
    expect(result.factsCreated).toBe(0)
    expect(runPrompt).not.toHaveBeenCalled()
    expect(db.wrote('source_person_links', 'upsert')).toEqual([])
    expect(db.wrote('professional_facts', 'insert')).toEqual([])
  })

  it('a page the user confirmed stays confirmed, even when the reading doubts it', async () => {
    extraction = { ...EXTRACTION, mentionsTarget: false }
    const db = fresh({ prior: { identity_match_status: 'confirmed', reviewed_by_user: true } })
    await ingestUrl('https://northwind.example/team', web(db.client))
    const links = db.wrote('source_person_links', 'upsert') as { identity_match_status: string }[]
    expect(links[0]!.identity_match_status).toBe('confirmed')
    expect(db.wrote('source_person_links', 'update')).toEqual([])
  })
})

describe('reconsidering a page reads it again and holds it', () => {
  it('from what was stored, without fetching, and adds nothing yet', async () => {
    const db = recordingClient((table, ops) => {
      const last = ops[ops.length - 1]?.[0]
      if (table === 'sources' && last === 'maybeSingle') {
        return {
          data: {
            id: 'src-1',
            source_url: 'https://northwind.example/team',
            source_title: 'Dana Whitfield | Northwind leadership',
            publisher: 'Northwind',
            published_at: null,
            extracted_text: ABOUT_DANA,
            source_type: 'company_page',
          },
          error: null,
        }
      }
      if (table === 'people') return { data: PERSON, error: null }
      return { data: null, error: null }
    })
    const result = await reholdForReview(db.client, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      personId: 'p-1',
      sourceId: 'src-1',
    })
    expect(result.held).toBe(true)
    const links = db.wrote('source_person_links', 'upsert') as {
      identity_match_status: string
      match_signals: { held?: unknown }
    }[]
    expect(links[0]!.identity_match_status).toBe('unreviewed')
    expect(links[0]!.match_signals.held).toBeTruthy()
    expect(db.wrote('professional_facts', 'insert')).toEqual([])
    // Its status is left alone: it may stand behind someone else.
    expect(db.wrote('sources', 'update')).toEqual([])
  })
})
