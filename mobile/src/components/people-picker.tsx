import * as React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import type {
  CreatePersonResponse,
  PeopleResponse,
  PersonLifecycleResponse,
  PossibleDuplicate,
  VisualPerson,
} from '@atturel/web/lib/mobile/contracts'
import { brand } from '@atturel/web/lib/brand'
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
  hidden = [],
  onToggle,
  onTimeZone,
}: {
  selected: string[]
  /** People not to offer: already in the meeting. */
  hidden?: string[]
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
    (p) =>
      !hidden.includes(p.id) &&
      (!q || [p.name, p.fullName, p.company, p.title].some((v) => v?.toLowerCase().includes(q))),
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
          existingLabel="Choose them"
          onCancel={() => setAdding(false)}
          onAdded={(person) => {
            setAdding(false)
            setQuery('')
            onToggle(person)
            reload()
          }}
          onExisting={(person) => {
            setAdding(false)
            setQuery('')
            if (!selected.includes(person.id)) onToggle(person)
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

type NewPersonResult = { id: string; name: string; fullName: string; src: null }

const MATCHED_ON: Record<PossibleDuplicate['reason'], string> = {
  email: 'Same email.',
  profile: 'Same profile link.',
  name: 'Same name.',
}

/**
 * Someone new, by name. Before anything is created the server says whether
 * this person is probably already on record -- same email, profile link or
 * name, kept or archived -- and the choice is the user's: the existing
 * record (restored, if it was archived), or someone new after all.
 */
export function NewPerson({
  initialName,
  onCancel,
  onAdded,
  onExisting,
  existingLabel = 'Open',
  initial,
}: {
  initialName: string
  /**
   * Everything else already known, as from a scanned card. When given, the
   * contact fields show too, so the user checks each one before it is saved.
   */
  initial?: { company?: string; title?: string; email?: string; profileUrl?: string; notes?: string }
  onCancel: () => void
  onAdded: (person: NewPersonResult) => void
  /** The person already on record was chosen instead. */
  onExisting: (person: NewPersonResult) => void
  existingLabel?: string
}) {
  const { c } = useTheme()
  const [fullName, setFullName] = React.useState(initialName.trim())
  const [company, setCompany] = React.useState(initial?.company ?? '')
  const [title, setTitle] = React.useState(initial?.title ?? '')
  const [email, setEmail] = React.useState(initial?.email ?? '')
  const [profileUrl, setProfileUrl] = React.useState(initial?.profileUrl ?? '')
  const [notes, setNotes] = React.useState(initial?.notes ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [duplicate, setDuplicate] = React.useState<PossibleDuplicate | null>(null)
  // A first name alone finds nobody. Said on the first Add, not while they
  // type; a second Add goes ahead, because some people are known by one name.
  const [nudged, setNudged] = React.useState(false)
  const oneWord = fullName.trim().length > 0 && !/\s/.test(fullName.trim())

  const say = (e: unknown, fallback: string) =>
    setError(
      e instanceof ApiError && e.failure.kind === 'offline'
        ? 'You are offline.'
        : e instanceof ApiError && (e.failure.kind === 'server' || e.failure.kind === 'conflict')
          ? // The web's limit wording may suggest upgrading; the app sells nothing.
            /upgrade|pro\b/i.test(e.failure.message)
            ? 'This account already holds as many people as its plan includes.'
            : e.failure.message
          : fallback,
    )

  const add = async (confirmDuplicate: boolean) => {
    if (oneWord && !nudged) {
      setNudged(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<CreatePersonResponse>('/api/mobile/people', {
        fullName: fullName.trim(),
        organizationName: company.trim() || undefined,
        jobTitle: title.trim() || undefined,
        email: email.trim() || undefined,
        profileUrl: profileUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        checkDuplicate: true,
        confirmDuplicate: confirmDuplicate || undefined,
      })
      if (result.ok) onAdded({ id: result.personId, name: fullName.trim(), fullName: fullName.trim(), src: null })
      else setError(result.error)
    } catch (e) {
      const found =
        e instanceof ApiError && e.failure.kind === 'conflict'
          ? (e.failure.body as { duplicate?: PossibleDuplicate } | null)?.duplicate
          : undefined
      if (found) setDuplicate(found)
      else say(e, 'That person could not be added. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const useExisting = async (found: PossibleDuplicate) => {
    setBusy(true)
    setError(null)
    try {
      if (found.archived) {
        const restored = await api.post<PersonLifecycleResponse>(`/api/mobile/people/${found.id}/restore`, {})
        if (!restored.ok) {
          setError(restored.error)
          return
        }
      }
      onExisting({ id: found.id, name: found.name, fullName: found.name, src: null })
    } catch (e) {
      say(e, 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.bgSunken, gap: 12 }}>
      <T variant="label" tone="muted">Someone new</T>
      <T variant="small" tone="secondary">
        {`Their full name and company are what ${brand.name} uses to find them in public sources and prepare you.`}
      </T>
      <Field
        label="Full name"
        placeholder="First and last name"
        value={fullName}
        onChangeText={(v) => {
          setFullName(v)
          setDuplicate(null)
        }}
        autoCapitalize="words"
        textContentType="name"
      />
      {oneWord && nudged ? (
        <T variant="small" tone="caution" accessibilityRole="alert">
          Add their last name too. A first name alone is not enough to look anyone up.
        </T>
      ) : null}
      <Field label="Company" placeholder="Where they work" value={company} onChangeText={setCompany} textContentType="organizationName" />
      <Field label="Role (optional)" value={title} onChangeText={setTitle} textContentType="jobTitle" />
      {initial ? (
        <>
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={(v) => {
              setEmail(v)
              setDuplicate(null)
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <Field label="LinkedIn or profile link (optional)" value={profileUrl} onChangeText={setProfileUrl} autoCapitalize="none" keyboardType="url" textContentType="URL" />
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        </>
      ) : null}
      {duplicate ? (
        <View
          accessibilityRole="alert"
          style={{ padding: 12, borderRadius: 12, backgroundColor: c.cautionWash, gap: 10 }}
        >
          <T variant="small">
            You already have {duplicate.name}
            {duplicate.organization ? ` (${duplicate.organization})` : ''}
            {duplicate.archived ? ', removed from your people' : ''}. {MATCHED_ON[duplicate.reason]}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              label={duplicate.archived ? `Restore ${duplicate.name.split(' ')[0]}` : existingLabel}
              icon={duplicate.archived ? 'rotate-ccw' : 'user'}
              variant="secondary"
              busy={busy}
              onPress={() => void useExisting(duplicate)}
            />
            <Button label="Add as someone new" variant="ghost" disabled={busy} onPress={() => void add(true)} />
          </View>
        </View>
      ) : null}
      {error ? <T variant="small" tone="critical" accessibilityRole="alert">{error}</T> : null}
      {duplicate ? null : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={oneWord && nudged ? 'Add anyway' : 'Add'}
              icon="check"
              busy={busy}
              disabled={!fullName.trim()}
              onPress={() => void add(false)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        </View>
      )}
      {duplicate ? <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} /> : null}
    </View>
  )
}
