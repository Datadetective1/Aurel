import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type {
  ArchivedPeopleResponse,
  PersonLifecycleResponse,
} from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { formatDate } from '~/lib/format'
import { Button } from '~/components/button'
import { Notice } from '~/components/notice'
import { SampleChip } from '~/components/relationship'
import { Empty, Failure, Loading, Screen, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * ARCHIVED
 * =============================================================================
 * People the user removed. They are out of search, new meetings, research
 * and reminders, and do not count toward the plan; their past meetings and
 * conversations are unchanged. Each can be restored, or opened to be deleted
 * permanently, which is a separate, explained step.
 * =============================================================================
 */
export default function Archived() {
  const { c } = useTheme()
  const { data, error, stale, loading, refreshing, refresh, reload } =
    useApi<ArchivedPeopleResponse>('/api/mobile/people?archived=1')
  const [notice, setNotice] = React.useState<string | null>(null)
  // Arriving back from a permanent delete: say it was done, once.
  const { deleted } = useLocalSearchParams<{ deleted?: string }>()
  React.useEffect(() => {
    if (!deleted) return
    setNotice(`${deleted} was deleted permanently.`)
    router.setParams({ deleted: undefined })
  }, [deleted])
  const [failure, setFailure] = React.useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  useFresh(reload)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const restore = async (id: string, name: string) => {
    setBusy(id)
    setFailure(null)
    try {
      const result = await api.post<PersonLifecycleResponse>(`/api/mobile/people/${id}/restore`, {})
      if (result.ok) {
        setNotice(`${name.split(' ')[0]} is back in your people.`)
        reload()
      } else setFailure({ id, text: result.error })
    } catch (e) {
      setFailure({
        id,
        text:
          e instanceof ApiError && e.failure.kind === 'offline'
            ? 'You are offline. Nothing changed.'
            : e instanceof ApiError &&
                (e.failure.kind === 'server' || e.failure.kind === 'plan_required')
              ? // The plan limit, said plainly: the app offers no purchase.
                /upgrade|pro\b/i.test(e.failure.message)
                ? 'Your plan holds as many people as it includes. Archive someone else to make room.'
                : e.failure.message
              : 'That did not work. Try again.',
      })
    } finally {
      setBusy(null)
    }
  }

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

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <T variant="small" tone="secondary">
        People you removed. They are out of search, new meetings, research and reminders, and do not
        count toward your plan. Their history is unchanged.
      </T>
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}

      {data.people.length === 0 ? (
        <Empty
          icon="archive"
          title="Nobody archived"
          body="When you remove someone from your people, they wait here until you restore them or delete them permanently."
        />
      ) : (
        <View style={{ marginTop: 16 }}>
          {data.people.map((p) => (
            <View
              key={p.id}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, removed ${formatDate(p.archivedAt, tz)}`}
                  accessibilityHint="Restore, or delete permanently"
                  onPress={() => router.push({ pathname: '/archived/[id]', params: { id: p.id } })}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: TOUCH,
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <T variant="small" style={{ fontFamily: 'InstrumentSans_500Medium' }}>
                    {p.name}
                  </T>
                  <T variant="meta" tone="muted">
                    {[p.company, `Removed ${formatDate(p.archivedAt, tz)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                  {p.isDemo ? (
                    <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                      <SampleChip />
                    </View>
                  ) : null}
                </Pressable>
                <Button
                  label="Restore"
                  icon="rotate-ccw"
                  variant="secondary"
                  busy={busy === p.id}
                  onPress={() => void restore(p.id, p.name)}
                />
                <Feather name="chevron-right" size={16} color={c.inkMuted} />
              </View>
              {failure?.id === p.id ? (
                <T
                  variant="small"
                  tone="critical"
                  style={{ marginTop: 6 }}
                  accessibilityRole="alert"
                >
                  {failure.text}
                </T>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  )
}
