'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CircleAlert, CircleCheck, Loader2, RefreshCw, Unplug } from 'lucide-react'
import { disconnectCalendar, syncCalendarNow } from '@/app/(app)/calendar-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'
import {
  CALENDAR_STATE,
  calendarActions,
  type CalendarFreshness,
  type CalendarState,
} from '@/lib/calendar/freshness'

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
 * Connected is not current, either. Nothing syncs in the background, so every
 * saved connection says when it last synced, date included, and flags a sync
 * more than a day old (finding 8.6). Only a grant the provider refused asks
 * for a reconnect; a sync that failed offers Try again. Every saved
 * connection can be disconnected, whatever its state.
 *
 * `admin_consent_required` gets its own state on purpose. It is the one failure
 * a user genuinely cannot fix by trying again, and treating it as a generic
 * error would leave them clicking Connect until they gave up.
 * =============================================================================
 */

export type CalendarConnectionStatus = CalendarState

export interface CalendarConnection {
  provider: 'microsoft' | 'google'
  label: string
  status: CalendarConnectionStatus
  /** A grant is stored for this provider, whatever state it is in. */
  saved: boolean
  accountEmail: string | null
  /**
   * When it last synced, worked out on the server in the account holder's own
   * time zone. Null when nothing is saved.
   *
   * Not an ISO string formatted here: this is a client component, so it renders
   * on both sides, and toLocaleTimeString with an ambient locale gives en-US/UTC
   * on the server and the browser's own settings on the client. The two
   * disagree, React discards the server HTML, and it was throwing #418 on this
   * screen in production.
   */
  freshness: CalendarFreshness | null
  eventCount: number
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

  const state = CALENDAR_STATE[connection.status]
  const actions = calendarActions(connection.status, connection.saved)
  const isConnected = connection.status === 'connected'
  const canConnect = connection.status !== 'unavailable' && connection.status !== 'plan_required'
  const planRequired = connection.status === 'plan_required'
  const freshness = connection.freshness

  async function run(kind: 'sync' | 'disconnect') {
    setBusy(kind)
    setMessage(null)
    try {
      const result =
        kind === 'sync'
          ? await syncCalendarNow(connection.provider)
          : await disconnectCalendar(connection.provider)
      if (result.error) setMessage({ text: result.error, ok: false })
      else if (result.message) setMessage({ text: result.message, ok: true })
      router.refresh()
    } catch {
      // A dropped connection, not a refusal: say so, and leave the button usable.
      setMessage({
        text: 'That did not reach the server. Nothing was changed. Try again.',
        ok: false,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border-line bg-bg-sunken min-w-0 rounded-[var(--radius-md)] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="text-ink-muted size-3.5 shrink-0" aria-hidden="true" />
            {connection.label}
          </p>

          {connection.saved && connection.accountEmail ? (
            <p className="text-ink-muted mt-1 truncate text-xs">{connection.accountEmail}</p>
          ) : null}

          <p className="text-ink-secondary mt-1.5 text-xs leading-relaxed">
            {isConnected
              ? `Reads your next 14 days each time you press Sync now. ${brand.name} never creates, edits or responds to anything in your calendar.`
              : state.detail}
          </p>

          {freshness ? (
            <p className="text-ink-faint mt-1 text-[0.6875rem]">
              {isConnected
                ? `${connection.eventCount} upcoming ${connection.eventCount === 1 ? 'meeting' : 'meetings'} · `
                : ''}
              {freshness.label}
            </p>
          ) : null}

          {freshness?.note ? (
            <p className="text-ink-secondary mt-1.5 flex items-start gap-2 text-xs leading-relaxed">
              <CircleAlert className="text-caution mt-px size-3.5 shrink-0" aria-hidden="true" />
              {freshness.note}
            </p>
          ) : null}
        </div>

        <Badge tone={state.tone} className="shrink-0">
          {state.label}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.sync ? (
          <Button
            size="sm"
            variant={connection.status === 'error' ? 'primary' : 'secondary'}
            onClick={() => run('sync')}
            disabled={busy !== null}
          >
            {busy === 'sync' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {actions.sync}
              </>
            )}
          </Button>
        ) : null}

        {actions.reconnect && canConnect ? (
          <Button asChild size="sm" variant="primary">
            <a href={`/api/calendar/${connection.provider}/connect`}>Reconnect</a>
          </Button>
        ) : null}

        {!connection.saved && canConnect ? (
          <Button asChild size="sm" variant="secondary">
            <a href={`/api/calendar/${connection.provider}/connect`}>Connect</a>
          </Button>
        ) : null}

        {planRequired ? (
          <Button asChild size="sm" variant="secondary">
            <a href="/settings/billing">See Pro</a>
          </Button>
        ) : null}

        {actions.disconnect ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run('disconnect')}
            disabled={busy !== null}
          >
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
