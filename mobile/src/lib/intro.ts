import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

/**
 * Whether this iPhone has been shown how Atturel works. A device setting, not
 * an account one: it is about this install, and it must be readable before
 * anyone signs in. Bump the key when the intro changes enough to show again.
 */
const KEY = 'atturel.intro.v1'
let memory = false
const native = Platform.OS === 'ios' || Platform.OS === 'android'

export async function introSeen(): Promise<boolean> {
  if (!native) return memory
  try {
    return (await SecureStore.getItemAsync(KEY)) === 'seen'
  } catch {
    // Unreadable is not a reason to show the intro on every launch.
    return true
  }
}

export async function markIntroSeen(): Promise<void> {
  memory = true
  if (!native) return
  try {
    await SecureStore.setItemAsync(KEY, 'seen')
  } catch {
    // Shown again next launch at worst.
  }
}
