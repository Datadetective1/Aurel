import * as React from 'react'
import { Linking, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import type { CalendarConnection, CalendarSyncResponse } from '@atturel/web/lib/mobile/contracts'
import { CALENDAR_STATE, type CalendarState } from '@atturel/web/lib/calendar/freshness'
import { api, ApiError } from '~/lib/api'
import { formatDate } from '~/lib/format'
import { useTheme } from '~/theme'
import { Button } from './button'
import { Section } from './screen'
import { T } from './text'

/**
 * CALENDAR, ON THE ACCOUNT SCREEN (finding 8.6)
 * =============================================================================
 * Each connection in the website's own words: its state, the date and time it
 * last synced in the account's time zone, and a flag when that was more than a
 * day ago. Sync now is here, and runs only when pressed: the app never syncs
 * on open or in the background. A sync that failed offers Try again; only a
 * grant the calendar refused asks for a reconnect. Reconnecting and
 * disconnecting stay on the website, which the screen links to.
 * =============================================================================
 */

const PROVIDER: Record<string, string> = { google: 'Google Calendar', microsoft: 'Microsoft Outlook' }

export function CalendarConnections({
  connections,
  manageUrl,
  onGone,
}: {
  connections: CalendarConnection[]
  manageUrl?: string
  /** A connection turned out to be gone: reload the screen. */
  onGone: () => void
}) {
  return (
    <Section label="Calendar" icon="calendar">
      {connections.length === 0 ? (
        <T variant="small" tone="secondary">No calendar connected. Connect one at atturel.com, read-only.</T>
      ) : (
        <View style={{ gap: 16 }}>
          {connections.map((c) => (
            <Connection key={`${c.provider}-${c.accountEmail ?? ''}`} connection={c} manageUrl={manageUrl} onGone={onGone} />
          ))}
          <T variant="meta" tone="muted">
            Read-only. Atturel reads your next 14 days only when you press Sync now, and never creates, edits or answers anything. Reconnect or disconnect at atturel.com.
          </T>
        </View>
      )}
    </Section>
  )
}

/** What an older server, which sends no description, still lets the app say. */
function fallbackLine(connection: CalendarConnection): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const label = CALENDAR_STATE[connection.status as CalendarState]?.label ?? 'Needs attention'
  return [label, connection.lastSyncedAt ? `Last synced ${formatDate(connection.lastSyncedAt, tz)}` : 'Never synced'].join(' · ')
}

function Connection({
  connection,
  manageUrl,
  onGone,
}: {
  connection: CalendarConnection
  manageUrl?: string
  onGone: () => void
}) {
  const { c } = useTheme()
  const [shown, setShown] = React.useState(connection)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null)
  React.useEffect(() => setShown(connection), [connection])
  const view = shown.view

  const sync = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.post<CalendarSyncResponse>(`/api/mobile/calendar/${encodeURIComponent(shown.provider)}/sync`, {})
      setShown(result.connection)
      setMessage({ text: result.outcome.message, ok: result.outcome.ok })
    } catch (e) {
      const failure = e instanceof ApiError ? e.failure : null
      if (failure?.kind === 'not_found') {
        setMessage({ text: 'That calendar is no longer connected.', ok: false })
        onGone()
        return
      }
      setMessage({
        ok: false,
        text:
          failure?.kind === 'offline'
            ? 'You are offline. Nothing was synced.'
            : failure?.kind === 'plan_required' || failure?.kind === 'server'
              ? failure.message
              : 'That did not go through. Try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
      <T variant="small">{PROVIDER[shown.provider] ?? shown.provider}{shown.accountEmail ? ` · ${shown.accountEmail}` : ''}</T>
      <T variant="meta" tone={view?.tone === 'caution' ? 'caution' : 'muted'}>
        {view ? `${view.label} · ${view.synced}` : fallbackLine(shown)}
      </T>
      {view?.detail ? <T variant="meta" tone="secondary" style={{ marginTop: 2 }}>{view.detail}</T> : null}
      {view?.note ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Feather name="alert-circle" size={13} color={c.caution} style={{ marginTop: 2 }} />
          <T variant="meta" tone="caution" style={{ flex: 1 }}>{view.note}</T>
        </View>
      ) : null}
      {view?.sync || (view?.reconnect && manageUrl) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {view.sync ? (
            <Button
              label={view.sync}
              icon="refresh-cw"
              variant={view.sync === 'Try again' ? 'primary' : 'secondary'}
              busy={busy}
              accessibilityHint="Reads your next 14 days from this calendar now"
              onPress={() => void sync()}
            />
          ) : null}
          {view.reconnect && manageUrl ? (
            <Button
              label="Reconnect at atturel.com"
              icon="external-link"
              variant="ghost"
              accessibilityHint="Opens outside the app"
              onPress={() => void Linking.openURL(manageUrl)}
            />
          ) : null}
        </View>
      ) : null}
      {message ? (
        <T variant="small" tone={message.ok ? 'secondary' : 'caution'} style={{ marginTop: 6 }} accessibilityRole="alert">
          {message.text}
        </T>
      ) : null}
    </View>
  )
}
