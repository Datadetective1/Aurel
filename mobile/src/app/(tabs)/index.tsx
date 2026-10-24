import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { SampleDataResponse, TodayResponse } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { pendingStore } from '~/lib/pending-store'
import { recordedSeconds } from '~/lib/pending-capture'
import { useRecordingState } from '~/lib/recording-state'
import { elapsed } from '~/lib/capture'
import { countdown, formatDayLabel } from '~/lib/format'
import { Failure, Loading, Screen, Section, Empty, Card } from '~/components/screen'
import { LoopRow, MeetingCard } from '~/components/relationship'
import { Notice } from '~/components/notice'
import { Button } from '~/components/button'
import { T } from '~/components/text'
import { useTheme } from '~/theme'

/**
 * TODAY
 * =============================================================================
 * Three questions, in the order they are asked at 8:50 in the morning:
 * what is happening, who matters, what needs my attention. The next meeting
 * leads with a countdown and one action; the rest of the week follows as
 * face-first cards; then what the user owes, and anything waiting on review.
 * =============================================================================
 */
export default function Today() {
  const { c } = useTheme()
  const { data, error, loading, refreshing, refresh, reload } = useApi<TodayResponse>('/api/mobile/today')
  const [notice, setNotice] = React.useState<string | null>(null)
  const [unsent, setUnsent] = React.useState(() => pendingStore().load())
  const recording = useRecordingState()
  useFresh(() => {
    reload()
    setUnsent(pendingStore().load())
  })
  const changed = (message: string) => {
    setNotice(message)
    reload()
  }

  if (loading) return <Screen><Loading /></Screen>
  if (error || !data) {
    // Account stays reachable when the record is not -- someone who never
    // finished onboarding can still sign out or delete their account.
    return (
      <Screen onRefresh={refresh}>
        <View style={{ alignItems: 'flex-end' }}>
          <AccountButton />
        </View>
        {error ? <Failure failure={error} onRetry={refresh} /> : null}
      </Screen>
    )
  }

  const now = new Date(data.now)
  const tz = data.timeZone
  const next = data.meetings[0]
  // The countdown card is for the meeting about to happen: within ninety
  // minutes of starting, or up to twenty minutes in.
  const minutes = next?.scheduledAt ? (new Date(next.scheduledAt).getTime() - Date.now()) / 60_000 : null
  const soon = next && minutes !== null && minutes <= 90 && minutes >= -20 ? countdown(next.scheduledAt, new Date()) : null
  const rest = soon ? data.meetings.slice(1) : data.meetings

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="label" tone="muted">{formatDayLabel(data.now, tz)}</T>
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="plus" label="New meeting" onPress={() => router.push('/meeting/new')} />
          {/* Account, privacy, sign out and Delete Account live behind this. */}
          <AccountButton />
        </View>
      </View>
      <T variant="display" style={{ marginTop: 2 }} accessibilityRole="header">
        {greeting(now, tz)}, {data.name.split(' ')[0]}
      </T>
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}

      {unsent && unsent.parts.length > 0 && recording === 'idle' ? (
        <View style={{ marginTop: 16 }}>
          <Card tone="caution">
            <T variant="small">A {elapsed(recordedSeconds(unsent))} recording has not been sent yet. It is safe on this iPhone.</T>
            <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
              <Button label="Open it in Capture" icon="mic" variant="secondary" onPress={() => router.push('/capture')} />
            </View>
          </Card>
        </View>
      ) : null}

      {data.meetings.length === 0 && data.loops.length === 0 && data.awaitingReview.length === 0 ? (
        <StartHere onLoaded={changed} />
      ) : null}

      {next && soon ? (
        <View style={{ marginTop: 20 }}>
          <Card tone="accent">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="clock" size={13} color={c.accent} />
              <T variant="label" tone="accent">{soon}</T>
            </View>
            <T variant="title" style={{ marginTop: 8 }}>{next.title}</T>
            {next.objective ? <T variant="small" tone="secondary" style={{ marginTop: 4 }} numberOfLines={2}>{next.objective}</T> : null}
            <View style={{ marginTop: 14 }}>
              <Button
                label={next.prep === 'ready' ? 'What I need to know' : 'Prepare'}
                icon="arrow-right"
                onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: next.id } })}
              />
            </View>
          </Card>
        </View>
      ) : null}

      <Section label={soon ? 'Later this week' : 'Coming up'} icon="calendar">
        {data.meetings.length === 0 ? (
          <Empty
            icon="calendar"
            title="Nothing in the next seven days"
            body="Meetings you add here or on the web, or sync from your calendar, appear with who is in them and what is open."
            action={{ label: 'New meeting', onPress: () => router.push('/meeting/new') }}
          />
        ) : rest.length === 0 ? (
          <T variant="small" tone="muted">Nothing else in the next seven days.</T>
        ) : (
          <View style={{ gap: 12 }}>
            {rest.map((m) => (
              <MeetingCard key={m.id} meeting={m} timeZone={tz} now={now} />
            ))}
          </View>
        )}
      </Section>

      {data.awaitingReview.length > 0 ? (
        <Section label="Waiting on you" icon="inbox">
          {data.awaitingReview.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`Review ${r.title}: ${r.pending} things to confirm`}
              onPress={() => router.push({ pathname: '/review/[id]', params: { id: r.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.8 : 1, minHeight: 56 })}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentWash, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="small" tone="accent" style={{ fontFamily: 'InstrumentSans_600SemiBold' }}>{r.pending}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="small" numberOfLines={1}>{r.title}</T>
                <T variant="meta" tone="muted">{r.pending === 1 ? '1 thing to confirm' : `${r.pending} things to confirm`}</T>
              </View>
              <Feather name="chevron-right" size={18} color={c.inkMuted} />
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section label="Open loops" icon="corner-up-right">
        {data.loops.length === 0 ? (
          <T variant="small" tone="muted">Nothing open. Promises from your conversations collect here once you confirm them.</T>
        ) : (
          data.loops.map((l) => <LoopRow key={l.id} loop={l} timeZone={tz} now={now} onChanged={changed} />)
        )}
      </Section>
    </Screen>
  )
}

function AccountButton() {
  return <IconButton icon="user" label="Account and settings" onPress={() => router.push('/account')} />
}

function IconButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Feather name={icon} size={20} color={c.inkSecondary} />
    </Pressable>
  )
}

/**
 * First run, or a quiet week: the two ways in. A real meeting is the point;
 * the sample record is for seeing what Atturel does before there is anything
 * of one's own -- invented people, labelled as invented everywhere, removable
 * in one step from Account.
 */
function StartHere({ onLoaded }: { onLoaded: (message: string) => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<SampleDataResponse>('/api/mobile/sample-data', {})
      if (result.ok) onLoaded(result.message)
      else setError(result.error)
    } catch (e) {
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline.'
          : e instanceof ApiError && e.failure.kind === 'not_found'
            ? 'Sample people are not available from the app yet. Load them from Settings › Data on atturel.com.'
            : 'The sample could not be loaded. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ marginTop: 20 }}>
      <Card>
        <T variant="title">Walk into your next meeting prepared.</T>
        <T variant="small" tone="secondary" style={{ marginTop: 6 }}>
          Add a meeting and who will be there. Atturel prepares a brief from what you know, then keeps what was promised when you capture the conversation.
        </T>
        <View style={{ marginTop: 14, gap: 10 }}>
          <Button label="Prepare a meeting" icon="plus" onPress={() => router.push('/meeting/new')} />
          <Button label="Explore with sample people" icon="eye" variant="secondary" busy={busy} onPress={() => void load()} />
        </View>
        <T variant="meta" tone="muted" style={{ marginTop: 10 }}>
          The sample people are invented and marked as samples. Remove them any time from Account.
        </T>
        {error ? <T variant="small" tone="critical" style={{ marginTop: 8 }} accessibilityRole="alert">{error}</T> : null}
      </Card>
    </View>
  )
}

function greeting(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(now))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}
