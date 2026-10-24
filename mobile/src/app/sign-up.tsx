import * as React from 'react'
import { KeyboardAvoidingView, Linking, Platform, ScrollView, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { brand } from '@atturel/web/lib/brand'
import { api, ApiError } from '~/lib/api'
import { config } from '~/lib/config'
import { Button } from '~/components/button'
import { Card } from '~/components/screen'
import { Field } from '~/components/field'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * CREATE AN ACCOUNT
 * =============================================================================
 * The web's own sign-up (POST /api/mobile/sign-up): the same ten-character
 * password rule, the same welcome email, the same confirmation link -- and
 * the same answer whether or not the address already has an account. The app
 * sells nothing and shows no price here; plans are not part of signing up.
 *
 * The confirmation link opens atturel.com, which finishes the sign-up. The
 * person then comes back and signs in; the app asks for the one onboarding
 * step if the web has not already.
 * =============================================================================
 */
export default function SignUp() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const emailRef = React.useRef<TextInput>(null)
  const passwordRef = React.useRef<TextInput>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const result = await api.signUp({ fullName: fullName.trim(), email: email.trim(), password })
      if (result.ok) {
        if (result.needsConfirmation) setSentTo(email.trim())
        else router.replace('/sign-in')
      } else {
        setError(result.fieldErrors ? null : result.error)
        setFieldErrors(result.fieldErrors ?? {})
      }
    } catch (e) {
      setError(e instanceof ApiError && e.failure.kind === 'offline' ? 'You appear to be offline.' : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: insets.bottom }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accentWash, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="mail" size={22} color={c.accent} />
        </View>
        <T variant="display" style={{ marginTop: 16 }} accessibilityRole="header">Check your email</T>
        <T variant="body" tone="secondary" style={{ marginTop: 10 }}>
          If {sentTo} can be used for a new account, a link to confirm it is on its way.
        </T>
        <View style={{ marginTop: 20 }}>
          <Card tone="sunken">
            <Step n={1} text="Open the email on this iPhone and tap the link. It opens atturel.com." />
            <Step n={2} text="Come back here and sign in with the same email and password." />
          </Card>
        </View>
        <View style={{ marginTop: 24, gap: 10 }}>
          <Button label="Go to sign in" size="lg" onPress={() => router.replace('/sign-in')} />
          <T variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            Nothing arrived after a few minutes? Check spam, or write to {brand.email.support}.
          </T>
        </View>
      </View>
    )
  }

  const first = (key: string) => fieldErrors[key]?.[0] ?? null

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
      >
        <T variant="label" tone="accent">{brand.name}</T>
        <T variant="display" style={{ marginTop: 10 }} accessibilityRole="header">Create your account</T>
        <T variant="small" tone="secondary" style={{ marginTop: 10 }}>
          The same account works here and on {brand.domain}.
        </T>

        <View style={{ marginTop: 24, gap: 14 }}>
          <Field
            label="Your name"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            error={first('fullName')}
          />
          <Field
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={first('email')}
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules="minlength: 10;"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            hint="At least 10 characters."
            error={first('password')}
          />
          {error ? <T variant="small" tone="critical" accessibilityRole="alert">{error}</T> : null}
          <Button
            label="Create account"
            size="lg"
            busy={busy}
            disabled={!fullName.trim() || !email.trim() || password.length < 10}
            onPress={() => void submit()}
          />
          <T variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            By creating an account you agree to the{' '}
            <T variant="meta" tone="secondary" style={{ textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(`${config.apiUrl}/terms`)} accessibilityRole="link">
              Terms
            </T>{' '}
            and{' '}
            <T variant="meta" tone="secondary" style={{ textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(`${config.apiUrl}/privacy`)} accessibilityRole="link">
              Privacy
            </T>
            .
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="meta" tone="secondary">{n}</T>
      </View>
      <T variant="small" style={{ flex: 1 }}>{text}</T>
    </View>
  )
}
