import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { TodayResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { countdown, formatDayLabel } from '~/lib/format'
import { Failure, Loading, Screen, Section, Empty, Card } from '~/components/screen'
import { LoopRow, MeetingCard } from '~/components/relationship'
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
  const { data, error, loading, refreshing, refresh } = useApi<TodayResponse>('/api/mobile/today')

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
        {/* Account, privacy, sign out and Delete Account live behind this. */}
        <AccountButton />
      </View>
      <T variant="display" style={{ marginTop: 2 }} accessibilityRole="header">
        {greeting(now, tz)}, {data.name.split(' ')[0]}
      </T>

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
          <Empty icon="calendar" title="Nothing in the next seven days" body="Meetings you add on the web, or sync from your calendar, appear here with who is in them and what is open." />
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
          data.loops.map((l) => <LoopRow key={l.id} loop={l} timeZone={tz} now={now} />)
        )}
      </Section>
    </Screen>
  )
}

function AccountButton() {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account and settings"
      hitSlop={8}
      onPress={() => router.push('/account')}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Feather name="user" size={20} color={c.inkSecondary} />
    </Pressable>
  )
}

function greeting(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(now))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}
