import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ReviewResponse } from '@atturel/web/lib/mobile/contracts'
import { ThemeProvider } from '../theme'

/**
 * FINDING 8.7 ON THE IPHONE REVIEW
 * =============================================================================
 * The audit's test conversation as the server reads it: the clear decision
 * starts ticked; each proposal says "Proposed, not decided" and starts
 * unticked -- even one a server marks likely by mistake -- so "Keep" with the
 * defaults sends only the decision.
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
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: 'c-1' }),
  useNavigation: () => ({ addListener: () => () => {} }),
  Stack: { Screen: () => null },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

const REVIEW: ReviewResponse = {
  conversation: {
    id: 'c-1',
    title: 'Launch and vendor',
    occurredAt: '2026-09-10T15:00:00Z',
    summary: null,
    outcome: 'We decided to move the launch to March.',
  },
  processing: 'ready',
  loops: [],
  decisions: [
    {
      id: 'd-decided',
      description: 'We decided to move the launch to March.',
      excerpt: 'Alex Rivera: We decided to move the launch to March.',
      likely: true,
      proposed: false,
    },
    {
      id: 'd-suggested',
      description: "I'd suggest going with vendor B.",
      excerpt: "Ravi Menon: I'd suggest going with vendor B.",
      likely: false,
      proposed: true,
    },
    {
      // A server out of step must not pre-tick a proposal either.
      id: 'd-inconsistent',
      description: 'Ravi recommended going with vendor B.',
      excerpt: 'Jason: Ravi recommended going with vendor B.',
      likely: true,
      proposed: true,
    },
  ],
  memoryProposals: 0,
}

const mockPost = jest.fn(async (_path: string, _body: unknown) => ({ message: 'Kept 1 decision.' }))
jest.mock('~/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { post: (path: string, body: unknown) => mockPost(path, body) },
  useApi: () => ({
    data: REVIEW,
    error: null,
    stale: null,
    loading: false,
    refreshing: false,
    refresh: jest.fn(),
    reload: jest.fn(),
  }),
}))

const Review = require('../app/review/[id]').default as React.ComponentType

const show = async () =>
  await render(
    <ThemeProvider force="pearl">
      <Review />
    </ThemeProvider>,
  )

beforeEach(() => mockPost.mockClear())

describe('decisions and proposals on the iPhone Review', () => {
  it('labels each proposal and counts it apart from decisions', async () => {
    await show()
    expect(screen.getAllByText('Proposed, not decided')).toHaveLength(2)
    expect(screen.getByText('Decisions and proposals')).toBeTruthy()
    expect(screen.getByText('1 decision · 2 proposals')).toBeTruthy()
    expect(
      screen.getByLabelText("I'd suggest going with vendor B., Proposed, not decided"),
    ).toBeTruthy()
  })

  it('starts only the clear decision ticked', async () => {
    await show()
    const state = (label: string) =>
      screen.getByLabelText(label, { exact: false }).props.accessibilityState
    expect(state('We decided to move the launch to March.')).toMatchObject({ checked: true })
    expect(state("I'd suggest going with vendor B.")).toMatchObject({ checked: false })
    expect(state('Ravi recommended going with vendor B.')).toMatchObject({ checked: false })
  })

  it('"Keep" with the defaults sends only the decision', async () => {
    await show()
    await fireEvent.press(screen.getByLabelText('Keep 1'))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost.mock.calls[0]![1]).toEqual({ keepLoops: [], keepDecisions: ['d-decided'] })
  })
})
