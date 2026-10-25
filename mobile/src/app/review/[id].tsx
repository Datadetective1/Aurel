import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { ReviewResponse, ReviewResult } from '@atturel/web/lib/mobile/contracts'
import { DIRECTION_META } from '@atturel/web/lib/visual/relationship-actions'
import { PROPOSED_LABEL } from '@atturel/web/lib/conversations/decisions'
import { api, ApiError, useApi } from '~/lib/api'
import { Button } from '~/components/button'
import { DIRECTION_ICON } from '~/components/chip'
import { Card, Empty, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * WHAT HAPPENED
 * =============================================================================
 * The reading of a conversation, as counts first -- "2 commitments, 1
 * decision, 1 open question" -- and then each one to keep or set aside.
 * Confident readings start ticked; the user still decides. Only what is kept
 * reaches Today, the next brief and Ask; what is set aside is remembered as
 * set aside, so a re-read does not bring it back.
 * =============================================================================
 */
export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const { data, error, stale, loading, refreshing, refresh } = useApi<ReviewResponse>(id ? `/api/mobile/conversations/${id}/review` : null)
  const [keep, setKeep] = React.useState<Set<string> | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)
  const [sendError, setSendError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (data && keep === null) {
      // Something only proposed never starts ticked, whatever else the server says.
      setKeep(new Set([...data.loops.filter((l) => l.likely).map((l) => l.id), ...data.decisions.filter((d) => d.likely && !d.proposed).map((d) => d.id)]))
    }
  }, [data, keep])

  if (loading) return <Screen topInset={false}><Loading label="Reading the conversation" /></Screen>
  if (error || !data) return <Screen topInset={false} onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>

  if (data.processing === 'pending' || data.processing === 'processing') {
    return (
      <Screen topInset={false} onRefresh={refresh}>
        <Empty icon="loader" title="Still reading" body="Pull down in a moment to see what came out of it." action={{ label: 'Check again', onPress: refresh }} />
      </Screen>
    )
  }

  const selected = keep ?? new Set<string>()
  const toggle = (itemId: string) => {
    const next = new Set(selected)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setKeep(next)
  }

  const commitments = data.loops.filter((l) => l.kind !== 'question')
  const questions = data.loops.filter((l) => l.kind === 'question')
  const decided = data.decisions.filter((d) => !d.proposed)
  const proposals = data.decisions.filter((d) => d.proposed)
  const summary = [
    commitments.length ? `${commitments.length} ${commitments.length === 1 ? 'commitment' : 'commitments'}` : null,
    decided.length ? `${decided.length} ${decided.length === 1 ? 'decision' : 'decisions'}` : null,
    proposals.length ? `${proposals.length} ${proposals.length === 1 ? 'proposal' : 'proposals'}` : null,
    questions.length ? `${questions.length} open ${questions.length === 1 ? 'question' : 'questions'}` : null,
    data.memoryProposals ? `${data.memoryProposals} possible ${data.memoryProposals === 1 ? 'memory' : 'memories'}` : null,
  ].filter(Boolean)

  const submit = async () => {
    setBusy(true)
    setSendError(null)
    try {
      const r = await api.post<ReviewResult>(`/api/mobile/conversations/${data.conversation.id}/review`, {
        keepLoops: data.loops.filter((l) => selected.has(l.id)).map((l) => l.id),
        keepDecisions: data.decisions.filter((d) => selected.has(d.id)).map((d) => d.id),
      })
      setResult(r.message)
    } catch (e) {
      setSendError(e instanceof ApiError && e.failure.kind === 'offline' ? 'You are offline. Nothing was saved yet.' : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Screen topInset={false}>
        <Empty icon="check-circle" title="Remembered" body={result} />
        <View style={{ gap: 10 }}>
          <Button label="Back to Today" onPress={() => router.replace('/')} />
          {data.memoryProposals ? (
            <T variant="meta" tone="muted" style={{ textAlign: 'center' }}>
              Possible relationship memories wait on each person’s page for you to confirm.
            </T>
          ) : null}
        </View>
      </Screen>
    )
  }

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <T variant="display" accessibilityRole="header">{data.conversation.title}</T>
      {data.conversation.outcome || data.conversation.summary ? (
        <T variant="small" tone="secondary" style={{ marginTop: 8 }}>{data.conversation.outcome ?? data.conversation.summary}</T>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Card tone="sunken">
          <T variant="body" style={{ fontFamily: 'InstrumentSans_500Medium' }}>
            {summary.length ? summary.join(' · ') : 'Nothing to confirm'}
          </T>
          <T variant="meta" tone="muted" style={{ marginTop: 4 }}>
            Keep what is right. Only what you keep becomes part of the record.
          </T>
        </Card>
      </View>

      {commitments.length > 0 ? (
        <Section label="Commitments" icon="corner-up-right">
          {commitments.map((l) => (
            <ReviewItem
              key={l.id}
              checked={selected.has(l.id)}
              onToggle={() => toggle(l.id)}
              icon={DIRECTION_ICON[l.direction]}
              title={l.description}
              meta={[DIRECTION_META[l.direction].label, l.personName].filter(Boolean).join(' · ')}
              excerpt={l.excerpt}
            />
          ))}
        </Section>
      ) : null}

      {data.decisions.length > 0 ? (
        <Section label={proposals.length ? 'Decisions and proposals' : 'Decisions'} icon="git-commit">
          {data.decisions.map((d) => (
            <ReviewItem key={d.id} checked={selected.has(d.id)} onToggle={() => toggle(d.id)} icon="git-commit" title={d.description} flag={d.proposed ? PROPOSED_LABEL : undefined} excerpt={d.excerpt} />
          ))}
        </Section>
      ) : null}

      {questions.length > 0 ? (
        <Section label="Left unanswered" icon="help-circle">
          {questions.map((l) => (
            <ReviewItem key={l.id} checked={selected.has(l.id)} onToggle={() => toggle(l.id)} icon="help-circle" title={l.description} meta={l.personName ?? undefined} excerpt={l.excerpt} />
          ))}
        </Section>
      ) : null}

      {sendError ? <T variant="small" tone="critical" style={{ marginTop: 14 }} accessibilityRole="alert">{sendError}</T> : null}

      <View style={{ marginTop: 24 }}>
        <Button
          label={selected.size ? `Keep ${selected.size}` : 'Keep nothing'}
          icon="check"
          size="lg"
          busy={busy}
          onPress={() => void submit()}
        />
      </View>
      <View style={{ height: 1, backgroundColor: c.line, marginTop: 24 }} />
    </Screen>
  )
}

function ReviewItem({
  checked,
  onToggle,
  icon,
  title,
  flag,
  meta,
  excerpt,
}: {
  checked: boolean
  onToggle: () => void
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  /** Says what the item is when it is not what its section implies. */
  flag?: string
  meta?: string
  excerpt?: string | null
}) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={[title, flag, meta].filter(Boolean).join(', ')}
      onPress={onToggle}
      style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, minHeight: 56 }}
    >
      <Feather name={checked ? 'check-square' : 'square'} size={22} color={checked ? c.ink : c.lineStrong} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
          <Feather name={icon} size={14} color={c.inkMuted} style={{ marginTop: 3 }} />
          <T variant="small" style={{ flex: 1 }}>{title}</T>
        </View>
        {flag ? <T variant="meta" tone="caution" style={{ marginTop: 3 }}>{flag}</T> : null}
        {meta ? <T variant="meta" tone="muted" style={{ marginTop: 3 }}>{meta}</T> : null}
        {excerpt ? (
          <View style={{ marginTop: 6, borderLeftWidth: 2, borderLeftColor: c.line, paddingLeft: 8 }}>
            <T variant="meta" tone="secondary">{excerpt}</T>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
