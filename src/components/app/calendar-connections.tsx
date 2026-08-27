'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CircleAlert, CircleCheck, Loader2, RefreshCw, Unplug } from 'lucide-react'
import { disconnectCalendar, syncCalendarNow } from '@/app/(app)/calendar-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * CALENDAR CONNECTIONS
 * =============================================================================
 * Connect, sync, disconnect — and states that tell the truth.
 *
 * "Connected" here means a working user grant exists, never that the deployment
 * has a client secret. A configured provider with no grant is "Not connected",
 * because claiming otherwise would have someone waiting for meetings that were
 * never going to arrive.
 *
 * `admin_consent_required` gets its own state on purpose. It is the one failure
 * a user genuinely cannot fix by trying again, and treating it as a generic
 * error would leave them clicking Connect until they gave up.
 * =============================================================================
 */

export type CalendarConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'revoked'
  | 'admin_consent_required'
  | 'error'
  | 'unavailable'

export interface CalendarConnection {
  provider: 'microsoft' | 'google'
  label: string
  status: CalendarConnectionStatus
  accountEmail: string | null
  /**
   * Formatted on the server, in the account holder's own time zone.
   *
   * Not an ISO string formatted here: this is a client component, so it renders
   * on both sides, and toLocaleTimeString with an ambient locale gives en-US/UTC
   * on the server and the browser's own settings on the client. The two
   * disagree, React discards the server HTML, and it was throwing #418 on this
   * screen in production.
   */
  lastSyncedLabel: string | null
  eventCount: number
}

const STATE: Record<
  CalendarConnectionStatus,
  { label: string; tone: 'positive' | 'caution' | 'outline' | 'neutral'; detail: string }
> = {
  connected: { label: 'Connected', tone: 'positive', detail: '' },
  not_connected: {
    label: 'Not connected',
    tone: 'outline',
    detail: 'Read-only access to your upcoming meetings. Nothing is ever written back.',
  },
  expired: {
    label: 'Needs attention',
    tone: 'caution',
    detail: 'The connection expired. Reconnect to keep meetings up to date.',
  },
  revoked: {
    label: 'Needs attention',
    tone: 'caution',
    detail: 'Access was withdrawn at the provider. Reconnect to resume.',
  },
  admin_consent_required: {
    label: 'Needs approval',
    tone: 'caution',
    detail:
      'Your organization requires administrator approval before this app can read calendars. Ask your IT administrator to approve it, then reconnect.',
  },
  error: {
    label: 'Needs attention',
    tone: 'caution',
    detail: 'The last sync did not complete. Reconnect, or try again shortly.',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'outline',
    detail: 'This deployment has no credentials for that provider.',
  },
}

export function CalendarConnections({ connections }: { connections: CalendarConnection[] }) {
  return (
    <div className="grid gap-2.5">
      {connections.map((connection) => (
        <ConnectionRow key={connection.provider} connection={connection} />
      ))}
    </div>
  )
}

function ConnectionRow({ connection }: { connection: CalendarConnection }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<'sync' | 'disconnect' | null>(null)
  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null)

  const state = STATE[connection.status]
  const isConnected = connection.status === 'connected'
  const needsAttention = ['expired', 'revoked', 'error', 'admin_consent_required'].includes(
    connection.status,
  )
  const canConnect = connection.status !== 'unavailable'

  async function run(kind: 'sync' | 'disconnect') {
    setBusy(kind)
    setMessage(null)
    const result =
      kind === 'sync'
        ? await syncCalendarNow(connection.provider)
        : await disconnectCalendar(connection.provider)
    setBusy(null)
    if (result.error) setMessage({ text: result.error, ok: false })
    else if (result.message) setMessage({ text: result.message, ok: true })
    router.refresh()
  }

  return (
    <div className="border-line bg-bg-sunken min-w-0 rounded-[var(--radius-md)] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="text-ink-muted size-3.5 shrink-0" aria-hidden="true" />
            {connection.label}
          </p>

          {isConnected && connection.accountEmail ? (
            <p className="text-ink-muted mt-1 truncate text-xs">{connection.accountEmail}</p>
          ) : null}

          <p className="text-ink-secondary mt-1.5 text-xs leading-relaxed">
            {isConnected
              ? `Reading your next 14 days. ${brand.name} never creates, edits or responds to anything in your calendar.`
              : state.detail}
          </p>

          {isConnected ? (
            <p className="text-ink-faint mt-1 text-[0.6875rem]">
              {connection.eventCount} upcoming{' '}
              {connection.eventCount === 1 ? 'meeting' : 'meetings'}
              {connection.lastSyncedLabel ? ` · synced ${connection.lastSyncedLabel}` : ''}
            </p>
          ) : null}
        </div>

        <Badge tone={state.tone} className="shrink-0">
          {state.label}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isConnected ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => run('sync')} disabled={busy !== null}>
              {busy === 'sync' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Sync now
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run('disconnect')} disabled={busy !== null}>
              {busy === 'disconnect' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Disconnecting…
                </>
              ) : (
                <>
                  <Unplug className="size-3.5" aria-hidden="true" />
                  Disconnect
                </>
              )}
            </Button>
          </>
        ) : canConnect ? (
          <Button asChild size="sm" variant={needsAttention ? 'primary' : 'secondary'}>
            <a href={`/api/calendar/${connection.provider}/connect`}>
              {needsAttention ? 'Reconnect' : 'Connect'}
            </a>
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 text-xs leading-relaxed ${
            message.ok ? 'text-ink-secondary' : 'text-ink-secondary'
          }`}
        >
          {message.ok ? (
            <CircleCheck className="text-positive mt-px size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="text-caution mt-px size-3.5 shrink-0" aria-hidden="true" />
          )}
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
