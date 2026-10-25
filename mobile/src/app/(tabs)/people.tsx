import * as React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { ArchivedPeopleResponse, PeopleResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { useDebounced } from '~/lib/use-debounced'
import { NewPerson } from '~/components/people-picker'
import { Empty, Failure, Loading, Screen, StaleNote } from '~/components/screen'
import { PersonRow } from '~/components/relationship'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * Everyone on record, faces first, most recently spoken to at the top.
 *
 * Search is the web's people search, over everyone saved -- not only the
 * people this list carries. It filters what is on the phone at once, then
 * shows the server's answer when it arrives; if that cannot be reached, the
 * phone's own matches stay, and say so. It only ever searches the people you
 * have saved: looking someone up publicly is a separate, deliberate step on
 * their page.
 */
export default function People() {
  const { c } = useTheme()
  const [query, setQuery] = React.useState('')
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<PeopleResponse>('/api/mobile/people')
  // Only for the count: the archive is its own screen.
  const archived = useApi<ArchivedPeopleResponse>('/api/mobile/people?archived=1')
  const [adding, setAdding] = React.useState(false)
  useFresh(() => {
    reload()
    archived.reload()
  })
  const archivedCount = archived.data?.people.length ?? 0
  const now = new Date()

  const q = query.trim()
  const term = useDebounced(q)
  const search = useApi<PeopleResponse>(term.length >= 2 ? `/api/mobile/people?q=${encodeURIComponent(term)}` : null)
  const onPhone = (data?.people ?? []).filter((p) => {
    if (!q) return true
    return [p.name, p.fullName, p.company, p.title].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  })
  const searched = q.length >= 2 && term === q ? search.data?.people : undefined
  const people = searched ?? onPhone
  const searchFailed = q.length >= 2 && term === q && Boolean(search.error)

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void refresh()
        void archived.reload()
      }}
    >
      <StaleNote failure={stale} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="display" accessibilityRole="header">People</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add someone"
          onPress={() => setAdding((a) => !a)}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name={adding ? 'x' : 'user-plus'} size={20} color={c.inkSecondary} />
        </Pressable>
      </View>
      {adding ? (
        <NewPerson
          initialName={query}
          onCancel={() => setAdding(false)}
          onAdded={(person) => {
            setAdding(false)
            reload()
            router.push({ pathname: '/person/[id]', params: { id: person.id } })
          }}
          onExisting={(person) => {
            setAdding(false)
            reload()
            archived.reload()
            router.push({ pathname: '/person/[id]', params: { id: person.id } })
          }}
        />
      ) : null}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12, minHeight: TOUCH }}
      >
        <Feather name="search" size={16} color={c.inkMuted} />
        <TextInput
          accessibilityLabel="Search your people"
          accessibilityHint="Searches only the people you have saved"
          placeholder="Search your people by name, role or company"
          placeholderTextColor={c.inkMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{ flex: 1, color: c.ink, fontFamily: fonts.sans, fontSize: 16, minHeight: TOUCH }}
        />
      </View>

      {q ? (
        <T variant="meta" tone="muted" style={{ marginTop: 6 }}>
          {searchFailed
            ? 'Could not reach Atturel to search everyone. These are the matches on this phone.'
            : 'Only the people you have saved. To look someone up publicly, open their page.'}
        </T>
      ) : null}

      <View style={{ marginTop: 8 }}>
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure failure={error} onRetry={refresh} />
        ) : people.length === 0 ? (
          <Empty
            icon="users"
            title={q ? 'None of your people match' : 'Nobody on record yet'}
            body={q ? 'Try part of a name, a role or a company. To add them, use Add someone above.' : 'People you add on the web, or who appear in a conversation you capture, show up here.'}
          />
        ) : (
          people.map((p) => <PersonRow key={p.id} person={p} timeZone={data?.timeZone ?? 'UTC'} now={now} />)
        )}
      </View>

      {archivedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Archived, ${archivedCount} ${archivedCount === 1 ? 'person' : 'people'}`}
          accessibilityHint="People you removed. Restore them or delete them permanently."
          onPress={() => router.push('/archived')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, minHeight: TOUCH, opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="archive" size={16} color={c.inkMuted} />
          <T variant="small" tone="secondary" style={{ flex: 1 }}>Archived ({archivedCount})</T>
          <Feather name="chevron-right" size={16} color={c.inkMuted} />
        </Pressable>
      ) : null}
    </Screen>
  )
}
