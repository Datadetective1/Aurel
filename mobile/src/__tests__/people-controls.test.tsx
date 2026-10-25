import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../theme'

/**
 * PHASE 2B: THE PHONE'S PEOPLE AND ACCOUNT CONTROLS
 * =============================================================================
 * Each screen on the preview record (invented people), through the same
 * routes the app calls: what it shows, and that the destructive step cannot
 * be taken without its confirmation.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: {
    apiUrl: 'https://www.atturel.com',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon',
    previewData: true,
  },
}))

let mockParams: Record<string, string> = {}
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
}
jest.mock('expo-router', () => ({
  router: mockRouter,
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {} }),
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

const mockPick = jest.fn(async () => 'file:///cache/photo.jpg' as string | null)
jest.mock('~/lib/photo', () => ({
  pickPhoto: () => mockPick(),
  photoForm: () => new FormData(),
}))

const mockShare = jest.fn(async () => {})
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: (...a: unknown[]) => mockShare(...(a as [])),
}))
const mockWrites: string[] = []
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string
    exists = false
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${String(parts[parts.length - 1])}`
    }
    create() {}
    delete() {}
    write(text: string) {
      mockWrites.push(text)
    }
  },
  Paths: { cache: 'cache', document: 'document' },
}))

const Archived = require('../app/archived/index').default as React.ComponentType
const ArchivedPerson = require('../app/archived/[id]').default as React.ComponentType
const EditPerson = require('../app/edit-person/[id]').default as React.ComponentType
const Person = require('../app/person/[id]').default as React.ComponentType
const Account = require('../app/account').default as React.ComponentType
const Profile = require('../app/profile').default as React.ComponentType

const show = async (ui: React.ReactElement) =>
  await render(<ThemeProvider force="pearl">{ui}</ThemeProvider>)

beforeEach(() => {
  mockParams = {}
  jest.clearAllMocks()
  mockWrites.length = 0
})

describe('People › Archived', () => {
  it('lists who was removed, with Restore', async () => {
    await show(<Archived />)
    expect(await screen.findByText('Rhea Okafor')).toBeTruthy()
    expect(screen.getByText(/Removed /)).toBeTruthy()
    expect(screen.getByLabelText('Restore')).toBeTruthy()
  })

  it('a permanent delete shows what goes and what stays, and waits for the confirmation', async () => {
    mockParams = { id: 'p-archived' }
    await show(<ArchivedPerson />)
    await fireEvent.press(await screen.findByLabelText('Delete permanently…'))

    expect(screen.getByText('Deleted')).toBeTruthy()
    expect(screen.getByText(/2 things you noted about them/)).toBeTruthy()
    expect(screen.getByText('Kept, no longer linked to Rhea')).toBeTruthy()
    expect(screen.getByText(/1 meeting/)).toBeTruthy()
    // The loop that still names her is flagged, with Edit and Delete.
    expect(screen.getByText('Send Rhea the pilot summary')).toBeTruthy()
    expect(screen.getByText('Names them, so it will still identify them.')).toBeTruthy()

    const remove = screen.getByLabelText('Delete permanently')
    expect(remove.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent(screen.getByRole('switch'), 'valueChange', true)
    await waitFor(() =>
      expect(screen.getByLabelText('Delete permanently').props.accessibilityState).toMatchObject({
        disabled: false,
      }),
    )
    await fireEvent.press(screen.getByLabelText('Delete permanently'))
    await waitFor(() =>
      expect(mockRouter.navigate).toHaveBeenCalledWith({
        pathname: '/archived',
        params: { deleted: 'Rhea Okafor' },
      }),
    )
  })
})

describe('one person', () => {
  it('can be corrected, given a photo, or removed', async () => {
    mockParams = { id: 'p-columbus' }
    await show(<Person />)
    expect(await screen.findByLabelText('Edit details')).toBeTruthy()
    expect(screen.getByLabelText('Remove from people')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Add a photo'))
    expect(await screen.findByText('Photo saved. Visible only to you.')).toBeTruthy()
    expect(mockPick).toHaveBeenCalled()
  })

  it('choosing no photo changes nothing', async () => {
    mockParams = { id: 'p-columbus' }
    mockPick.mockResolvedValueOnce(null)
    await show(<Person />)
    await fireEvent.press(await screen.findByLabelText('Add a photo'))
    await waitFor(() => expect(mockPick).toHaveBeenCalled())
    expect(screen.queryByText('Photo saved. Visible only to you.')).toBeNull()
  })

  it('the editor opens on the stored fields and saves them', async () => {
    mockParams = { id: 'p-columbus' }
    await show(<EditPerson />)
    expect(await screen.findByDisplayValue('Columbus Brown')).toBeTruthy()
    expect(screen.getByLabelText('Relationship: A customer')).toBeTruthy()
    expect(screen.getByLabelText('Their time zone: Not set')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
  })
})

describe('Account', () => {
  it('has the profile, email settings, calendar, export and help', async () => {
    await show(<Account />)
    expect(await screen.findByLabelText('Edit profile')).toBeTruthy()
    expect(await screen.findByLabelText('Useful Atturel email')).toBeTruthy()
    expect(screen.getByLabelText('Daily follow-through')).toBeTruthy()
    expect(screen.getByText(/Google Calendar · amary@example.com/)).toBeTruthy()
    expect(screen.getByText(/Atturel does not keep audio/)).toBeTruthy()
    expect(screen.getByLabelText('Export my data')).toBeTruthy()
    expect(screen.getByLabelText('Privacy')).toBeTruthy()
  })

  it('exports the record as a JSON file through the share sheet', async () => {
    await show(<Account />)
    await fireEvent.press(await screen.findByLabelText('Export my data'))
    await waitFor(() => expect(mockShare).toHaveBeenCalled())
    expect(mockWrites[0]).toContain('"preview": true')
    expect(mockShare).toHaveBeenCalledWith(
      expect.stringMatching(/atturel-export-\d{4}-\d{2}-\d{2}\.json$/),
      expect.objectContaining({ mimeType: 'application/json' }),
    )
  })

  it('the profile editor saves and goes back', async () => {
    await show(<Profile />)
    expect(await screen.findByDisplayValue('Amary Coulibaly')).toBeTruthy()
    expect(screen.getByText(/shown only to you/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
  })
})
