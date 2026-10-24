import * as React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { AskResponse } from '@atturel/web/lib/mobile/contracts'
import { brand } from '@atturel/web/lib/brand'
import { api, ApiError } from '~/lib/api'
import { Avatar } from '~/components/avatar'
import { Card, Screen, Section } from '~/components/screen'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * ASK
 * =============================================================================
 * A question about your own record, answered from it. Every answer shows what
 * it rests on and how sure the record is; where the record is silent the
 * answer says so. The same Ask the web uses, through the same action.
 * =============================================================================
 */

const STARTERS = [
  'What commitments are still open?',
  'What should I know before today’s meeting?',
  'What do I owe people this week?',
  'When did I last speak with each of my key people?',
]

const EVIDENCE: Record<AskResponse['citations'][number]['evidenceLevel'], { icon: React.ComponentProps<typeof Feather>['name']; word: string }> = {
  confirmed: { icon: 'check-circle', word: 'Confirmed' },
  observed: { icon: 'eye', word: 'Observed' },
  inferred: { icon: 'help-circle', word: 'Inferred' },
  unknown: { icon: 'help-circle', word: 'Unknown' },
}

export default function Ask() {
  const { c } = useTheme()
  const params = useLocalSearchParams<{ q?: string }>()
  const [question, setQuestion] = React.useState(params.q ?? '')
  const [asked, setAsked] = React.useState<string | null>(null)
  const [answer, setAnswer] = React.useState<AskResponse | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const ask = async (q: string) => {
    const text = q.trim()
    if (text.length < 2) return
    setBusy(true)
    setError(null)
    setAsked(text)
    setAnswer(null)
    try {
      setAnswer(await api.post<AskResponse>('/api/mobile/ask', { question: text }))
      setQuestion('')
    } catch (e) {
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline.'
          : e instanceof ApiError && e.failure.kind === 'server'
            ? e.failure.message
            : 'That question could not be answered.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen>
        <T variant="display" accessibilityRole="header">Ask {brand.name}</T>
        <T variant="small" tone="secondary" style={{ marginTop: 6 }}>About your people and conversations. Answers come from your record and show what they rest on.</T>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18 }}>
          <TextInput
            accessibilityLabel="Your question"
            placeholder="What do I owe Jonathan?"
            placeholderTextColor={c.inkMuted}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => void ask(question)}
            returnKeyType="send"
            multiline
            blurOnSubmit
            style={{ flex: 1, minHeight: TOUCH + 4, maxHeight: 120, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: c.ink, backgroundColor: c.surface, fontFamily: fonts.sans, fontSize: 16 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask"
            disabled={busy || question.trim().length < 2}
            onPress={() => void ask(question)}
            style={{ width: TOUCH + 4, height: TOUCH + 4, borderRadius: 12, backgroundColor: c.surfaceInverse, alignItems: 'center', justifyContent: 'center', opacity: busy || question.trim().length < 2 ? 0.4 : 1 }}
          >
            <Feather name="arrow-up" size={20} color={c.inkInverse} />
          </Pressable>
        </View>

        {!asked ? (
          <Section label="Try">
            <View style={{ gap: 8 }}>
              {STARTERS.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => void ask(s)} style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                  <T variant="small">{s}</T>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        {asked ? (
          <Section label="You asked">
            <T variant="body" tone="secondary">{asked}</T>
          </Section>
        ) : null}

        {busy ? <T variant="small" tone="muted" style={{ marginTop: 16 }} accessibilityLiveRegion="polite">Looking through your record…</T> : null}
        {error ? <T variant="small" tone="critical" style={{ marginTop: 16 }} accessibilityRole="alert">{error}</T> : null}

        {answer ? (
          <View style={{ marginTop: 16 }}>
            <Card>
              {answer.people.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {answer.people.slice(0, 4).map((p) => (
                    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Open ${p.name}`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })}>
                      <Avatar name={p.name} src={p.src} size={36} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <T variant="body" accessibilityLiveRegion="polite">{answer.answer}</T>
              <T variant="meta" tone="muted" style={{ marginTop: 10 }}>
                {answer.grounded ? 'Composed directly from your records.' : 'Written from your records.'}
              </T>
            </Card>

            {answer.citations.length > 0 ? (
              <Section label={`Rests on · ${answer.citations.length}`} icon="layers">
                {answer.citations.map((cit, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
                    <Feather name={EVIDENCE[cit.evidenceLevel].icon} size={14} color={c.inkMuted} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <T variant="meta">{cit.label}</T>
                      <T variant="meta" tone="muted">{EVIDENCE[cit.evidenceLevel].word}</T>
                    </View>
                  </View>
                ))}
              </Section>
            ) : null}

            {answer.followUps.length > 0 ? (
              <Section label="Ask next">
                <View style={{ gap: 8 }}>
                  {answer.followUps.slice(0, 3).map((f) => (
                    <Pressable key={f} accessibilityRole="button" onPress={() => void ask(f)} style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.line }}>
                      <T variant="small">{f}</T>
                    </Pressable>
                  ))}
                </View>
              </Section>
            ) : null}
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  )
}
