import * as React from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type {
  PersonEditFields,
  PersonResponse,
  UpdatePersonRequest,
  UpdatePersonResponse,
} from '@atturel/web/lib/mobile/contracts'
import { RELATIONSHIP_OPTIONS } from '@atturel/web/lib/people/relationship-options'
import { RELEVANCE_LABELS } from '@atturel/web/lib/visual/relevance'
import { api, ApiError, fieldErrorsOf, useApi } from '~/lib/api'
import { Button } from '~/components/button'
import { ChoiceField, TimeZoneField } from '~/components/choice'
import { Field } from '~/components/field'
import { Empty, Failure, Loading, Screen, Section } from '~/components/screen'
import { T } from '~/components/text'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * CORRECT A RECORD
 * =============================================================================
 * The web's edit form, field for field, through the web's own validation.
 * Correcting the record here changes what every future brief is built on.
 * Only professional context: Atturel never asks for personal characteristics.
 * =============================================================================
 */

type Form = Required<{ [K in keyof UpdatePersonRequest]: NonNullable<UpdatePersonRequest[K]> }>

function toForm(edit: PersonEditFields): Form {
  return {
    fullName: edit.fullName,
    preferredName: edit.preferredName ?? '',
    jobTitle: edit.jobTitle ?? '',
    organizationName: edit.organizationName ?? '',
    email: edit.email ?? '',
    profileUrl: edit.profileUrl ?? '',
    relationshipType: edit.relationshipType,
    relevance: edit.relevance,
    pronouns: edit.pronouns ?? '',
    timezone: edit.timezone ?? '',
    notes: edit.notes ?? '',
  }
}

const RELEVANCE_OPTIONS = RELEVANCE_LABELS.map((label, i) => ({ value: i + 1, label }))

export default function EditPerson() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, loading, refresh } = useApi<PersonResponse>(
    id ? `/api/mobile/people/${id}` : null,
  )
  const [form, setForm] = React.useState<Form | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  React.useEffect(() => {
    if (data?.edit && form === null) setForm(toForm(data.edit))
  }, [data, form])

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
  if (!data.edit) {
    return (
      <Screen topInset={false}>
        <Empty
          icon="edit-3"
          title="Edit on the web for now"
          body="This server does not offer editing to the app yet. Use atturel.com."
        />
      </Screen>
    )
  }
  if (!form)
    return (
      <Screen topInset={false}>
        <Loading />
      </Screen>
    )

  const set =
    <K extends keyof Form>(key: K) =>
    (value: Form[K]) => {
      setForm((f) => (f ? { ...f, [key]: value } : f))
      setFieldErrors((e) => ({ ...e, [key]: [] }))
    }
  const err = (key: keyof Form) => fieldErrors[key]?.[0] ?? null

  const save = async () => {
    setBusy(true)
    setMessage(null)
    setFieldErrors({})
    try {
      const result = await api.patch<UpdatePersonResponse>(`/api/mobile/people/${data.person.id}`, {
        ...form,
        fullName: form.fullName.trim(),
      } satisfies UpdatePersonRequest)
      if (result.ok) router.back()
      else {
        setMessage(result.error)
        setFieldErrors(result.fieldErrors ?? {})
      }
    } catch (e) {
      setFieldErrors(fieldErrorsOf(e))
      setMessage(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline. Nothing was saved.'
          : e instanceof ApiError && e.failure.kind === 'server'
            ? e.failure.message
            : 'Those changes could not be saved. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen topInset={false}>
      <T variant="small" tone="secondary">
        Correcting the record here changes what every future brief is built on.
      </T>
      <View style={{ gap: 14, marginTop: 16 }}>
        <Field
          label="Full name"
          value={form.fullName}
          onChangeText={set('fullName')}
          error={err('fullName')}
          autoCapitalize="words"
          textContentType="name"
        />
        <Field
          label="Preferred name (optional)"
          hint="What you actually call them."
          value={form.preferredName}
          onChangeText={set('preferredName')}
          error={err('preferredName')}
        />
        <Field
          label="Role or title (optional)"
          value={form.jobTitle}
          onChangeText={set('jobTitle')}
          error={err('jobTitle')}
          textContentType="jobTitle"
        />
        <Field
          label="Company (optional)"
          value={form.organizationName}
          onChangeText={set('organizationName')}
          error={err('organizationName')}
          textContentType="organizationName"
        />
      </View>

      <Section label="How you know them" icon="users">
        <View style={{ gap: 14 }}>
          <ChoiceField
            label="Relationship"
            value={form.relationshipType}
            options={RELATIONSHIP_OPTIONS}
            onChange={set('relationshipType')}
          />
          <ChoiceField
            label="How much does this relationship matter?"
            hint="Your call, never inferred. Used to order what Atturel puts in front of you."
            value={form.relevance}
            options={RELEVANCE_OPTIONS}
            onChange={set('relevance')}
          />
        </View>
      </Section>

      <Section label="More about them" icon="info">
        <View style={{ gap: 14 }}>
          <Field
            label="Pronouns (optional)"
            hint="Only if they have told you."
            value={form.pronouns}
            onChangeText={set('pronouns')}
            error={err('pronouns')}
            autoCapitalize="none"
          />
          <TimeZoneField
            label="Their time zone"
            hint="For meeting times and when to follow up."
            value={form.timezone}
            onChange={set('timezone')}
            optional
          />
          <Field
            label="Email (optional)"
            value={form.email}
            onChangeText={set('email')}
            error={err('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <Field
            label="Profile or company page (optional)"
            value={form.profileUrl}
            onChangeText={set('profileUrl')}
            error={err('profileUrl')}
            keyboardType="url"
            autoCapitalize="none"
          />
          <Field
            label="What should Atturel know? (optional)"
            value={form.notes}
            onChangeText={set('notes')}
            error={err('notes')}
            multiline
          />
        </View>
      </Section>

      {message ? (
        <T variant="small" tone="critical" style={{ marginTop: 16 }} accessibilityRole="alert">
          {message}
        </T>
      ) : null}
      <View style={{ marginTop: 20, gap: 8 }}>
        <Button
          label="Save changes"
          icon="check"
          busy={busy}
          disabled={!form.fullName.trim()}
          onPress={() => void save()}
        />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => router.back()} />
      </View>
    </Screen>
  )
}
