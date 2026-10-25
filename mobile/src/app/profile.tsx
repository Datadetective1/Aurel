import * as React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import type {
  MeResponse,
  PhotoResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '@atturel/web/lib/mobile/contracts'
import { detectTimezone } from '@atturel/web/lib/timezones'
import { api, ApiError, fieldErrorsOf, useApi } from '~/lib/api'
import { useAuth } from '~/lib/auth'
import { photoForm, pickPhoto } from '~/lib/photo'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { TimeZoneField } from '~/components/choice'
import { Field } from '~/components/field'
import { Empty, Failure, Loading, Screen, Section } from '~/components/screen'
import { T } from '~/components/text'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * YOUR PROFILE
 * =============================================================================
 * Used to make guidance specific to your role; never shared. Your time zone
 * decides when briefings arrive, so this iPhone's zone is offered, never
 * imposed. Your photo is shown only to you: there is no public profile.
 * =============================================================================
 */

type Form = Required<{ [K in keyof UpdateProfileRequest]: NonNullable<UpdateProfileRequest[K]> }>

function problem(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.failure.kind === 'offline')
    return 'You are offline. Nothing was saved.'
  if (e instanceof ApiError && e.failure.kind === 'server') return e.failure.message
  return fallback
}

export default function Profile() {
  const { refreshProfile } = useAuth()
  const { data, error, loading, refresh, reload } = useApi<MeResponse>('/api/mobile/me')
  const [form, setForm] = React.useState<Form | null>(null)
  const [busy, setBusy] = React.useState<'save' | 'photo' | 'unphoto' | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [photoNote, setPhotoNote] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  React.useEffect(() => {
    if (data?.profile && form === null) {
      const p = data.profile
      setForm({
        fullName: p.fullName,
        preferredName: p.preferredName ?? '',
        jobTitle: p.jobTitle ?? '',
        company: p.company ?? '',
        pronouns: p.pronouns ?? '',
        timezone: p.timezone || detectTimezone(),
      })
    }
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
  if (!data.profile) {
    return (
      <Screen topInset={false}>
        <Empty
          icon="user"
          title="Edit on the web for now"
          body="This server does not offer profile editing to the app yet. Use Settings › Profile at atturel.com."
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
    setBusy('save')
    setMessage(null)
    setFieldErrors({})
    try {
      const result = await api.patch<UpdateProfileResponse>('/api/mobile/me', {
        ...form,
        fullName: form.fullName.trim(),
      } satisfies UpdateProfileRequest)
      if (result.ok) {
        void refreshProfile()
        router.back()
      } else {
        setMessage(result.error)
        setFieldErrors(result.fieldErrors ?? {})
      }
    } catch (e) {
      setFieldErrors(fieldErrorsOf(e))
      setMessage(problem(e, 'Those changes could not be saved. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const choosePhoto = async () => {
    setPhotoNote(null)
    setBusy('photo')
    try {
      const uri = await pickPhoto()
      if (!uri) return
      const result = await api.upload<PhotoResponse>('/api/mobile/me/photo', photoForm(uri))
      if (result.ok) reload()
      else setPhotoNote(result.error)
    } catch (e) {
      setPhotoNote(problem(e, 'The photo could not be saved. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const clearPhoto = async () => {
    setPhotoNote(null)
    setBusy('unphoto')
    try {
      const result = await api.delete<PhotoResponse>('/api/mobile/me/photo')
      if (result.ok) reload()
      else setPhotoNote(result.error)
    } catch (e) {
      setPhotoNote(problem(e, 'The photo could not be removed. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen topInset={false}>
      <T variant="small" tone="secondary">
        Used to make guidance specific to your role. Never shared.
      </T>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 }}>
        <Avatar name={form.fullName || data.name} src={data.profile.photo} size={72} />
        <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
          <Button
            label={data.profile.photo ? 'Change photo' : 'Add a photo'}
            icon="image"
            variant="secondary"
            busy={busy === 'photo'}
            disabled={busy !== null && busy !== 'photo'}
            accessibilityHint="Opens your photo library. Atturel sees only the photo you choose."
            onPress={() => void choosePhoto()}
          />
          {data.profile.photo ? (
            <Button
              label="Remove photo"
              icon="x"
              variant="ghost"
              busy={busy === 'unphoto'}
              disabled={busy !== null && busy !== 'unphoto'}
              onPress={() => void clearPhoto()}
            />
          ) : null}
        </View>
      </View>
      <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
        Your photo is shown only to you, in Atturel. It is not part of any public profile.
      </T>
      {photoNote ? (
        <T variant="small" tone="critical" style={{ marginTop: 6 }} accessibilityRole="alert">
          {photoNote}
        </T>
      ) : null}

      <Section label="About you" icon="user">
        <View style={{ gap: 14 }}>
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
            value={form.company}
            onChangeText={set('company')}
            error={err('company')}
            textContentType="organizationName"
          />
          <Field
            label="Pronouns (optional)"
            value={form.pronouns}
            onChangeText={set('pronouns')}
            error={err('pronouns')}
            autoCapitalize="none"
          />
          <TimeZoneField
            label="Your time zone"
            hint="Decides when your briefings arrive."
            value={form.timezone}
            onChange={set('timezone')}
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
          busy={busy === 'save'}
          disabled={!form.fullName.trim() || (busy !== null && busy !== 'save')}
          onPress={() => void save()}
        />
        <Button
          label="Cancel"
          variant="ghost"
          disabled={busy === 'save'}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  )
}
