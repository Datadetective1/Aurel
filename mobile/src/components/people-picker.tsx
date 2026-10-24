import * as React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import type { CreatePersonResponse, PeopleResponse, VisualPerson } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { fonts, TOUCH, useTheme } from '~/theme'
import { Avatar } from './avatar'
import { Button } from './button'
import { Field } from './field'
import { Loading } from './screen'
import { T } from './text'

/**
 * Choose who is in the room: everyone on record, searchable, faces first --
 * or someone new, by name, without leaving the screen. A new person is added
 * through the web's own path (the plan's people limit, the duplicate check);
 * research about them stays a deliberate step on the web.
 */
export function PeoplePicker({
  selected,
  onToggle,
  onTimeZone,
}: {
  selected: string[]
  onToggle: (person: Pick<VisualPerson, 'id' | 'name' | 'fullName' | 'src'>) => void
  /** The account's time zone, which the people list happens to carry. */
  onTimeZone?: (tz: string) => void
}) {
  const { c } = useTheme()
  const { data, loading, reload } = useApi<PeopleResponse>('/api/mobile/people')
  const [query, setQuery] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    if (data?.timeZone) onTimeZone?.(data.timeZone)
  }, [data?.timeZone, onTimeZone])

  const q = query.trim().toLowerCase()
  const people = (data?.people ?? []).filter(
    (p) => !q || [p.name, p.fullName, p.company, p.title].some((v) => v?.toLowerCase().includes(q)),
  )

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12, minHeight: TOUCH }}>
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

      {loading ? (
        <Loading label="Loading people" />
      ) : (
        <View style={{ marginTop: 6 }}>
          {people.slice(0, 30).map((p) => {
            const on = selected.includes(p.id)
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}${p.company ? `, ${p.company}` : ''}${p.isDemo ? ', invented sample person' : ''}`}
                onPress={() => onToggle(p)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56, opacity: pressed ? 0.8 : 1, borderBottomWidth: 1, borderBottomColor: c.line })}
              >
                <Avatar name={p.fullName} src={p.src} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T variant="small" style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>{p.name}</T>
                  <T variant="meta" tone="muted" numberOfLines={1}>
                    {[p.title, p.company, p.isDemo ? 'Sample' : null].filter(Boolean).join(' · ') || ' '}
                  </T>
                </View>
                <Feather name={on ? 'check-circle' : 'circle'} size={22} color={on ? c.ink : c.lineStrong} />
              </Pressable>
            )
          })}
          {people.length === 0 && q ? <T variant="small" tone="muted" style={{ marginTop: 10 }}>Nobody on record by that name.</T> : null}
        </View>
      )}

      {adding ? (
        <NewPerson
          initialName={query}
          onCancel={() => setAdding(false)}
          onAdded={(person) => {
            setAdding(false)
            setQuery('')
            onToggle(person)
            reload()
          }}
        />
      ) : (
        <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
          <Button label={q ? `Add “${query.trim()}” as someone new` : 'Someone new'} icon="user-plus" variant="ghost" onPress={() => setAdding(true)} />
        </View>
      )}
    </View>
  )
}

export function NewPerson({
  initialName,
  onCancel,
  onAdded,
}: {
  initialName: string
  onCancel: () => void
  onAdded: (person: { id: string; name: string; fullName: string; src: null }) => void
}) {
  const { c } = useTheme()
  const [fullName, setFullName] = React.useState(initialName.trim())
  const [company, setCompany] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<CreatePersonResponse>('/api/mobile/people', {
        fullName: fullName.trim(),
        organizationName: company.trim() || undefined,
        jobTitle: title.trim() || undefined,
      })
      if (result.ok) onAdded({ id: result.personId, name: fullName.trim(), fullName: fullName.trim(), src: null })
      else setError(result.error)
    } catch (e) {
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline.'
          : e instanceof ApiError && e.failure.kind === 'server'
            ? // The web's limit wording may suggest upgrading; the app sells nothing.
              /upgrade|pro\b/i.test(e.failure.message)
              ? 'This account already holds as many people as its plan includes.'
              : e.failure.message
            : 'That person could not be added. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.bgSunken, gap: 12 }}>
      <T variant="label" tone="muted">Someone new</T>
      <Field label="Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" textContentType="name" />
      <Field label="Company (optional)" value={company} onChangeText={setCompany} textContentType="organizationName" />
      <Field label="Role (optional)" value={title} onChangeText={setTitle} textContentType="jobTitle" />
      {error ? <T variant="small" tone="critical" accessibilityRole="alert">{error}</T> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Add" icon="check" busy={busy} disabled={!fullName.trim()} onPress={() => void add()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </View>
  )
}
