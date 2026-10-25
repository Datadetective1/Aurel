import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { PersonResponse, ResearchResponse, ResearchSource, RunResearchResponse } from '@atturel/web/lib/mobile/contracts'
import { ThemeProvider } from '../theme'

/**
 * SEARCHING YOUR PEOPLE, AND LOOKING ONE OF THEM UP
 * =============================================================================
 * People search asks the web's search, over your own saved people, and says
 * when it falls back to what is on the phone. Public research is a separate
 * screen that never searches on its own: only its button runs it, and only
 * "This is them" adds a page's facts to the record.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: false },
}))
jest.mock('~/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}))
let mockParams: Record<string, string> = {}
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {} }),
  Stack: { Screen: () => null },
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))
jest.mock('~/lib/photo', () => ({ pickPhoto: jest.fn(), photoForm: () => new FormData() }))

const People = require('../app/(tabs)/people').default as React.ComponentType
const Research = require('../app/research/[id]').default as React.ComponentType
const Person = require('../app/person/[id]').default as React.ComponentType

type Route = { method?: string; path: string; reply: () => Promise<Response> }
let routes: Route[] = []
let fetchMock: jest.Mock
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const offline = () => Promise.reject(new TypeError('Network request failed'))
const on = (path: string, reply: () => Promise<Response>, method = 'GET') => routes.push({ method, path, reply })
const asked = (method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => url === `https://www.atturel.com${path}` && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
const bodyOf = (method: string, path: string) => JSON.parse(String((asked(method, path)[0]![1] as RequestInit).body))

beforeEach(() => {
  routes = []
  mockPush.mockClear()
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => `https://www.atturel.com${r.path}` === url && r.method === method)
    return route ? route.reply() : Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as Response)
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const wrap = (node: React.ReactNode) => <ThemeProvider force="pearl">{node}</ThemeProvider>
const summary = (id: string, name: string, company: string | null) => ({
  id, name, fullName: name, src: null, title: null, company, companyDomain: null, context: 'Peer', relationshipLabel: 'Peer',
  lastInteractionAt: null, openLoops: 0, owe: 0, isDemo: false,
})

describe('People search', () => {
  beforeEach(() => {
    on('/api/mobile/people', () => ok({ timeZone: 'UTC', people: [summary('p-dana', 'Dana Whitfield', 'Northwind'), summary('p-sam', 'Sam Ortiz', null)] }))
    on('/api/mobile/people?archived=1', () => ok({ people: [] }))
  })

  it('asks the web’s search, and shows someone saved beyond what the list carries', async () => {
    on('/api/mobile/people?q=zed', () => ok({ timeZone: 'UTC', people: [summary('p-zed', 'Zed Amari', 'Halcyon')] }))
    await render(wrap(<People />))
    await screen.findByText('Dana Whitfield')
    await fireEvent.changeText(screen.getByLabelText('Search your people'), 'zed')

    expect(await screen.findByText('Zed Amari')).toBeTruthy()
    expect(asked('GET', '/api/mobile/people?q=zed')).toHaveLength(1)
    expect(screen.getByText(/Only the people you have saved/)).toBeTruthy()
    // Searching your people is never public research.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/research'))).toBe(false)
  })

  it('offline, keeps the matches on the phone and says so', async () => {
    on('/api/mobile/people?q=north', offline)
    await render(wrap(<People />))
    await screen.findByText('Dana Whitfield')
    await fireEvent.changeText(screen.getByLabelText('Search your people'), 'north')

    expect(await screen.findByText(/Could not reach Atturel to search everyone/)).toBeTruthy()
    expect(screen.getByText('Dana Whitfield')).toBeTruthy()
    expect(screen.queryByText('Sam Ortiz')).toBeNull()
  })
})

const REVIEW: ResearchResponse = {
  person: { id: 'p-1', name: 'Dana', fullName: 'Dana Whitfield', organization: 'Northwind', jobTitle: 'VP Sales', hasProfileUrl: false },
  canDiscover: true,
  hint: null,
  lastResearchedAt: null,
  sources: [],
  notUsed: 0,
}
const WAITING: ResearchSource = {
  id: 'src-1',
  title: 'Leadership | Northwind',
  url: 'https://northwind.example/team',
  host: 'northwind.example',
  publisher: 'Northwind',
  publishedAt: null,
  state: 'waiting',
  match: 'strong',
  why: 'Matched because their name is in the page title and it is published by Northwind.',
  nameExcerpt: 'Our sales team is led by Dana Whitfield.',
  reviewed: false,
  facts: [{ id: 'src-1:0', kind: 'current_role', label: 'Role', value: 'VP Sales', detail: null, evidence: 'observed', excerpt: 'led by Dana Whitfield', current: true }],
  proposals: 0,
}
const ran = (over: Partial<RunResearchResponse> = {}): RunResearchResponse => ({
  ...REVIEW,
  sources: [WAITING],
  lastResearchedAt: '2026-10-25T00:00:00Z',
  notUsed: 3,
  outcome: { ok: true, message: 'Reviewed 4 sources. 1 may be about Dana Whitfield.', missing: null },
  ...over,
})

describe('Public footprint', () => {
  beforeEach(() => {
    mockParams = { id: 'p-1' }
    on('/api/mobile/people/p-1/research', () => ok(REVIEW))
  })

  it('opening it never searches', async () => {
    await render(wrap(<Research />))
    expect(await screen.findByText('Research public footprint')).toBeTruthy()
    expect(screen.getByText(/Nothing is added to Dana's record until you say a page is them/)).toBeTruthy()
    expect(asked('POST', '/api/mobile/people/p-1/research')).toHaveLength(0)
  })

  it('the button searches, and every page found waits with its reasons and evidence', async () => {
    on('/api/mobile/people/p-1/research', () => ok(ran()), 'POST')
    await render(wrap(<Research />))
    await fireEvent.press(await screen.findByText('Research public footprint'))

    expect(await screen.findByText('Looks like them')).toBeTruthy()
    expect(asked('POST', '/api/mobile/people/p-1/research')).toHaveLength(1)
    expect(screen.getByText(WAITING.why)).toBeTruthy()
    expect(screen.getByText('“Our sales team is led by Dana Whitfield.”')).toBeTruthy()
    expect(screen.getByText('If it is Dana, this adds:')).toBeTruthy()
    expect(screen.getByText(/Observed ·/)).toBeTruthy()
    // Found is not kept: nothing is shown as in the record yet.
    expect(screen.queryByText("In Dana's record")).toBeNull()
    expect(screen.queryByText(/Confirmed/)).toBeNull()
  })

  it('"This is them" adds the page to the record and says what was added', async () => {
    on('/api/mobile/people/p-1/research', () => ok(ran()), 'POST')
    on('/api/mobile/people/p-1/sources/src-1', () =>
      ok({ ok: true, factsAdded: 1, research: { ...REVIEW, sources: [{ ...WAITING, state: 'kept', match: null, why: 'You confirmed this is them.', reviewed: true }] } }),
      'POST',
    )
    await render(wrap(<Research />))
    await fireEvent.press(await screen.findByText('Research public footprint'))
    await fireEvent.press(await screen.findByText('This is them'))

    expect(await screen.findByText("In Dana's record")).toBeTruthy()
    expect(bodyOf('POST', '/api/mobile/people/p-1/sources/src-1')).toEqual({ decision: 'confirm' })
    expect(screen.getByText("Added 1 fact to Dana's record.")).toBeTruthy()
  })

  it('"Not them" sets the page aside and adds nothing', async () => {
    on('/api/mobile/people/p-1/research', () => ok(ran()), 'POST')
    on('/api/mobile/people/p-1/sources/src-1', () =>
      ok({ ok: true, factsAdded: 0, research: { ...REVIEW, sources: [{ ...WAITING, state: 'rejected', match: null, why: 'You said this is someone else.', facts: [], reviewed: true }] } }),
      'POST',
    )
    await render(wrap(<Research />))
    await fireEvent.press(await screen.findByText('Research public footprint'))
    await fireEvent.press(await screen.findByText('Not them'))

    expect(await screen.findByText('Marked as someone else')).toBeTruthy()
    expect(bodyOf('POST', '/api/mobile/people/p-1/sources/src-1')).toEqual({ decision: 'reject' })
  })

  it('when it cannot tell who they are, it says what would help, and editing does not search', async () => {
    on(
      '/api/mobile/people/p-1/research',
      () => ok(ran({ sources: [], outcome: { ok: false, message: "I couldn't confidently identify Dana Whitfield.", missing: ['jobTitle', 'profileUrl'] } })),
      'POST',
    )
    await render(wrap(<Research />))
    await fireEvent.press(await screen.findByText('Research public footprint'))

    expect(await screen.findByText("I couldn't confidently identify Dana Whitfield.")).toBeTruthy()
    expect(screen.getByText(/Adding their role or a profile link helps.*Saving it does not start a search\./)).toBeTruthy()
    await fireEvent.press(screen.getByText('Edit details'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/edit-person/[id]', params: { id: 'p-1' } })
  })
})

describe('A person’s page', () => {
  const personBody = async (isDemo: boolean): Promise<PersonResponse> => {
    const { previewResponse } = require('../lib/preview-data') as typeof import('../lib/preview-data')
    const body = await previewResponse<PersonResponse>('/api/mobile/people/p-1', {})
    return { ...body, person: { ...body.person, id: 'p-1', isDemo } }
  }

  it('offers research as its own step, and opening it does not search', async () => {
    mockParams = { id: 'p-1' }
    const body = await personBody(false)
    on('/api/mobile/people/p-1', () => ok(body))
    await render(wrap(<Person />))
    await fireEvent.press(await screen.findByText('Research public footprint'))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/research/[id]', params: { id: 'p-1' } })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/research'))).toBe(false)
  })

  it('a sample person cannot be researched', async () => {
    mockParams = { id: 'p-1' }
    const body = await personBody(true)
    on('/api/mobile/people/p-1', () => ok(body))
    await render(wrap(<Person />))
    expect(await screen.findByText('Sample people are invented, so there is nothing public to find.')).toBeTruthy()
    expect(screen.queryByText('Research public footprint')).toBeNull()
  })
})
