import 'react-native-url-polyfill/auto'
import { AppState, Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { config } from './config'
import { secureStorage } from './secure-storage'

/**
 * Supabase, for authentication only.
 *
 * The app signs in with the same Supabase project as the web -- one identity
 * system -- and then reads everything through Atturel's own /api/mobile
 * routes with the access token, so business rules live in one backend. It
 * does not query tables directly.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Refresh only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}
