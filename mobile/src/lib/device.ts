import { Platform } from 'react-native'

/**
 * The words for the device the app runs on, so a sentence on Android never
 * says "iPhone". iOS wording is unchanged.
 */

const android = Platform.OS === 'android'

/** "iPhone" on iOS, "phone" on Android. */
export const deviceName = android ? 'phone' : 'iPhone'

/** Where the person turns the microphone back on. */
export const microphoneSettings = android
  ? 'Settings › Apps › Atturel › Permissions › Microphone'
  : 'Settings › Atturel › Microphone'

/** What took the microphone away, in this platform's terms. */
export const microphoneTakenBy = android ? 'a call or another app' : 'a call, Siri or another app'

/** The browser a link opens in. */
export const browserName = android ? 'your browser' : 'Safari'
