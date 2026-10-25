import * as React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { ArchivedPeopleResponse, PeopleResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { NewPerson } from '~/components/people-picker'
import { Empty, Failure, Loading, Screen, StaleNote } from '~/components/screen'
import { PersonRow } from '~/components/relationship'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/** Everyone on record, faces first, most recently spoken to at the top. */
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

  const people = (data?.people ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [p.name, p.fullName, p.company, p.title].some((v) => v?.toLowerCase().includes(q))
  })

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
          accessibilityLabel="Search people"
          placeholder="Search by name or company"
          placeholderTextColor={c.inkMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{ flex: 1, color: c.ink, fontFamily: fonts.sans, fontSize: 16, minHeight: TOUCH }}
        />
      </View>

      <View style={{ marginTop: 8 }}>
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure failure={error} onRetry={refresh} />
        ) : people.length === 0 ? (
          <Empty
            icon="users"
            title={query ? 'Nobody by that name' : 'Nobody on record yet'}
            body={query ? 'Try part of a name or a company.' : 'People you add on the web, or who appear in a conversation you capture, show up here.'}
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
