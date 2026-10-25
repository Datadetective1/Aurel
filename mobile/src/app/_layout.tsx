import * as React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans'
import { AuthProvider, useAuth } from '~/lib/auth'
import { ThemeProvider, useTheme } from '~/theme'

void SplashScreen.preventAutoHideAsync().catch(() => {})

function Navigator() {
  const { state } = useAuth()
  const { c, name } = useTheme()

  React.useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync().catch(() => {})
  }, [state.status])

  if (state.status === 'loading') return null
  const signedIn = state.status === 'signed_in'
  const ready = signedIn && state.onboarded
  const settingUp = signedIn && !state.onboarded

  return (
    <>
      <StatusBar style={name === 'obsidian' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.ink,
          headerTitleStyle: { fontFamily: 'InstrumentSans_500Medium', color: c.ink },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="meeting/[id]" options={{ title: '' }} />
          <Stack.Screen name="meeting/new" options={{ title: 'New meeting', presentation: 'modal' }} />
          <Stack.Screen name="person/[id]" options={{ title: '' }} />
          <Stack.Screen name="review/[id]" options={{ title: 'What happened', presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile', presentation: 'modal' }} />
          <Stack.Screen name="edit-person/[id]" options={{ title: 'Edit', presentation: 'modal' }} />
          <Stack.Screen name="archived/index" options={{ title: 'Archived' }} />
          <Stack.Screen name="archived/[id]" options={{ title: '' }} />
          <Stack.Screen name="research/[id]" options={{ title: 'Public footprint' }} />
        </Stack.Protected>
        <Stack.Protected guard={settingUp}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ title: '', headerTransparent: true }} />
        </Stack.Protected>
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })
  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Navigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
