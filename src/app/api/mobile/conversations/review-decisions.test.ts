import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FINDING 8.7: KEEPING THE DEFAULTS CONFIRMS ONLY THE DECISION
 * =============================================================================
 * The phone's review route and the web's review action, for real, over a
 * stubbed database holding the audit's test conversation as proposals: the
 * clear decision, a proposal read since the fix, a proposal written before it
 * (at the old composer's 0.7), and a model's paraphrased one. What the phone
 * starts ticked, kept as it is, confirms the decision and sets the rest aside.
 * =============================================================================
 */

const USER = { id: 'user-1' }
const CONVERSATION = {
  id: '6f1e1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  title: 'Launch and vendor',
  occurred_at: '2026-09-10T15:00:00Z',
  summary: null,
  outcome: null,
  processing_status: 'ready',
  artifact_id: null,
}

type Row = { id: string; description: string; confidence: number; excerpt: string | null }
const ROWS: Row[] = [
  {
    id: 'd-decided',
    description: 'We decided to move the launch to March.',
    confidence: 0.7,
    excerpt: 'Alex Rivera: We decided to move the launch to March.',
  },
  {
    id: 'd-suggested',
    description: "I'd suggest going with vendor B.",
    confidence: 0.5,
    excerpt: "Ravi Menon: I'd suggest going with vendor B.",
  },
  {
    // Written before the fix, when the composer gave it 0.7.
    id: 'd-legacy',
    description: 'Ravi recommended going with vendor B.',
    confidence: 0.7,
    excerpt: 'Jason: Ravi recommended going with vendor B.',
  },
  {
    // A model's paraphrase drops the hedge; the excerpt keeps it.
    id: 'd-model',
    description: 'Go with vendor B',
    confidence: 0.5,
    excerpt: "Ravi Menon: I'd suggest we go with vendor B.",
  },
]

let rows: Row[] = ROWS
let updates: { table: string; patch: Record<string, unknown>; id: unknown }[] = []

function database() {
  return {
    from(table: string) {
      let patch: Record<string, unknown> | null = null
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Record<string, unknown>) => {
          patch = p
          return chain
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => ({ data: table === 'interactions' ? CONVERSATION : null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (patch) {
            updates.push({ table, patch, id: filters.id })
            return resolve({ error: null })
          }
          if (table === 'decisions') return resolve({ data: rows })
          return resolve({ data: [], count: 0 })
        },
      }
      return chain
    },
  }
}

vi.mock('@/lib/mobile/route', async () => {
  const real = await vi.importActual<typeof import('@/lib/mobile/route')>('@/lib/mobile/route')
  return {
    ...real,
    mobileContext: async () => ({
      ok: true,
      user: USER,
      profile: { id: USER.id },
      timeZone: 'America/Chicago',
      supabase: database(),
    }),
  }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => database() }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => USER, getProfile: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/conversations/process', () => ({
  processConversation: vi.fn(),
  touchPeopleWindows: vi.fn(),
}))
vi.mock('@/lib/sources/document', () => ({ extractDocument: vi.fn() }))

const route = await import('./[id]/review/route')
const params = { params: Promise.resolve({ id: CONVERSATION.id }) }

async function review() {
  const res = await route.GET(new Request('https://x/api'), params)
  return (await res.json()) as {
    decisions: { id: string; likely: boolean; proposed?: boolean }[]
  }
}

async function keep(keepDecisions: string[]) {
  const res = await route.POST(
    new Request('https://x/api', {
      method: 'POST',
      body: JSON.stringify({ keepLoops: [], keepDecisions }),
    }),
    params,
  )
  expect(res.status).toBe(200)
  return updates
    .filter((u) => u.table === 'decisions')
    .map((u) => [u.id, u.patch.review_status] as const)
}

beforeEach(() => {
  rows = ROWS
  updates = []
})

describe('what the phone is shown', () => {
  it('starts only the clear decision ticked, and marks every proposal as proposed', async () => {
    const { decisions } = await review()
    expect(decisions.map((d) => [d.id, d.likely, d.proposed])).toEqual([
      ['d-decided', true, false],
      ['d-suggested', false, true],
      ['d-legacy', false, true],
      ['d-model', false, true],
    ])
  })
})

describe('keeping the defaults', () => {
  it('confirms only the clear decision and sets every proposal aside', async () => {
    const { decisions } = await review()
    const defaults = decisions.filter((d) => d.likely).map((d) => d.id)
    expect(await keep(defaults)).toEqual([
      ['d-decided', 'confirmed'],
      ['d-suggested', 'rejected'],
      ['d-legacy', 'rejected'],
      ['d-model', 'rejected'],
    ])
  })
})

describe('the user still decides', () => {
  it('a proposal the user chooses to keep is kept', async () => {
    expect(await keep(['d-decided', 'd-suggested'])).toEqual([
      ['d-decided', 'confirmed'],
      ['d-suggested', 'confirmed'],
      ['d-legacy', 'rejected'],
      ['d-model', 'rejected'],
    ])
  })
})

describe('every kind of proposal, stored as confidently as a decision', () => {
  // All at 0.9, as a model that got them wrong would leave them. The server
  // reads the words, so the confidence alone never pre-ticks them.
  const KINDS: [string, string][] = [
    ['suggestion', "I'd suggest going with vendor B."],
    ['recommendation', 'Ravi recommended going with vendor B.'],
    ['hypothetical', 'What if we moved the launch to March?'],
    ['condition', 'If the launch moves to March, marketing needs a new date.'],
    ['open question', 'Should we go with vendor B?'],
    ['not decided yet', "We haven't decided on the vendor yet."],
  ]

  beforeEach(() => {
    rows = [
      {
        id: 'd-reasoned',
        description: 'Go with vendor B',
        confidence: 0.9,
        excerpt: 'We agreed to go with vendor B because it could scale.',
      },
      ...KINDS.map(([kind, words]) => ({
        id: `d-${kind}`,
        description: words,
        confidence: 0.9,
        excerpt: words,
      })),
    ]
  })

  it('only the settled decision is likely; every proposal is marked proposed', async () => {
    const { decisions } = await review()
    expect(decisions.map((d) => [d.id, d.likely, d.proposed])).toEqual([
      ['d-reasoned', true, false],
      ...KINDS.map(([kind]) => [`d-${kind}`, false, true]),
    ])
  })

  it('keeping the defaults confirms only the settled decision', async () => {
    const { decisions } = await review()
    const confirmed = (await keep(decisions.filter((d) => d.likely).map((d) => d.id)))
      .filter(([, status]) => status === 'confirmed')
      .map(([id]) => id)
    expect(confirmed).toEqual(['d-reasoned'])
  })
})
