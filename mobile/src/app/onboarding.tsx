import * as React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import type { OnboardingResponse } from '@atturel/web/lib/mobile/contracts'
import { brand } from '@atturel/web/lib/brand'
import { api, ApiError } from '~/lib/api'
import { useAuth } from '~/lib/auth'
import { Button } from '~/components/button'
import { Field } from '~/components/field'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * FIRST RUN
 * =============================================================================
 * The one required step, as on the web: who you are, and the time zone every
 * meeting is shown in. The web's own action ends onboarding
 * (POST /api/mobile/onboarding). Goals, coaching context and the Interaction
 * Profile are optional tailoring and stay on the web, offered later.
 *
 * The time zone is the phone's, said out loud so it can be checked.
 * =============================================================================
 */
export default function Onboarding() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { state, refreshProfile, signOut } = useAuth()
  const suggested = state.status === 'signed_in' ? state.suggestedName : ''
  const [fullName, setFullName] = React.useState(suggested)
  const [jobTitle, setJobTitle] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const titleRef = React.useRef<TextInput>(null)
  const companyRef = React.useRef<TextInput>(null)
  const timezone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const submit = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const result = await api.post<OnboardingResponse>('/api/mobile/onboarding', {
        fullName: fullName.trim(),
        jobTitle: jobTitle.trim(),
        company: company.trim(),
        timezone,
      })
      if (result.ok) {
        await refreshProfile()
        return
      }
      setError(result.error)
    } catch (e) {
      if (e instanceof ApiError && e.failure.kind === 'not_found') {
        setError(`Setting up from the app is not available yet. Finish on ${brand.domain}, then sign in again.`)
      } else if (e instanceof ApiError && e.failure.kind === 'offline') {
        setError('You appear to be offline.')
      } else if (e instanceof ApiError && e.failure.kind === 'server') {
        setError(e.failure.message)
      } else {
        setError('That did not save. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        <T variant="label" tone="accent">Welcome to {brand.name}</T>
        <T variant="display" style={{ marginTop: 10 }} accessibilityRole="header">One thing first: who you are.</T>
        <T variant="small" tone="secondary" style={{ marginTop: 10 }}>
          Briefs are written for you, so they need to know who is walking into the room.
        </T>

        <View style={{ marginTop: 24, gap: 14 }}>
          <Field
            label="Your name"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => titleRef.current?.focus()}
            error={fieldErrors.fullName?.[0]}
          />
          <Field
            ref={titleRef}
            label="Your role (optional)"
            placeholder="e.g. Head of Partnerships"
            value={jobTitle}
            onChangeText={setJobTitle}
            textContentType="jobTitle"
            returnKeyType="next"
            onSubmitEditing={() => companyRef.current?.focus()}
          />
          <Field
            ref={companyRef}
            label="Where you work (optional)"
            value={company}
            onChangeText={setCompany}
            textContentType="organizationName"
            returnKeyType="done"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="globe" size={14} color={c.inkMuted} />
            <T variant="meta" tone="muted" style={{ flex: 1 }}>
              Times are shown in {timezone.replace(/_/g, ' ')}, this iPhone’s time zone. Change it later in Settings on the web.
            </T>
          </View>
          {error ? <T variant="small" tone="critical" accessibilityRole="alert">{error}</T> : null}
          <Button label="Continue" size="lg" icon="arrow-right" busy={busy} disabled={!fullName.trim()} onPress={() => void submit()} />
          <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
