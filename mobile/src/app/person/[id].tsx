import * as React from 'react'
import { Alert, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { PersonLifecycleResponse, PersonResponse, PhotoResponse } from '@atturel/web/lib/mobile/contracts'
import { DIRECTION_ORDER } from '@atturel/web/lib/visual/relationship-actions'
import { api, ApiError, useApi } from '~/lib/api'
import { photoForm, pickPhoto } from '~/lib/photo'
import { useFresh } from '~/lib/use-fresh'
import { formatTime, relativeDay, firstName } from '~/lib/format'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { Chip, ChipRow, DirectionChip } from '~/components/chip'
import { CompanyLine, LoopRow, SampleChip, Timeline } from '~/components/relationship'
import { Notice } from '~/components/notice'
import { Card, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * ONE PERSON
 * =============================================================================
 * Face and place first; then the four facts that say where things stand --
 * last spoke, next meeting, what is open by direction, recent themes; then
 * the dated record between you. No score: the facts are the state.
 * =============================================================================
 */
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<PersonResponse>(id ? `/api/mobile/people/${id}` : null)
  const [notice, setNotice] = React.useState<string | null>(null)
  useFresh(reload)
  const changed = (message: string) => {
    setNotice(message)
    reload()
  }

  if (loading) return <Screen topInset={false}><Loading /></Screen>
  if (error || !data) return <Screen topInset={false} onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>

  const { person, loops, timeline, themes, timeZone: tz } = data
  const now = new Date()
  // Each loop's direction is computed server-side; count them as they are.
  const counts = Object.fromEntries(
    DIRECTION_ORDER.map((d) => [d, loops.filter((l) => l.direction === d).length]),
  ) as Record<(typeof DIRECTION_ORDER)[number], number>
  const open = DIRECTION_ORDER.filter((d) => d !== 'completed' && counts[d] > 0)

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <Avatar name={person.fullName} src={person.src} size={112} />
        <T variant="display" style={{ marginTop: 14, textAlign: 'center' }} accessibilityRole="header">{person.name}</T>
        {person.title ? <T variant="small" tone="secondary" style={{ marginTop: 2, textAlign: 'center' }}>{person.title}</T> : null}
        {person.company ? <View style={{ marginTop: 6 }}><CompanyLine name={person.company} /></View> : null}
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 6 }}>
          <Chip>{person.relationshipLabel}</Chip>
          {person.isDemo ? <SampleChip /> : null}
        </View>
      </View>
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <View style={{ flex: 1 }}>
          <Button label="Capture" icon="mic" onPress={() => router.push({ pathname: '/capture', params: { personId: person.id } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={`Ask`}
            icon="message-circle"
            variant="secondary"
            onPress={() => router.push({ pathname: '/ask', params: { q: `What should I know about ${firstName(person.name)}?` } })}
          />
        </View>
      </View>

      {/* --- where things stand ------------------------------------------------ */}
      <View style={{ marginTop: 20 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Fact icon="message-circle" label="Last spoke" value={person.lastInteractionAt ? relativeDay(person.lastInteractionAt, tz, now) : 'Not yet'} />
            {person.nextMeeting ? (
              <Pressable
                style={{ flex: 1 }}
                accessibilityRole="button"
                accessibilityLabel={`Next meeting: ${person.nextMeeting.title}`}
                onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: person.nextMeeting!.id } })}
              >
                <Fact
                  icon="calendar"
                  label="Next"
                  value={person.nextMeeting.scheduledAt ? `${relativeDay(person.nextMeeting.scheduledAt, tz, now)} ${formatTime(person.nextMeeting.scheduledAt, tz)}` : 'Planned'}
                  detail={person.nextMeeting.title}
                />
              </Pressable>
            ) : (
              <Fact icon="calendar" label="Next" value="Nothing scheduled" muted />
            )}
          </View>
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 14 }} />
          <T variant="label" tone="muted">Open</T>
          <View style={{ marginTop: 8 }}>
            {open.length > 0 ? (
              <ChipRow>{open.map((d) => <DirectionChip key={d} direction={d} count={counts[d]} short />)}</ChipRow>
            ) : (
              <T variant="small" tone="muted">Nothing open</T>
            )}
          </View>
        </Card>
      </View>

      {themes.length > 0 ? (
        <Section label="Recent themes" icon="tag">
          <ChipRow>{themes.map((t) => <Chip key={t}>{t}</Chip>)}</ChipRow>
        </Section>
      ) : null}

      {loops.length > 0 ? (
        <Section label="Open loops" icon="corner-up-right">
          {loops.map((l) => <LoopRow key={l.id} loop={l} timeZone={tz} now={now} showPerson={false} onChanged={changed} />)}
        </Section>
      ) : null}

      {/* Public research is its own step, never started by what was typed in. */}
      <Section label="Public footprint" icon="globe">
        {person.isDemo ? (
          <T variant="small" tone="muted">Sample people are invented, so there is nothing public to find.</T>
        ) : (
          <>
            <T variant="small" tone="secondary">
              Look {firstName(person.name)} up in public professional sources. You check each page before anything is added.
            </T>
            <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
              <Button
                label="Research public footprint"
                icon="search"
                variant="secondary"
                accessibilityHint="Opens public research. Nothing is searched until you ask."
                onPress={() => router.push({ pathname: '/research/[id]', params: { id: person.id } })}
              />
            </View>
          </>
        )}
      </Section>

      <Manage
        person={{ id: person.id, name: person.name, hasPhoto: Boolean(person.src), editable: Boolean(data.edit) }}
        onChanged={changed}
      />

      <Section label="Relationship memory" icon="clock">
        {timeline.length > 0 ? (
          <Timeline entries={timeline} timeZone={tz} />
        ) : (
          <T variant="small" tone="muted">Nothing kept yet. Capture your next conversation with {firstName(person.name)} and it starts here.</T>
        )}
      </Section>
    </Screen>
  )
}

function Fact({ icon, label, value, detail, muted }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string; detail?: string; muted?: boolean }) {
  const { c } = useTheme()
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Feather name={icon} size={12} color={c.inkMuted} />
        <T variant="label" tone="muted">{label}</T>
      </View>
      <T variant="small" tone={muted ? 'muted' : 'ink'} style={{ marginTop: 6 }}>{value}</T>
      {detail ? <T variant="meta" tone="muted" numberOfLines={1}>{detail}</T> : null}
    </View>
  )
}

function problem(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.failure.kind === 'offline') return 'You are offline. Nothing changed.'
  if (e instanceof ApiError && (e.failure.kind === 'server' || e.failure.kind === 'conflict')) return e.failure.message
  return fallback
}

/**
 * Correct the record, set their photo, or remove them. Removing archives:
 * out of the user's people and every new workflow, history untouched, and
 * reversible from People › Archived. Deleting is a separate step, there.
 */
function Manage({
  person,
  onChanged,
}: {
  person: { id: string; name: string; hasPhoto: boolean; editable: boolean }
  onChanged: (message: string) => void
}) {
  const [busy, setBusy] = React.useState<'photo' | 'unphoto' | 'remove' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const first = firstName(person.name)

  const choosePhoto = async () => {
    setError(null)
    setBusy('photo')
    try {
      const uri = await pickPhoto()
      if (!uri) return
      const result = await api.upload<PhotoResponse>(`/api/mobile/people/${person.id}/photo`, photoForm(uri))
      if (result.ok) onChanged('Photo saved. Visible only to you.')
      else setError(result.error)
    } catch (e) {
      setError(problem(e, 'The photo could not be saved. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const clearPhoto = async () => {
    setError(null)
    setBusy('unphoto')
    try {
      const result = await api.delete<PhotoResponse>(`/api/mobile/people/${person.id}/photo`)
      if (result.ok) onChanged('Photo removed.')
      else setError(result.error)
    } catch (e) {
      setError(problem(e, 'The photo could not be removed. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const archive = async () => {
    setError(null)
    setBusy('remove')
    try {
      const result = await api.post<PersonLifecycleResponse>(`/api/mobile/people/${person.id}/archive`, {})
      if (result.ok) router.back()
      else setError(result.error)
    } catch (e) {
      setError(problem(e, 'That did not work. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = () =>
    Alert.alert(
      `Remove ${person.name}?`,
      `${first} leaves your people, search, new meetings, research and reminders. Past conversations and meetings stay as they are, and you can restore ${first} from People › Archived at any time.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: `Remove ${first}`, style: 'destructive', onPress: () => void archive() },
      ],
    )

  return (
    <Section label="Manage" icon="sliders">
      <View style={{ gap: 8, alignItems: 'flex-start' }}>
        {person.editable ? (
          <Button label="Edit details" icon="edit-2" variant="secondary" onPress={() => router.push({ pathname: '/edit-person/[id]', params: { id: person.id } })} />
        ) : null}
        <Button
          label={person.hasPhoto ? 'Change photo' : 'Add a photo'}
          icon="image"
          variant="secondary"
          busy={busy === 'photo'}
          disabled={busy !== null && busy !== 'photo'}
          accessibilityHint="Opens your photo library. Atturel sees only the photo you choose."
          onPress={() => void choosePhoto()}
        />
        {person.hasPhoto ? (
          <Button label="Remove photo" icon="x" variant="ghost" busy={busy === 'unphoto'} disabled={busy !== null && busy !== 'unphoto'} onPress={() => void clearPhoto()} />
        ) : null}
        <Button label="Remove from people" icon="archive" variant="ghost" busy={busy === 'remove'} disabled={busy !== null && busy !== 'remove'} onPress={confirmRemove} />
      </View>
      <T variant="meta" tone="muted" style={{ marginTop: 8 }}>Photos are visible only to you. Without one, initials stand in.</T>
      {error ? <T variant="small" tone="critical" style={{ marginTop: 8 }} accessibilityRole="alert">{error}</T> : null}
    </Section>
  )
}
