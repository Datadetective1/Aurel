import * as React from 'react'
import { TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import type { PeopleResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { Empty, Failure, Loading, Screen } from '~/components/screen'
import { PersonRow } from '~/components/relationship'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'

/** Everyone on record, faces first, most recently spoken to at the top. */
export default function People() {
  const { c } = useTheme()
  const [query, setQuery] = React.useState('')
  const { data, error, loading, refreshing, refresh } = useApi<PeopleResponse>('/api/mobile/people')
  const now = new Date()

  const people = (data?.people ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [p.name, p.fullName, p.company, p.title].some((v) => v?.toLowerCase().includes(q))
  })

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T variant="display" accessibilityRole="header">People</T>
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
    </Screen>
  )
}
