import * as React from 'react'
import { KeyboardAvoidingView, Linking, Platform, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { brand } from '@atturel/web/lib/brand'
import { useAuth } from '~/lib/auth'
import { config } from '~/lib/config'
import { Button } from '~/components/button'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'

/**
 * Sign in with the same account as the web. Accounts are created, and
 * onboarding is finished, on the web -- the app does not duplicate either.
 */
export default function SignIn() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { signIn } = useAuth()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const passwordRef = React.useRef<TextInput>(null)

  const submit = async () => {
    setBusy(true)
    setError(await signIn(email, password))
    setBusy(false)
  }

  const input = {
    minHeight: TOUCH + 6,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: c.ink,
    backgroundColor: c.surface,
    fontFamily: fonts.sans,
    fontSize: 16,
  } as const

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
        <T variant="label" tone="accent">{brand.name}</T>
        <T variant="display" style={{ marginTop: 10 }}>Walk into every room prepared.</T>
        <T variant="small" tone="secondary" style={{ marginTop: 10 }}>
          Sign in with the account you use on {brand.domain}.
        </T>

        <View style={{ marginTop: 28, gap: 12 }}>
          <View>
            <T variant="meta" tone="secondary" nativeID="email-label" style={{ marginBottom: 6 }}>Email</T>
            <TextInput
              accessibilityLabelledBy="email-label"
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              style={input}
            />
          </View>
          <View>
            <T variant="meta" tone="secondary" nativeID="password-label" style={{ marginBottom: 6 }}>Password</T>
            <TextInput
              ref={passwordRef}
              accessibilityLabelledBy="password-label"
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              style={input}
            />
          </View>
          {error ? (
            <T variant="small" tone="critical" accessibilityRole="alert">{error}</T>
          ) : null}
          <View style={{ marginTop: 6 }}>
            <Button label="Sign in" onPress={submit} busy={busy} disabled={!email || !password} size="lg" />
          </View>
          <Button
            label="New here? Create an account on the web"
            variant="ghost"
            onPress={() => void Linking.openURL(`${config.apiUrl}/sign-up`)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
