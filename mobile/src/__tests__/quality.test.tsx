import * as React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../theme'

/**
 * PHASE 2C: WHAT A SCREEN SHOWS WHEN THE NETWORK DOES NOT COOPERATE
 * =============================================================================
 * Finding 9.1: a failed silent refresh replaced a loaded screen with "You are
 * offline". And a recording kept on the phone was not mentioned when Today
 * itself could not load, though it never depended on the server.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: {
    apiUrl: 'https://www.atturel.com',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon',
    previewData: false,
  },
}))
jest.mock('~/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  },
}))
let mockParams: Record<string, string> = {}
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('expo-audio', () => ({
  AudioQuality: { MEDIUM: 64 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
}))

let mockPending: unknown = null
jest.mock('~/lib/pending-store', () => ({
  pendingStore: () => ({ load: () => mockPending }),
  previewPartUri: () => 'file:///preview.m4a',
}))

const { useApi } = require('../lib/api') as typeof import('../lib/api')
const Today = require('../app/(tabs)/index').default as React.ComponentType
const Meeting = require('../app/meeting/[id]').default as React.ComponentType
const { NewPerson } =
  require('../components/people-picker') as typeof import('../components/people-picker')

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const offline = () => Promise.reject(new TypeError('Network request failed'))

let fetchMock: jest.Mock
beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  mockPending = null
  mockParams = {}
  mockPush.mockClear()
})

const status = (code: number, body: unknown) =>
  Promise.resolve({ ok: code < 300, status: code, json: async () => body } as Response)

describe('a loaded screen whose refresh fails', () => {
  it('keeps what it loaded, and says the refresh failed', async () => {
    fetchMock.mockImplementationOnce(() => ok({ name: 'Dana' }))
    const { result } = await renderHook(() => useApi<{ name: string }>('/api/mobile/people/p1'))
    await waitFor(() => expect(result.current.data).toEqual({ name: 'Dana' }))

    fetchMock.mockImplementationOnce(offline)
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.data).toEqual({ name: 'Dana' })
    expect(result.current.error).toBeNull()
    expect(result.current.stale).toEqual({ kind: 'offline' })

    // The next refresh that works clears the note.
    fetchMock.mockImplementationOnce(() => ok({ name: 'Dana W.' }))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.stale).toBeNull()
    expect(result.current.data).toEqual({ name: 'Dana W.' })
  })

  it('with nothing loaded yet, it is an error to show', async () => {
    fetchMock.mockImplementationOnce(offline)
    const { result } = await renderHook(() => useApi('/api/mobile/today'))
    await waitFor(() => expect(result.current.error).toEqual({ kind: 'offline' }))
    expect(result.current.data).toBeNull()
    expect(result.current.stale).toBeNull()
  })

  it('never shows one person’s record on another’s screen, even while the next loads', async () => {
    fetchMock.mockImplementationOnce(() => ok({ name: 'Dana' }))
    let finish: (v: Response) => void = () => {}
    const { result, rerender } = await renderHook(
      ({ path }: { path: string }) => useApi<{ name: string }>(path),
      {
        initialProps: { path: '/api/mobile/people/p1' },
      },
    )
    await waitFor(() => expect(result.current.data).toEqual({ name: 'Dana' }))

    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
    await rerender({ path: '/api/mobile/people/p2' })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => {
      finish({ ok: true, status: 200, json: async () => ({ name: 'Marcus' }) } as Response)
    })
    await waitFor(() => expect(result.current.data).toEqual({ name: 'Marcus' }))
  })

  it('an answer for a screen already left is dropped', async () => {
    let finish: (v: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
    fetchMock.mockImplementationOnce(() => ok({ name: 'Marcus' }))
    const { result, rerender } = await renderHook(
      ({ path }: { path: string }) => useApi<{ name: string }>(path),
      {
        initialProps: { path: '/api/mobile/people/p1' },
      },
    )
    await rerender({ path: '/api/mobile/people/p2' })
    await waitFor(() => expect(result.current.data).toEqual({ name: 'Marcus' }))
    await act(async () => {
      finish({ ok: true, status: 200, json: async () => ({ name: 'Dana' }) } as Response)
    })
    expect(result.current.data).toEqual({ name: 'Marcus' })
  })
})

describe('Today, offline, with a recording kept on the phone', () => {
  it('still says the recording is safe and waiting', async () => {
    mockPending = {
      id: 'cap-1',
      startedAt: '2026-10-25T09:00:00Z',
      mode: 'voice_note',
      meetingId: null,
      personId: null,
      consent: false,
      parts: [{ uri: 'file:///Documents/ExpoAudio/a.m4a', seconds: 95 }],
      current: null,
      bookmarks: [],
      done: false,
    }
    fetchMock.mockImplementation(offline)
    await render(
      <ThemeProvider force="pearl">
        <Today />
      </ThemeProvider>,
    )
    expect(await screen.findByText('You are offline')).toBeTruthy()
    expect(screen.getByText(/A 1:35 recording has not been sent yet/)).toBeTruthy()
    expect(screen.getByText('Open it in Capture')).toBeTruthy()
  })
})

describe('adding someone who is probably already on record', () => {
  const show = async (props: Partial<React.ComponentProps<typeof NewPerson>> = {}) => {
    const onAdded = jest.fn()
    const onExisting = jest.fn()
    await render(
      <ThemeProvider force="pearl">
        <NewPerson
          initialName="Dana Whitfield"
          onCancel={() => {}}
          onAdded={onAdded}
          onExisting={onExisting}
          {...props}
        />
      </ThemeProvider>,
    )
    return { onAdded, onExisting }
  }
  const duplicate = (archived: boolean) =>
    status(409, {
      ok: false,
      error: 'You may already have this person.',
      duplicate: {
        id: 'p-old',
        name: 'Dana Whitfield',
        organization: 'Northwind',
        archived,
        reason: 'name',
      },
    })

  it('says who it might be, and adds someone new only when asked', async () => {
    fetchMock.mockImplementationOnce(() => duplicate(false))
    fetchMock.mockImplementationOnce(() => status(201, { ok: true, personId: 'p-new' }))
    const { onAdded } = await show()

    await fireEvent.press(screen.getByLabelText('Add'))
    expect(
      await screen.findByText('You already have Dana Whitfield (Northwind). Same name.'),
    ).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      fullName: 'Dana Whitfield',
      checkDuplicate: true,
    })
    expect(onAdded).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByLabelText('Add as someone new'))
    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-new' })),
    )
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
      checkDuplicate: true,
      confirmDuplicate: true,
    })
  })

  it('an archived match is restored, then used', async () => {
    fetchMock.mockImplementationOnce(() => duplicate(true))
    fetchMock.mockImplementationOnce(() => status(200, { ok: true }))
    const { onExisting, onAdded } = await show()

    await fireEvent.press(screen.getByLabelText('Add'))
    expect(await screen.findByText(/removed from your people\. Same name\./)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Restore Dana'))
    await waitFor(() =>
      expect(onExisting).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-old' })),
    )
    expect(fetchMock.mock.calls[1]![0]).toBe(
      'https://www.atturel.com/api/mobile/people/p-old/restore',
    )
    expect(onAdded).not.toHaveBeenCalled()
  })
})

describe('a meeting with someone since removed', () => {
  it('shows them, marked archived, and opens their archived page', async () => {
    const { previewResponse } =
      require('../lib/preview-data') as typeof import('../lib/preview-data')
    const meeting = await previewResponse<
      import('@atturel/web/lib/mobile/contracts').MeetingResponse
    >('/api/mobile/meetings/m-1', {})
    const people = [
      meeting.people[0]!,
      {
        ...meeting.people[0]!,
        id: 'p-gone',
        name: 'Rhea Okafor',
        fullName: 'Rhea Okafor',
        archived: true,
        context: 'Archived',
      },
    ]
    fetchMock.mockImplementation(() => status(200, { ...meeting, people }))
    mockParams = { id: 'm-1' }
    await render(
      <ThemeProvider force="pearl">
        <Meeting />
      </ThemeProvider>,
    )
    const rhea = await screen.findByLabelText('Rhea Okafor, archived, open their page')
    expect(screen.getByText('Archived')).toBeTruthy()
    await fireEvent.press(rhea)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/archived/[id]', params: { id: 'p-gone' } })
  })
})

describe('Ask, opened with a question', () => {
  const expoRouter = require('expo-router') as {
    router: { setParams: jest.Mock }
    useFocusEffect: jest.Mock
  }
  const Ask = require('../app/(tabs)/ask').default as React.ComponentType
  beforeEach(() => {
    // Run the focus effect as a plain effect: each render is a visit.
    expoRouter.useFocusEffect.mockImplementation((effect: () => void) =>
      React.useEffect(effect, [effect]),
    )
    expoRouter.router.setParams.mockClear()
  })
  afterEach(() => expoRouter.useFocusEffect.mockReset())

  const show = () =>
    render(
      <ThemeProvider force="pearl">
        <Ask />
      </ThemeProvider>,
    )

  it('fills in the question, then takes it off the route', async () => {
    mockParams = { q: 'What should I know about Dana?' }
    await show()
    expect(screen.getByLabelText('Your question').props.value).toBe(
      'What should I know about Dana?',
    )
    expect(expoRouter.router.setParams).toHaveBeenCalledWith({ q: undefined })
  })

  it('a later visit with another question replaces the first', async () => {
    mockParams = { q: 'What do I owe Marcus?' }
    const view = await show()
    mockParams = { q: 'When did I last speak with Dana?' }
    await view.rerender(
      <ThemeProvider force="pearl">
        <Ask />
      </ThemeProvider>,
    )
    expect(screen.getByLabelText('Your question').props.value).toBe(
      'When did I last speak with Dana?',
    )
  })

  it('a visit from the tab bar leaves the field empty', async () => {
    await show()
    expect(screen.getByLabelText('Your question').props.value).toBe('')
    expect(expoRouter.router.setParams).not.toHaveBeenCalled()
  })
})
