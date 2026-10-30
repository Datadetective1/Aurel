import * as React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { Gloock_400Regular } from '@expo-google-fonts/gloock'
import {
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
} from '@expo-google-fonts/schibsted-grotesk'
import { AuthProvider, useAuth } from '~/lib/auth'
import { IntroGateProvider, useIntroGate } from '~/lib/intro-gate'
import { fonts, ThemeProvider, useTheme } from '~/theme'

void SplashScreen.preventAutoHideAsync().catch(() => {})

function Navigator() {
  const { state } = useAuth()
  const intro = useIntroGate()
  const { c, name } = useTheme()
  const loading = state.status === 'loading' || intro.seen === null

  React.useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => {})
  }, [loading])

  if (loading) return null
  // A new install sees how Atturel works first, signed in or not.
  const introduced = intro.seen === true
  const signedIn = state.status === 'signed_in'
  const ready = introduced && signedIn && state.onboarded
  const settingUp = introduced && signedIn && !state.onboarded

  return (
    <>
      <StatusBar style={name === 'obsidian' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.ink,
          headerTitleStyle: { fontFamily: fonts.sansMedium, color: c.ink },
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
          <Stack.Screen name="how-it-works" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!introduced}>
          <Stack.Screen name="intro" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={settingUp}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={introduced && !signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ title: '', headerTransparent: true }} />
        </Stack.Protected>
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Gloock_400Regular,
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
  })
  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <IntroGateProvider>
            <Navigator />
          </IntroGateProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
