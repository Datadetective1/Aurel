import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

/**
 * Session storage for Supabase auth, in the iOS Keychain.
 *
 * SecureStore values are limited to about 2 KB and a Supabase session can be
 * larger, so values are split into chunks under numbered keys. On the web
 * preview build there is no Keychain; sessions live in memory only, which is
 * the honest choice for a preview.
 */

const CHUNK = 1800
const memory = new Map<string, string>()
const native = Platform.OS === 'ios' || Platform.OS === 'android'

function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_')
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!native) return memory.get(key) ?? null
    const base = safeKey(key)
    const count = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0')
    if (!count) return null
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`)
      if (part === null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!native) {
      memory.set(key, value)
      return
    }
    const base = safeKey(key)
    await secureStorage.removeItem(key)
    const count = Math.ceil(value.length / CHUNK)
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      })
    }
    await SecureStore.setItemAsync(`${base}.n`, String(count))
  },
  async removeItem(key: string): Promise<void> {
    if (!native) {
      memory.delete(key)
      return
    }
    const base = safeKey(key)
    const count = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0')
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${base}.${i}`)
    await SecureStore.deleteItemAsync(`${base}.n`)
  },
}
