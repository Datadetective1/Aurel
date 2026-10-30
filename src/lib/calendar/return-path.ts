/**
 * Where a finished (or refused) connection lands.
 *
 * `today` is the activation path: someone connecting from Getting Started
 * should come back to the meetings Atturel just found, not to the full
 * Capabilities page. Settings remains the default, and the only other value
 * accepted -- the destination is chosen from a closed list, never taken from
 * the URL, so this cannot become an open redirect.
 */
export type CalendarReturn = 'today' | 'settings'

export function parseCalendarReturn(value: string | null | undefined): CalendarReturn {
  return value === 'today' ? 'today' : 'settings'
}

export function calendarReturnUrl(origin: string, to: CalendarReturn, reason: string): string {
  return to === 'today'
    ? `${origin}/today?calendar=${encodeURIComponent(reason)}`
    : `${origin}/settings/capabilities?calendar=${encodeURIComponent(reason)}`
}

/**
 * What to tell someone who has just come back from the consent screen.
 *
 * `connected` is the only success. Every other reason is a plain statement of
 * what happened and what still works -- creating a meeting by hand always does
 * -- never an instruction to retry something retrying cannot fix.
 */
export interface CalendarOutcome {
  tone: 'positive' | 'caution'
  title: string
  body: string
}

export function calendarOutcome(
  reason: string | null | undefined,
  brandName: string,
): CalendarOutcome | null {
  switch (reason) {
    case null:
    case undefined:
    case '':
      return null
    case 'connected':
      return {
        tone: 'positive',
        title: 'Calendar connected',
        body: 'Read-only. Your next two weeks are below.',
      }
    case 'denied':
      return {
        tone: 'caution',
        title: 'Calendar not connected',
        body: 'Access was not granted, so nothing was read. You can connect later, or create a meeting by hand.',
      }
    case 'admin_consent_required':
      return {
        tone: 'caution',
        title: 'Your organization needs to approve this',
        body: `Your administrator has to allow ${brandName} to read calendars before you can connect. Until then, create meetings by hand. Preparation works the same way.`,
      }
    case 'no_offline_access':
      return {
        tone: 'caution',
        title: 'Calendar not connected',
        body: 'The connection would have expired within the hour, so it was not kept. Try again and allow ongoing access.',
      }
    default:
      return {
        tone: 'caution',
        title: 'Calendar not connected',
        body: 'Something went wrong on the way back from the provider. Nothing was changed. Try again, or create a meeting by hand.',
      }
  }
}
