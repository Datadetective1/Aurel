import * as React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import Feather from '@expo/vector-icons/Feather'
import type { CreateMeetingResponse, MeResponse, PrepareResponse, VisualPerson } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { atWallTime, formatTime, relativeDay, wallTime } from '~/lib/format'
import { pickOnAndroid } from '~/lib/pick-time'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { Field } from '~/components/field'
import { PeoplePicker } from '~/components/people-picker'
import { Section } from '~/components/screen'
import { T } from '~/components/text'
import { fonts, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * NEW MEETING
 * =============================================================================
 * What it is, what you need from it, when, and who will be there -- then
 * "Create and prepare", which is the web's button: the meeting is created by
 * the web's own action and the brief built straight away by the web's own
 * Generate, from what the record holds about those people.
 *
 * The objective is required, as on the web: a brief with no objective cannot
 * say what to optimise for. Times are chosen in the account's time zone, the
 * one every meeting is shown in.
 * =============================================================================
 */

type When = { kind: 'none' } | { kind: 'at'; at: Date; label: string }

function presets(now: Date, tz: string): { key: string; label: string; at: Date }[] {
  const round = (d: Date) => {
    const r = new Date(d)
    r.setSeconds(0, 0)
    r.setMinutes(Math.ceil(r.getMinutes() / 5) * 5)
    return r
  }
  const nine = atWallTime(`${wallTime(new Date(now.getTime() + 24 * 3600_000), tz).slice(0, 10)}T09:00`, tz)
  return [
    { key: '30', label: 'In 30 min', at: round(new Date(now.getTime() + 30 * 60_000)) },
    { key: '60', label: 'In an hour', at: round(new Date(now.getTime() + 60 * 60_000)) },
    { key: 'tomorrow', label: 'Tomorrow 9:00', at: nine },
  ]
}

export default function NewMeeting() {
  const { c, name } = useTheme()
  const insets = useSafeAreaInsets()
  const [title, setTitle] = React.useState('')
  const [objective, setObjective] = React.useState('')
  const [tz, setTz] = React.useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [when, setWhen] = React.useState<When>({ kind: 'none' })
  const [picking, setPicking] = React.useState(false)
  const [people, setPeople] = React.useState<Pick<VisualPerson, 'id' | 'name' | 'fullName' | 'src'>[]>([])
  const [choosing, setChoosing] = React.useState(false)
  const [busy, setBusy] = React.useState<null | 'creating' | 'preparing'>(null)
  const [error, setError] = React.useState<string | null>(null)
  const objectiveRef = React.useRef<TextInput>(null)
  const now = React.useMemo(() => new Date(), [])
  // Times are chosen in the account's zone -- the one the server reads them in.
  const me = useApi<MeResponse>('/api/mobile/me')
  React.useEffect(() => {
    if (me.data?.timeZone) setTz(me.data.timeZone)
  }, [me.data?.timeZone])

  const toggle = (p: Pick<VisualPerson, 'id' | 'name' | 'fullName' | 'src'>) =>
    setPeople((list) => (list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id) : [...list, p]))

  const describe = (at: Date) => `${relativeDay(at.toISOString(), tz, new Date())} · ${formatTime(at.toISOString(), tz)}`

  const create = async () => {
    setError(null)
    setBusy('creating')
    let meetingId: string | null = null
    try {
      const created = await api.post<CreateMeetingResponse>('/api/mobile/meetings', {
        title: title.trim(),
        objective: objective.trim(),
        scheduledAt: when.kind === 'at' ? wallTime(when.at, tz) : undefined,
        attendeeIds: people.map((p) => p.id),
      })
      if (!created.ok) {
        setError(created.error)
        setBusy(null)
        return
      }
      meetingId = created.meetingId
      if (people.length > 0) {
        setBusy('preparing')
        // A failure here still leaves the meeting; its page offers Prepare again.
        await api.post<PrepareResponse>(`/api/mobile/meetings/${meetingId}/prepare`, {}).catch(() => null)
      }
      router.replace({ pathname: '/meeting/[id]', params: { id: meetingId } })
    } catch (e) {
      setBusy(null)
      if (meetingId) {
        router.replace({ pathname: '/meeting/[id]', params: { id: meetingId } })
        return
      }
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline. Nothing was created.'
          : e instanceof ApiError && e.failure.kind === 'not_found'
            ? 'Creating meetings from the app is not available yet. Use atturel.com.'
            : e instanceof ApiError && e.failure.kind === 'server'
              ? e.failure.message
              : 'The meeting could not be created. Try again.',
      )
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }} keyboardVerticalOffset={64}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <Field
          label="What is it?"
          placeholder="e.g. Q3 capacity review"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          returnKeyType="next"
          onSubmitEditing={() => objectiveRef.current?.focus()}
        />
        <Field
          ref={objectiveRef}
          label="What do you need from it?"
          placeholder="One sentence is enough."
          value={objective}
          onChangeText={setObjective}
          multiline
          hint="The brief is built around this."
        />

        <Section label="When" icon="clock" style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {presets(now, tz).map((p) => (
              <Choice
                key={p.key}
                label={p.label}
                selected={when.kind === 'at' && when.label === p.label}
                onPress={() => {
                  setPicking(false)
                  setWhen({ kind: 'at', at: p.at, label: p.label })
                }}
              />
            ))}
            {Platform.OS !== 'web' ? (
              <Choice
                label="Pick a time"
                icon="calendar"
                selected={when.kind === 'at' && when.label === 'picked'}
                onPress={() => {
                  const from = when.kind === 'at' ? when.at : presets(now, tz)[1]!.at
                  if (Platform.OS === 'android') {
                    pickOnAndroid(from, tz, (at) => setWhen({ kind: 'at', at, label: 'picked' }))
                    return
                  }
                  setPicking(true)
                  setWhen({ kind: 'at', at: from, label: 'picked' })
                }}
              />
            ) : null}
            <Choice label="No time yet" selected={when.kind === 'none'} onPress={() => { setPicking(false); setWhen({ kind: 'none' }) }} />
          </View>
          {when.kind === 'at' ? (
            <T variant="small" tone="secondary" style={{ marginTop: 10 }}>{describe(when.at)}</T>
          ) : null}
          {picking && when.kind === 'at' && Platform.OS === 'ios' ? (
            <DateTimePicker
              value={when.at}
              mode="datetime"
              display="inline"
              minuteInterval={5}
              timeZoneName={tz}
              themeVariant={name === 'obsidian' ? 'dark' : 'light'}
              accentColor={c.ink}
              onValueChange={(_event, date) => setWhen({ kind: 'at', at: date, label: 'picked' })}
            />
          ) : null}
        </Section>

        <Section label="Who will be there" icon="users" style={{ marginTop: 14 }}>
          {people.length > 0 ? (
            <View style={{ gap: 8, marginBottom: 8 }}>
              {people.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={p.fullName} src={p.src} size={36} />
                  <T variant="small" style={{ flex: 1, fontFamily: fonts.sansMedium }}>{p.name}</T>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} hitSlop={8} onPress={() => toggle(p)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="x" size={18} color={c.inkMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <T variant="small" tone="muted" style={{ marginBottom: 8 }}>
              Add at least one person and the brief is built from what you know about them.
            </T>
          )}
          {choosing ? (
            <PeoplePicker selected={people.map((p) => p.id)} onToggle={toggle} />
          ) : (
            <View style={{ alignItems: 'flex-start' }}>
              <Button label={people.length ? 'Add someone else' : 'Add people'} icon="user-plus" variant="secondary" onPress={() => setChoosing(true)} />
            </View>
          )}
        </Section>

        {error ? <T variant="small" tone="critical" accessibilityRole="alert" style={{ marginTop: 8 }}>{error}</T> : null}

        <View style={{ marginTop: 16, gap: 8 }}>
          <Button
            label={people.length ? 'Create and prepare' : 'Create meeting'}
            icon="arrow-right"
            size="lg"
            busy={busy !== null}
            disabled={!title.trim() || !objective.trim()}
            onPress={() => void create()}
          />
          {busy === 'preparing' ? (
            <T variant="small" tone="secondary" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
              Preparing the brief from what you know about them — usually 10 to 30 seconds.
            </T>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Choice({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: React.ComponentProps<typeof Feather>['name'] }) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: selected ? 2 : 1, borderColor: selected ? c.ink : c.line, backgroundColor: c.surface }}
    >
      {icon ? <Feather name={icon} size={14} color={c.inkSecondary} /> : null}
      <T variant="small" style={{ fontFamily: fonts.sansMedium }}>{label}</T>
    </Pressable>
  )
}
