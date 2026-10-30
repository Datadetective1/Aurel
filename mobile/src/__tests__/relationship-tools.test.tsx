import * as React from 'react'
import { Share } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../theme'

/**
 * THE RELATIONSHIP TOOLS, ON SCREEN
 * =============================================================================
 * What is owed and going stale, who is going cold, the warm path, the
 * handoff pack and the card scan, rendered from the preview record on the
 * iPhone's engine. The scan is the one that writes: it must show what it
 * read for checking, and save nothing until Add.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: true },
}))

let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///card.jpg', width: 3000, height: 2000 }] })),
}))
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: () => ({ resize: jest.fn(), renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///card-small.jpg' }) }) }),
  },
  SaveFormat: { JPEG: 'jpeg' },
}))
jest.mock('expo-file-system', () => ({ File: class {} }))
const mockExtract = jest.fn(async () => ['NORTHWIND LABS INC.', 'Maya Chen', 'Director of Operations', 'maya.chen@northwind.example', 'Mobile: +1 214 555 0182'])
jest.mock('expo-text-extractor', () => ({ isSupported: true, extractTextFromImage: (...a: unknown[]) => mockExtract(...(a as [])) }))

import { router as mockRouter } from 'expo-router'
import Owed from '../app/owed'
import Today from '../app/(tabs)/index'
import Person from '../app/person/[id]'
import Handoff from '../app/handoff/[id]'
import Scan from '../app/scan'

const show = async (ui: React.ReactElement) => await render(<ThemeProvider force="pearl">{ui}</ThemeProvider>)

describe('everything owed', () => {
  it('splits both directions and says how close each is to going stale', async () => {
    await show(<Owed />)
    expect(await screen.findByText('You owe')).toBeTruthy()
    expect(screen.getByText('Owed to you')).toBeTruthy()
    expect(screen.getByText('Still to settle')).toBeTruthy()
    expect(screen.getByText(/Overdue by 1 day/)).toBeTruthy()
    expect(screen.getByText(/2 are overdue or close to going stale/)).toBeTruthy()
  })

  it('Today leads to it, and says what needs a look', async () => {
    await show(<Today />)
    expect(await screen.findByText('Everything owed')).toBeTruthy()
    expect(await screen.findByText(/2 need a look before they go stale/)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(/^Everything owed/))
    expect(mockRouter.push).toHaveBeenCalledWith('/owed')
  })
})

describe('going cold', () => {
  it('names the quiet relationship and a reason to write, labelled inferred', async () => {
    await show(<Today />)
    expect(await screen.findByText('Going cold')).toBeTruthy()
    expect(screen.getByText('No contact in 4 weeks')).toBeTruthy()
    expect(screen.getByText(/Asking how it went is an easy way back in/)).toBeTruthy()
    expect(screen.getByText('Inferred from public sources')).toBeTruthy()
  })
})

describe('warm path', () => {
  it('shows who could introduce you, from what is on record', async () => {
    mockParams = { id: 'p-jonathan' }
    await show(<Person />)
    expect(await screen.findByText('Warm path')).toBeTruthy()
    expect(screen.getByText('Both studied at University of Toronto')).toBeTruthy()
  })
})

describe('handoff pack', () => {
  it('shows the whole brief before sharing, notes off until asked', async () => {
    mockParams = { id: 'p-columbus' }
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    await show(<Handoff />)
    expect(await screen.findByText(/HANDOFF: COLUMBUS BROWN/)).toBeTruthy()
    expect(screen.queryByText(/Prefers a short agenda/)).toBeNull()

    fireEvent(screen.getByLabelText('Include my notes'), 'valueChange', true)
    expect(await screen.findByText(/Prefers a short agenda/)).toBeTruthy()

    await fireEvent.press(screen.getByText('Share'))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Handoff: Columbus Brown' }))
  })
})

describe('card and badge scan', () => {
  beforeEach(() => (mockRouter.replace as jest.Mock).mockReset())

  it('reads the photo on the phone, fills the fields to check, and saves only on Add', async () => {
    await show(<Scan />)
    await fireEvent.press(screen.getByText('Choose a photo'))
    expect(await screen.findByDisplayValue('Maya Chen')).toBeTruthy()
    expect(screen.getByDisplayValue('NORTHWIND LABS INC.')).toBeTruthy()
    expect(screen.getByDisplayValue('Director of Operations')).toBeTruthy()
    expect(screen.getByDisplayValue('maya.chen@northwind.example')).toBeTruthy()
    expect(screen.getByDisplayValue('Phone: +1 214 555 0182')).toBeTruthy()
    expect(mockExtract).toHaveBeenCalledWith('file:///card-small.jpg')
    expect(mockRouter.replace).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByText('Add'))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled())
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/person/[id]', params: { id: 'p-columbus' } })
  })

  it('says so plainly when nothing could be read', async () => {
    mockExtract.mockResolvedValueOnce([])
    await show(<Scan />)
    await fireEvent.press(screen.getByText('Choose a photo'))
    expect(await screen.findByText(/No text could be read from that photo/)).toBeTruthy()
  })
})
