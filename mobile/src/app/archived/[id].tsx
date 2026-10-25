import * as React from 'react'
import { Switch, TextInput, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type {
  DeletePersonResponse,
  DeletionPreviewResponse,
  LoopActionResponse,
  PersonLifecycleResponse,
} from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { formatDate } from '~/lib/format'
import { Button } from '~/components/button'
import { Card, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * SOMEONE REMOVED
 * =============================================================================
 * Restore them, or delete them permanently. The delete is explained before it
 * can be done, in the server's own three lists: what is deleted, what is kept
 * but no longer linked to them, and the loops that stay -- with the ones whose
 * words still name them flagged, to reword or delete first. Nothing about the
 * person is shown beyond their name: they are out of the user's people.
 * =============================================================================
 */

function failureText(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.failure.kind === 'offline')
    return 'You are offline. Nothing changed.'
  if (e instanceof ApiError && (e.failure.kind === 'server' || e.failure.kind === 'conflict')) {
    // The plan limit, said plainly: the app offers no purchase.
    return /upgrade|pro\b/i.test(e.failure.message)
      ? 'Your plan holds as many people as it includes. Archive someone else to make room.'
      : e.failure.message
  }
  return fallback
}

export default function ArchivedPerson() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const { data, error, stale, loading, refreshing, refresh, reload } =
    useApi<DeletionPreviewResponse>(id ? `/api/mobile/people/${id}/deletion` : null)
  const [busy, setBusy] = React.useState<'restore' | 'delete' | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [understood, setUnderstood] = React.useState(false)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (loading)
    return (
      <Screen topInset={false}>
        <Loading />
      </Screen>
    )
  if (error || !data)
    return (
      <Screen topInset={false} onRefresh={refresh}>
        {error ? <Failure failure={error} onRetry={refresh} /> : null}
      </Screen>
    )

  const { person } = data
  const first = person.name.split(' ')[0] ?? person.name
  const identifying = data.retainedLoops.filter((l) => l.mentionsPerson).length

  const restore = async () => {
    setBusy('restore')
    setMessage(null)
    try {
      const result = await api.post<PersonLifecycleResponse>(
        `/api/mobile/people/${person.id}/restore`,
        {},
      )
      if (result.ok) router.replace({ pathname: '/person/[id]', params: { id: person.id } })
      else setMessage(result.error)
    } catch (e) {
      setMessage(failureText(e, 'That did not work. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    setMessage(null)
    try {
      const result = await api.delete<DeletePersonResponse>(`/api/mobile/people/${person.id}`, {
        confirm: 'delete',
      })
      if (result.ok) {
        // Back to the archive, which says what happened.
        router.navigate({ pathname: '/archived', params: { deleted: person.name } })
        return
      }
      setMessage(result.error)
    } catch (e) {
      setMessage(failureText(e, 'Nothing was deleted. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: person.name }} />
      <StaleNote failure={stale} />
      <T variant="display" accessibilityRole="header">
        {person.name}
      </T>
      <T variant="small" tone="secondary" style={{ marginTop: 6 }}>
        {person.archivedAt
          ? `Removed from your people on ${formatDate(person.archivedAt, tz)}. `
          : 'Removed from your people. '}
        Their past meetings and conversations are unchanged.
      </T>

      <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <Button
          label={`Restore ${first}`}
          icon="rotate-ccw"
          busy={busy === 'restore'}
          disabled={busy === 'delete'}
          onPress={() => void restore()}
        />
      </View>
      {message && !deleting ? (
        <T variant="small" tone="critical" style={{ marginTop: 10 }} accessibilityRole="alert">
          {message}
        </T>
      ) : null}

      <Section label="Delete permanently" icon="trash-2">
        {!deleting ? (
          <>
            <T variant="small" tone="secondary">
              Deleting cannot be undone. Before anything happens, you see exactly what goes and what
              stays.
            </T>
            <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <Button
                label="Delete permanently…"
                icon="trash-2"
                variant="danger"
                onPress={() => setDeleting(true)}
              />
            </View>
          </>
        ) : (
          <View style={{ gap: 18 }}>
            <List
              title="Deleted"
              icon="trash-2"
              items={data.deleted}
              empty="Nothing beyond their name."
            />
            <List
              title={`Kept, no longer linked to ${first}`}
              icon="link-2"
              items={data.unlinked}
              empty={`Nothing else refers to ${first}.`}
            />

            {data.retainedLoops.length > 0 ? (
              <View>
                <T variant="label" tone="muted">
                  Loops that stay
                </T>
                <T variant="small" tone="secondary" style={{ marginTop: 6 }}>
                  {identifying > 0
                    ? `${identifying === 1 ? 'One still names' : `${identifying} still name`} ${first} in their words. Reword or delete ${identifying === 1 ? 'it' : 'them'} first if you do not want that kept.`
                    : `They stay on your loops without ${first}'s name attached.`}
                </T>
                <View style={{ marginTop: 8 }}>
                  {data.retainedLoops.map((loop) => (
                    <RetainedLoop key={loop.id} loop={loop} onChanged={reload} />
                  ))}
                </View>
              </View>
            ) : null}

            <Card tone="critical">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <T variant="small" style={{ flex: 1 }} nativeID="understood-label">
                  I understand this permanently deletes {person.name} and what is listed under
                  “Deleted”. It cannot be undone.
                </T>
                <Switch
                  value={understood}
                  onValueChange={setUnderstood}
                  accessibilityLabel={`I understand this permanently deletes ${person.name}. It cannot be undone.`}
                  accessibilityLabelledBy="understood-label"
                />
              </View>
              {message ? (
                <T
                  variant="small"
                  tone="critical"
                  style={{ marginTop: 10 }}
                  accessibilityRole="alert"
                >
                  {message}
                </T>
              ) : null}
              <View style={{ marginTop: 14, gap: 8 }}>
                <Button
                  label="Delete permanently"
                  icon="trash-2"
                  variant="danger"
                  busy={busy === 'delete'}
                  disabled={!understood || busy === 'restore'}
                  onPress={() => void remove()}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  disabled={busy !== null}
                  onPress={() => {
                    setDeleting(false)
                    setUnderstood(false)
                    setMessage(null)
                  }}
                />
              </View>
            </Card>
          </View>
        )}
      </Section>
    </Screen>
  )
}

function List({
  title,
  icon,
  items,
  empty,
}: {
  title: string
  icon: React.ComponentProps<typeof Feather>['name']
  items: string[]
  empty: string
}) {
  const { c } = useTheme()
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name={icon} size={13} color={c.inkMuted} />
        <T variant="label" tone="muted">
          {title}
        </T>
      </View>
      {items.length > 0 ? (
        <View style={{ marginTop: 6, gap: 4 }}>
          {items.map((item) => (
            <T key={item} variant="small">
              • {item}
            </T>
          ))}
        </View>
      ) : (
        <T variant="small" tone="secondary" style={{ marginTop: 6 }}>
          {empty}
        </T>
      )}
    </View>
  )
}

/** A loop that will outlive the person: reword it, or delete it, here. */
function RetainedLoop({
  loop,
  onChanged,
}: {
  loop: DeletionPreviewResponse['retainedLoops'][number]
  onChanged: () => void
}) {
  const { c } = useTheme()
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(loop.description)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async (work: () => Promise<LoopActionResponse>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await work()
      if (result.ok) {
        setEditing(false)
        onChanged()
      } else setError(result.error)
    } catch (e) {
      setError(failureText(e, 'That did not work. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            accessibilityLabel="Loop text"
            style={{
              minHeight: TOUCH * 2,
              borderWidth: 1,
              borderColor: c.lineStrong,
              borderRadius: 10,
              padding: 12,
              color: c.ink,
              backgroundColor: c.surface,
              fontFamily: fonts.sans,
              fontSize: 16,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Save"
              busy={busy}
              disabled={text.trim().length === 0}
              onPress={() =>
                void run(() =>
                  api.patch<LoopActionResponse>(`/api/mobile/loops/${loop.id}`, {
                    description: text.trim(),
                  }),
                )
              }
            />
            <Button
              label="Cancel"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setText(loop.description)
                setEditing(false)
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T variant="small">{loop.description}</T>
            {loop.mentionsPerson ? (
              <T variant="meta" tone="caution" style={{ marginTop: 2 }}>
                Names them, so it will still identify them.
              </T>
            ) : null}
          </View>
          <Button
            label="Edit"
            variant="ghost"
            icon="edit-2"
            disabled={busy}
            onPress={() => setEditing(true)}
          />
          <Button
            label="Delete"
            variant="ghost"
            icon="trash"
            busy={busy}
            onPress={() =>
              void run(() => api.delete<LoopActionResponse>(`/api/mobile/loops/${loop.id}`))
            }
          />
        </View>
      )}
      {error ? (
        <T variant="small" tone="critical" style={{ marginTop: 6 }} accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </View>
  )
}
