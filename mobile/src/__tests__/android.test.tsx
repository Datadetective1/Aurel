import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { chooseLoopAction } from '../components/relationship'
import { pickOnAndroid } from '../lib/pick-time'

/**
 * ANDROID, WHERE IT DIFFERS
 * =============================================================================
 * The same screens run on Android; these are the places the platforms differ.
 * The date and time come from two system dialogs (Android has no combined
 * picker); the loop actions fit Android's three-button dialog; and no
 * sentence on Android says "iPhone". The iOS behaviour is checked alongside,
 * unchanged.
 * =============================================================================
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}))

const realOS = Platform.OS
const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true })

afterEach(() => {
  setOS(realOS)
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

const loop = { id: 'l1', description: 'Send the deck', direction: 'owe' as const, dueOn: null, overdue: false, personId: 'p1', personName: 'Columbus', interactionId: null }

describe('the meeting time on Android', () => {
  const open = DateTimePickerAndroid.open as jest.Mock

  it('asks for the day, then the time, and keeps both', () => {
    const picked = jest.fn()
    const from = new Date('2026-10-27T15:00:00Z')
    pickOnAndroid(from, 'Europe/London', picked)

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toMatchObject({ value: from, mode: 'date', timeZoneName: 'Europe/London' })

    const day = new Date('2026-10-29T15:00:00Z')
    open.mock.calls[0][0].onValueChange({}, day)
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1][0]).toMatchObject({ value: day, mode: 'time', minuteInterval: 5, timeZoneName: 'Europe/London' })
    expect(picked).not.toHaveBeenCalled()

    const at = new Date('2026-10-29T16:30:00Z')
    open.mock.calls[1][0].onValueChange({}, at)
    expect(picked).toHaveBeenCalledWith(at)
  })

  it('never asks for "datetime", which only iOS has', () => {
    pickOnAndroid(new Date(), 'UTC', jest.fn())
    open.mock.calls[0][0].onValueChange({}, new Date())
    expect(open.mock.calls.map((c) => c[0].mode)).toEqual(['date', 'time'])
  })

  it('changes nothing when the day dialog is dismissed', () => {
    const picked = jest.fn()
    pickOnAndroid(new Date(), 'UTC', picked)
    open.mock.calls[0][0].onDismiss?.()
    expect(open).toHaveBeenCalledTimes(1)
    expect(picked).not.toHaveBeenCalled()
  })
})

describe('closing a loop', () => {
  it('on Android, fits the three actions in the dialog; Back keeps it open', () => {
    setOS('android')
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    chooseLoopAction(loop, jest.fn())
    const [title, , buttons, options] = alert.mock.calls[0]!
    expect(title).toBe('Send the deck')
    expect(buttons!.map((b) => b.text)).toEqual(['No longer needed', 'Later', 'Done'])
    expect(options).toEqual({ cancelable: true })
  })

  it('on iOS, still uses the action sheet with Keep open', () => {
    setOS('ios')
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {})
    chooseLoopAction(loop, jest.fn())
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      options: ['Done', 'Later', 'No longer needed', 'Keep open'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
    })
  })
})

describe('the words for the device', () => {
  const load = (os: 'ios' | 'android') => {
    let words: typeof import('../lib/device') | undefined
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: os } }))
      words = require('../lib/device')
    })
    return words!
  }

  it('on Android, say "phone" and the Android settings path', () => {
    const w = load('android')
    expect(w.deviceName).toBe('phone')
    expect(w.microphoneSettings).toBe('Settings › Apps › Atturel › Permissions › Microphone')
    expect(w.microphoneTakenBy).not.toMatch(/Siri/)
    expect(w.browserName).toBe('your browser')
  })

  it('on iOS, are unchanged', () => {
    const w = load('ios')
    expect(w.deviceName).toBe('iPhone')
    expect(w.microphoneSettings).toBe('Settings › Atturel › Microphone')
    expect(w.microphoneTakenBy).toBe('a call, Siri or another app')
    expect(w.browserName).toBe('Safari')
  })
})
