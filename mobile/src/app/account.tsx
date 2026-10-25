import * as React from 'react'
import { Alert, Linking, Switch, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import * as Application from 'expo-application'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import Feather from '@expo/vector-icons/Feather'
import type {
  AccountResponse,
  CalendarConnection,
  ExportResponse,
  PreferencesResponse,
  RedeemAccessResponse,
  SampleDataResponse,
} from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { formatDate } from '~/lib/format'
import { useAuth } from '~/lib/auth'
import { config } from '~/lib/config'
import { Failure, Loading, Screen, Section, Card, StaleNote } from '~/components/screen'
import { Button } from '~/components/button'
import { T } from '~/components/text'
import { TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * ACCOUNT
 * =============================================================================
 * Who is signed in, the plan and where it is managed, the legal pages, sign
 * out, and deletion -- reachable from inside the app, as App Review requires
 * and as anyone deserves.
 *
 * Deletion asks twice: once to open the confirmation, once with the word
 * typed. It runs the same server workflow as the web, which stops billing
 * before anything is deleted. An App Store subscription is the one thing the
 * app cannot stop for you; if there is one, the screen says so and asks the
 * person to confirm they have cancelled it.
 * =============================================================================
 */
export default function Account() {
  const { c } = useTheme()
  const { signOut } = useAuth()
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<AccountResponse>('/api/mobile/account')
  const [confirming, setConfirming] = React.useState(false)
  // Back from the profile editor, or from the web: show what is current.
  useFresh(reload)

  if (loading) return <Screen topInset={false}><Loading /></Screen>
  if (error || !data) {
    return <Screen topInset={false} onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>
  }

  const billingLine =
    data.billing === 'web'
      ? 'Billed on the web. Change or cancel it from Settings › Plan at atturel.com.'
      : data.billing === 'apple'
        ? 'Billed by Apple. Change or cancel it in Settings › Apple ID › Subscriptions.'
        : data.billing === 'included'
          ? 'Included with your access. Nothing is billed.'
          : 'Nothing is billed.'

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <Card>
        <T variant="title" accessibilityRole="header">{data.name}</T>
        {data.email ? <T variant="small" tone="secondary" style={{ marginTop: 2 }}>{data.email}</T> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Feather name="award" size={14} color={c.accent} />
          <T variant="small">{data.planLabel}</T>
        </View>
        <T variant="meta" tone="muted" style={{ marginTop: 4 }}>{billingLine}</T>
        <View style={{ marginTop: 14, alignItems: 'flex-start' }}>
          <Button label="Edit profile" icon="user" variant="secondary" onPress={() => router.push('/profile')} />
        </View>
      </Card>

      <Notifications />

      {data.calendar ? <Calendar connections={data.calendar.connections} /> : null}

      <PrivacyAndData />

      <Section label="Help" icon="help-circle">
        <LinkRow
          icon="mail"
          label={`Contact ${data.legal.supportEmail}`}
          onPress={() => void Linking.openURL(`mailto:${data.legal.supportEmail}`)}
        />
        <LinkRow icon="lock" label="Privacy" onPress={() => void Linking.openURL(data.legal.privacyUrl)} />
        <LinkRow icon="file-text" label="Terms" onPress={() => void Linking.openURL(data.legal.termsUrl)} />
      </Section>

      {data.planLabel === 'Free' ? <PilotCode onRedeemed={refresh} /> : null}

      {data.sampleData ? <SampleData loaded={data.sampleData.loaded} onChanged={refresh} /> : null}

      <Section label="Session" icon="log-out">
        <Button label="Sign out" variant="secondary" icon="log-out" onPress={() => void signOut()} />
      </Section>

      <Section label="Delete account" icon="trash-2">
        {confirming ? (
          <DeleteAccount onCancel={() => setConfirming(false)} />
        ) : (
          <>
            <T variant="small" tone="secondary">
              Permanently deletes every person, conversation, commitment and note in your account. This cannot be undone.
            </T>
            <View style={{ marginTop: 12 }}>
              <Button label="Delete account…" variant="danger" icon="trash-2" onPress={() => setConfirming(true)} />
            </View>
          </>
        )}
      </Section>

      <T variant="meta" tone="muted" style={{ marginTop: 24, textAlign: 'center' }}>
        {[
          `Atturel ${Application.nativeApplicationVersion ?? ''}${Application.nativeBuildVersion ? ` (build ${Application.nativeBuildVersion})` : ''}`.trim(),
          config.previewData ? null : `Signed in to ${config.apiUrl.replace(/^https?:\/\//, '')}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </T>
    </Screen>
  )
}

/**
 * Which emails Atturel sends. The delivery hour is not offered yet: it waits
 * on the daily schedule's fix (audit finding 3.4).
 */
function Notifications() {
  const { data, error, reload } = useApi<PreferencesResponse>('/api/mobile/preferences')
  const [shown, setShown] = React.useState<PreferencesResponse | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (data) setShown(data)
  }, [data])

  const change = async (key: keyof PreferencesResponse, value: boolean) => {
    if (!shown) return
    const before = shown
    setShown({ ...shown, [key]: value })
    setMessage(null)
    try {
      setShown(await api.patch<PreferencesResponse>('/api/mobile/preferences', { [key]: value }))
    } catch (e) {
      setShown(before)
      setMessage(e instanceof ApiError && e.failure.kind === 'offline' ? 'You are offline. Nothing changed.' : 'That could not be changed. Try again.')
    }
  }

  return (
    <Section label="Notifications" icon="bell">
      {shown ? (
        <View style={{ gap: 4 }}>
          <Toggle
            label="Useful Atturel email"
            detail="The daily follow-through below. Never marketing. Plan, billing and security notices are always sent, because they are about your account."
            value={shown.emailNotifications}
            onChange={(v) => void change('emailNotifications', v)}
          />
          <Toggle
            label="Daily follow-through"
            detail="One short email on days something you confirmed is due, overdue, or waiting on someone."
            value={shown.emailNotifications && shown.followThroughEmail}
            disabled={!shown.emailNotifications}
            onChange={(v) => void change('followThroughEmail', v)}
          />
        </View>
      ) : error ? (
        <View style={{ alignItems: 'flex-start' }}>
          <T variant="small" tone="secondary">Your email settings could not be loaded.</T>
          <Button label="Try again" variant="ghost" onPress={() => void reload()} />
        </View>
      ) : (
        <Loading label="Loading email settings" />
      )}
      {message ? <T variant="small" tone="critical" style={{ marginTop: 6 }} accessibilityRole="alert">{message}</T> : null}
    </Section>
  )
}

function Toggle({
  label,
  detail,
  value,
  onChange,
  disabled,
}: {
  label: string
  detail: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T variant="small">{label}</T>
        <T variant="meta" tone="muted">{detail}</T>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} accessibilityLabel={label} accessibilityHint={detail} />
    </View>
  )
}

const PROVIDER: Record<string, string> = { google: 'Google Calendar', microsoft: 'Microsoft Outlook' }

/** Connected calendars, read-only: connecting and disconnecting are on the web. */
function Calendar({ connections }: { connections: CalendarConnection[] }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <Section label="Calendar" icon="calendar">
      {connections.length === 0 ? (
        <T variant="small" tone="secondary">No calendar connected. Connect one from Settings › Calendar at atturel.com, read-only.</T>
      ) : (
        <View style={{ gap: 10 }}>
          {connections.map((c) => (
            <View key={`${c.provider}-${c.accountEmail ?? ''}`}>
              <T variant="small">{PROVIDER[c.provider] ?? c.provider}{c.accountEmail ? ` · ${c.accountEmail}` : ''}</T>
              <T variant="meta" tone="muted">
                {[c.status === 'active' ? 'Connected' : c.status.replace(/_/g, ' '), c.lastSyncedAt ? `last synced ${formatDate(c.lastSyncedAt, tz)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </T>
            </View>
          ))}
          <T variant="meta" tone="muted">Read-only. Atturel never creates, edits or answers anything. Manage it at atturel.com.</T>
        </View>
      )}
    </Section>
  )
}

/**
 * What is kept, and a copy of all of it. The export is the web's own
 * Privacy & data export: one JSON file, handed to the share sheet to save to
 * Files or send on. It is written to the app's cache only for that moment.
 */
function PrivacyAndData() {
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const exportData = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.get<ExportResponse>('/api/mobile/export')
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      const day = new Date().toISOString().slice(0, 10)
      const file = new File(Paths.cache, `atturel-export-${day}.json`)
      if (file.exists) file.delete()
      file.create()
      file.write(result.json)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Your Atturel data' })
      } else {
        setMessage('Sharing is not available on this device. Export from Settings › Privacy & data at atturel.com.')
      }
    } catch (e) {
      setMessage(e instanceof ApiError && e.failure.kind === 'offline' ? 'You are offline.' : 'Your data could not be exported. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section label="Privacy and data" icon="shield">
      <T variant="small" tone="secondary">
        Atturel keeps the people you add, the conversations and loops you keep, your meetings and briefs, and your settings. Atturel does not keep audio: it is used only to make the transcript. The Privacy page says how the transcription provider handles it.
      </T>
      <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <Button label="Export my data" icon="download" variant="secondary" busy={busy} onPress={() => void exportData()} />
      </View>
      {message ? <T variant="small" tone="secondary" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">{message}</T> : null}
    </Section>
  )
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  onPress: () => void
}) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Button label={label} variant="ghost" icon={icon} onPress={onPress} accessibilityHint="Opens outside the app" />
    </View>
  )
}

/**
 * A pilot invitation code, for people invited to try Atturel in full. The
 * web's own redemption (Settings › Access): the code is hashed before it
 * reaches the database, and it can only ever grant pilot access. Nothing is
 * bought or sold here.
 */
function PilotCode({ onRedeemed }: { onRedeemed: () => void }) {
  const { c } = useTheme()
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const redeem = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.post<RedeemAccessResponse>('/api/mobile/access', { code: code.trim() })
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })
      if (result.ok) onRedeemed()
    } catch (e) {
      setMessage({
        ok: false,
        text:
          e instanceof ApiError && e.failure.kind === 'offline'
            ? 'You appear to be offline.'
            : e instanceof ApiError && e.failure.kind === 'server'
              ? e.failure.message
              : e instanceof ApiError && e.failure.kind === 'not_found'
                ? 'Codes cannot be redeemed from the app yet. Use Settings › Access on atturel.com.'
                : 'That code could not be checked. Try again.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section label="Invitation code" icon="key">
      <T variant="small" tone="secondary">Invited to try Atturel in full? Enter the code you were given.</T>
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Invitation code"
        placeholder="ATT-XXXX-XXXX-XXXX"
        placeholderTextColor={c.inkFaint}
        style={{ marginTop: 10, minHeight: TOUCH, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 10, paddingHorizontal: 12, color: c.ink, backgroundColor: c.surface, fontFamily: 'InstrumentSans_400Regular', fontSize: 16 }}
      />
      <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
        <Button label="Redeem" variant="secondary" busy={busy} disabled={code.trim().length < 6} onPress={() => void redeem()} />
      </View>
      {message ? (
        <T variant="small" tone={message.ok ? 'positive' : 'critical'} style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
          {message.text}
        </T>
      ) : null}
    </Section>
  )
}

/**
 * The invented sample record: for seeing what Atturel does before there is
 * anything of one's own, and for showing it to someone. Every sample person
 * is marked as invented wherever they appear. Removing it also removes what
 * was captured with those invented people -- never anything involving a real
 * person -- so a demonstration can be reset and run again.
 */
function SampleData({ loaded, onChanged }: { loaded: boolean; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const run = async (load: boolean) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = load
        ? await api.post<SampleDataResponse>('/api/mobile/sample-data', {})
        : await api.delete<SampleDataResponse>('/api/mobile/sample-data')
      setMessage(result.ok ? result.message : result.error)
      if (result.ok) onChanged()
    } catch (e) {
      setMessage(e instanceof ApiError && e.failure.kind === 'offline' ? 'You are offline. Nothing changed.' : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const confirmRemove = () =>
    Alert.alert(
      'Remove the sample record?',
      'The invented people, their meeting, and anything you captured or prepared with only them are removed. Nothing involving a real person is touched.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void run(false) },
      ],
    )
  return (
    <Section label="Sample record" icon="eye">
      <T variant="small" tone="secondary">
        {loaded
          ? 'Invented sample people are in this account, marked “Sample · invented” wherever they appear.'
          : 'Load a few invented people, a past conversation and an upcoming meeting to see how Atturel works. They are marked as samples everywhere.'}
      </T>
      <View style={{ marginTop: 12, gap: 8 }}>
        {loaded ? (
          <>
            <Button label="Remove sample record" variant="secondary" icon="trash" busy={busy} onPress={confirmRemove} />
            <T variant="meta" tone="muted">To run a demonstration again: remove it, then load it fresh.</T>
          </>
        ) : (
          <Button label="Load sample people" variant="secondary" icon="eye" busy={busy} onPress={() => void run(true)} />
        )}
      </View>
      {message ? <T variant="small" tone="secondary" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">{message}</T> : null}
    </Section>
  )
}

/**
 * The confirmation. Typed, not tapped: a stray tap must never delete a
 * relationship record.
 */
function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const { c } = useTheme()
  const { signOut } = useAuth()
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [needsAppleAck, setNeedsAppleAck] = React.useState(false)

  const ready = typed.trim().toLowerCase() === 'delete'

  async function run(appleAcknowledged: boolean) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.deleteAccount({ confirmation: typed, appleAcknowledged })
      if (result.deleted) {
        // The account is gone; clear the Keychain whatever the server says.
        await signOut()
        return
      }
      if (result.stage === 'apple_acknowledgement') setNeedsAppleAck(true)
      setMessage(result.error)
    } catch (e) {
      setMessage(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You appear to be offline. Nothing was deleted.'
          : 'Something went wrong. Nothing was deleted.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="critical">
      <T variant="small">
        This deletes your whole record, permanently. A paid plan billed on the web is cancelled first, and you will not be charged again.
      </T>
      <T variant="meta" tone="secondary" style={{ marginTop: 12 }}>Type DELETE to confirm</T>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Type DELETE to confirm"
        placeholder="DELETE"
        placeholderTextColor={c.inkFaint}
        style={{
          marginTop: 6,
          minHeight: TOUCH,
          borderWidth: 1,
          borderColor: c.lineStrong,
          borderRadius: 10,
          paddingHorizontal: 12,
          color: c.ink,
          backgroundColor: c.surface,
          fontFamily: 'InstrumentSans_400Regular',
          fontSize: 16,
        }}
      />
      {message ? (
        <T variant="small" tone="critical" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
          {message}
        </T>
      ) : null}
      <View style={{ marginTop: 14, gap: 8 }}>
        {needsAppleAck ? (
          <Button
            label="I have cancelled it — delete my account"
            variant="danger"
            icon="trash-2"
            busy={busy}
            disabled={!ready}
            onPress={() => void run(true)}
          />
        ) : (
          <Button
            label="Permanently delete"
            variant="danger"
            icon="trash-2"
            busy={busy}
            disabled={!ready}
            onPress={() => void run(false)}
          />
        )}
        <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </View>
    </Card>
  )
}
