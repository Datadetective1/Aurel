import * as React from 'react'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native'
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
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: false },
}))
jest.mock('~/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))

let mockPending: unknown = null
jest.mock('~/lib/pending-store', () => ({
  pendingStore: () => ({ load: () => mockPending }),
  previewPartUri: () => 'file:///preview.m4a',
}))

const { useApi } = require('../lib/api') as typeof import('../lib/api')
const Today = require('../app/(tabs)/index').default as React.ComponentType

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
const offline = () => Promise.reject(new TypeError('Network request failed'))

let fetchMock: jest.Mock
beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  mockPending = null
})

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
    const { result, rerender } = await renderHook(({ path }) => useApi<{ name: string }>(path), {
      initialProps: { path: '/api/mobile/people/p1' },
    })
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
    const { result, rerender } = await renderHook(({ path }) => useApi<{ name: string }>(path), {
      initialProps: { path: '/api/mobile/people/p1' },
    })
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
