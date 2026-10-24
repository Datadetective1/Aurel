import * as React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ThemeProvider } from '../theme'
import People from '../app/(tabs)/people'
import Today from '../app/(tabs)/index'
import Atlas from '../app/(tabs)/atlas'
import Person from '../app/person/[id]'
import Meeting from '../app/meeting/[id]'

/**
 * TestFlight 0.1.0 (1) crashed on People, then on Today once it had loops with
 * due dates: "Last spoke 6 weeks ago" and "due in 3 days" went through
 * Intl.RelativeTimeFormat, which Hermes does not have. jest.hermes-intl.js
 * gives these tests the iPhone's Intl, and the preview data has exactly those
 * dates (people last spoken to 3 to 30 days before, loops due on other days),
 * so each screen renders the lines that crashed.
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: true },
}))

let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}))

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))

const show = async (ui: React.ReactElement) => await render(<ThemeProvider force="pearl">{ui}</ThemeProvider>)

describe('screens render on the iPhone engine', () => {
  it('Intl here is the iPhone one: no RelativeTimeFormat', () => {
    expect(typeof (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat).toBe('undefined')
  })

  it('People lists everyone with when they last spoke', async () => {
    await show(<People />)
    expect(await screen.findByText('Columbus Brown')).toBeTruthy()
    expect(screen.getAllByText(/^Last spoke \d+ (days|weeks|months) ago$|^Last spoke (last week|last month)$/).length).toBeGreaterThan(0)
  })

  it('Today shows the open loops with their due days', async () => {
    await show(<Today />)
    expect(await screen.findByText('Open loops')).toBeTruthy()
    expect(screen.getAllByText(/due /).length).toBeGreaterThan(0)
  })

  it('Atlas captions each face with when you last spoke', async () => {
    await show(<Atlas />)
    expect(await screen.findAllByText(/ago$|^Last (week|month)$|^Yesterday$|^Never$/)).toBeTruthy()
  })

  it('a person opens with "Last spoke"', async () => {
    mockParams = { id: 'p-columbus' }
    await show(<Person />)
    expect(await screen.findByText('Last spoke')).toBeTruthy()
  })

  it('a meeting opens with its day and loops', async () => {
    mockParams = { id: 'm-1' }
    await show(<Meeting />)
    expect(await screen.findAllByText(/Prototype review|Today|Tomorrow|ago|In \d/)).toBeTruthy()
  })
})
