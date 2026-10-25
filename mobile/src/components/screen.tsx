import * as React from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { config } from '~/lib/config'
import type { ApiFailure } from '~/lib/api'
import { useAuth } from '~/lib/auth'
import { useTheme } from '~/theme'
import { T } from './text'
import { Button } from './button'

/**
 * A screen: safe-area aware, scrollable, pull to refresh, and honest about
 * where its data came from -- preview data is always labelled.
 */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  topInset = true,
}: {
  children: React.ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  scroll?: boolean
  topInset?: boolean
}) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const padding = { paddingTop: topInset ? insets.top + 8 : 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }
  const banner = config.previewData ? <PreviewBanner /> : null

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.bg }, padding]}>
        {banner}
        {children}
      </View>
    )
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
      // The field being typed in scrolls clear of the keyboard, on every screen.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.accentGraphic} /> : undefined
      }
    >
      {banner}
      {children}
    </ScrollView>
  )
}

function PreviewBanner() {
  const { c } = useTheme()
  return (
    <View
      accessibilityRole="text"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bgSunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12, alignSelf: 'flex-start' }}
    >
      <Feather name="eye" size={12} color={c.inkMuted} />
      <T variant="meta" tone="muted">Preview data — invented people, nothing real</T>
    </View>
  )
}

export function Section({
  label,
  icon,
  children,
  style,
}: {
  label: string
  icon?: React.ComponentProps<typeof Feather>['name']
  children: React.ReactNode
  style?: object
}) {
  const { c } = useTheme()
  return (
    <View style={[{ marginTop: 28 }, style]}>
      <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {icon ? <Feather name={icon} size={13} color={c.accent} /> : null}
        <T variant="label" tone="muted">{label}</T>
      </View>
      {children}
    </View>
  )
}

export function Card({ children, tone = 'surface', style }: { children: React.ReactNode; tone?: 'surface' | 'accent' | 'critical' | 'caution' | 'sunken'; style?: object }) {
  const { c } = useTheme()
  const bg = tone === 'accent' ? c.accentWash : tone === 'critical' ? c.criticalWash : tone === 'caution' ? c.cautionWash : tone === 'sunken' ? c.bgSunken : c.surface
  const border = tone === 'surface' || tone === 'sunken' ? c.line : 'transparent'
  return <View style={[{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 16 }, style]}>{children}</View>
}

/**
 * A refresh that failed while the screen still shows what it loaded before:
 * said quietly, above the content, which stays.
 */
export function StaleNote({ failure }: { failure: ApiFailure | null }) {
  const { c } = useTheme()
  if (!failure) return null
  const offline = failure.kind === 'offline'
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}
    >
      <Feather name={offline ? 'wifi-off' : 'refresh-cw'} size={12} color={c.inkMuted} />
      <T variant="meta" tone="muted">
        {offline ? 'You are offline. Showing what was loaded earlier.' : 'Couldn’t refresh. Showing what was loaded earlier.'}
      </T>
    </View>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const { c } = useTheme()
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={c.accentGraphic} />
    </View>
  )
}

/**
 * The failure, said plainly, with the one thing that might fix it.
 *
 * A plan refusal is stated, never sold: the app offers no purchase and points
 * to none, so the server's own wording (which may suggest upgrading, as the
 * website does) is not shown here.
 */
export function Failure({ failure, onRetry }: { failure: ApiFailure; onRetry?: () => void }) {
  const { refreshProfile, signOut } = useAuth()
  const copy =
    failure.kind === 'offline'
      ? { icon: 'wifi-off' as const, title: 'You are offline', body: 'Nothing here is cached on the phone yet. Reconnect and pull to refresh.' }
      : failure.kind === 'unauthenticated'
        ? { icon: 'lock' as const, title: 'Signed out', body: 'Sign in again to see your record.' }
        : failure.kind === 'onboarding_required'
          ? { icon: 'compass' as const, title: 'One step left', body: 'Say who you are, and your record opens.' }
          : failure.kind === 'not_found'
            ? { icon: 'search' as const, title: 'Not found', body: 'It may have been deleted on another device.' }
            : failure.kind === 'plan_required'
              ? { icon: 'lock' as const, title: 'Not part of your current plan', body: 'This part of Atturel is not included in the plan on this account.' }
              : { icon: 'alert-circle' as const, title: 'Something went wrong', body: failure.message }
  const action =
    failure.kind === 'onboarding_required'
      ? { label: 'Finish setting up', onPress: () => void refreshProfile() }
      : failure.kind === 'unauthenticated'
        ? { label: 'Sign in', onPress: () => void signOut() }
        : failure.kind === 'plan_required'
          ? undefined
          : onRetry
            ? { label: 'Try again', onPress: onRetry }
            : undefined
  return <Empty icon={copy.icon} title={copy.title} body={copy.body} action={action} />
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  body: string
  action?: { label: string; onPress: () => void }
}) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 12, gap: 10 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={20} color={c.inkMuted} />
      </View>
      <T variant="title" style={{ textAlign: 'center' }}>{title}</T>
      <T variant="small" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>{body}</T>
      {action ? (
        <View style={{ marginTop: 8 }}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  )
}
