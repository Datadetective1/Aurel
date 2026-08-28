/**
 * CALENDAR DAYS IN A NAMED ZONE
 * =============================================================================
 * Instants are UTC. Calendar days are not.
 *
 * Every timestamp Atturel stores is an instant, in UTC, and stays that way.
 * But "today", "tomorrow" and "overdue" are not questions about instants — they
 * are questions about which square of a wall calendar somebody is standing in,
 * and that depends entirely on where they are standing.
 *
 * The bug this module exists to prevent: at 21:22 in Chicago on 27 August, UTC
 * has already rolled over to the 28th. Any code that asks the runtime what day
 * it is — `new Date().toISOString().slice(0, 10)`, `setHours(0,0,0,0)`,
 * `toLocaleDateString()` with no zone — gets the server's answer, and on Vercel
 * the server is in UTC. The user is told it is tomorrow.
 *
 * So: no user-facing calendar-day calculation may read the ambient clock. Every
 * function here takes an explicit IANA zone, and the callers get it from the
 * account's profile. That is also what makes these safe in client components —
 * a pinned zone renders identically on the server and at hydration, where
 * `undefined` gives en-US/UTC on one side and the browser's own settings on the
 * other, and React throws the server HTML away.
 *
 * A "day key" here is always `yyyy-mm-dd`, which sorts and compares as a string
 * and is the same shape Postgres `date` columns come back as.
 * =============================================================================
 */

/** Fallback when an account has no usable zone. Never a regional guess. */
export const DEFAULT_TIME_ZONE = 'UTC'

/**
 * A zone we can actually resolve, or UTC.
 *
 * Guards every entry point because a bad identifier makes `Intl` throw, and a
 * date helper is the worst place in the app to raise: it renders inside pages
 * that would otherwise be fine, and the failure looks like a crash rather than
 * a bad setting.
 */
export function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A bare `yyyy-mm-dd` is a calendar day, not an instant.
 *
 * `new Date('2026-08-27')` parses as UTC midnight, so in any zone behind UTC it
 * is the 26th — which is how a due date one day in the future renders as
 * "Today". Date-only strings are therefore compared as strings and never
 * pushed through the Date constructor.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnly(value: string | Date | null | undefined): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value)
}

/**
 * The calendar day an instant falls on, in a given zone.
 *
 * `en-CA` because it formats as `yyyy-mm-dd` natively, which is the one locale
 * whose short date is already the interchange format.
 */
export function dayKeyIn(value: string | Date, timeZone: string): string | null {
  if (isDateOnly(value)) return value
  const date = toDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: safeZone(timeZone),
  }).format(date)
}

/** Today's calendar day, where the account holder is. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dayKeyIn(now, timeZone) ?? now.toISOString().slice(0, 10)
}

/** The wall-clock hour (0–23) where the account holder is. Drives the greeting. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: safeZone(timeZone),
  }).format(now)
  const parsed = Number.parseInt(hour, 10)
  return Number.isNaN(parsed) ? now.getUTCHours() : parsed
}

/**
 * How far a zone is from UTC at a particular instant, in milliseconds.
 *
 * Read from `Intl` rather than a table because the offset is not a property of
 * the zone, it is a property of the zone *at that moment* — DST, and
 * occasionally a government, moves it. `h23` matters: `hour12: false` reports
 * midnight as hour 24 on some engines, which silently lands the whole
 * calculation a day out.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  // Seconds are the finest granularity Intl reports, so the instant's own
  // milliseconds have to be added back or the offset drifts by up to 999ms.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds())
}

/**
 * The UTC instant at which a calendar day begins in a given zone.
 *
 * Used to bound database queries: "meetings today" is a range between two
 * instants, and those instants are local midnights, not UTC midnight.
 *
 * Two passes. The first guesses the offset using UTC midnight, which is wrong
 * by up to a day near a DST boundary; the second re-reads the offset at the
 * corrected instant and settles. On a spring-forward night the requested wall
 * time may not exist at all, and the result lands on the instant the clock
 * jumps to — which is the earliest moment of that day, and so still correct as
 * a lower bound.
 */
export function startOfDayUtc(dayKey: string, timeZone: string): Date {
  const zone = safeZone(timeZone)
  const [year, month, day] = dayKey.split('-').map(Number)
  const wallClock = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0)

  let instant = wallClock - offsetMsAt(new Date(wallClock), zone)
  instant = wallClock - offsetMsAt(new Date(instant), zone)

  // A handful of zones move their clocks at midnight itself -- Santiago and
  // Havana among them -- so on a spring-forward night the day's first wall
  // second does not exist and the arithmetic settles on the previous day.
  // Walk forward to the instant the clock actually jumps to, which is the
  // earliest moment of the requested day and so the correct lower bound.
  if (dayKeyIn(new Date(instant), zone) !== dayKey) {
    let low = instant
    let high = instant + 86_400_000
    while (high - low > 1000) {
      const mid = low + Math.floor((high - low) / 2)
      if ((dayKeyIn(new Date(mid), zone) ?? '') < dayKey) low = mid
      else high = mid
    }
    instant = high
  }

  return new Date(instant)
}

/** The UTC instant a calendar day ends — exclusive, so it is the next day's start. */
export function endOfDayUtc(dayKey: string, timeZone: string): Date {
  return startOfDayUtc(addDays(dayKey, 1), timeZone)
}

/**
 * Calendar arithmetic on the key itself, never on a Date.
 *
 * Adding 86,400,000ms to an instant is not "the next day": on the 23-hour day
 * a DST spring-forward creates, it overshoots into the day after. Working in
 * UTC on a date-only value sidesteps the whole problem, because a calendar day
 * plus one is a fact about the calendar, not about elapsed time.
 */
export function addDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

/**
 * Day of week for a day key, 0 = Sunday.
 *
 * Reads the key itself, so no zone is involved and the answer cannot drift
 * with the clock — which matters because this decides what "by Friday" means.
 */
export function weekdayOf(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay()
}

/** The last calendar day of the month a day key falls in. */
export function lastDayOfMonth(dayKey: string): string {
  const [year, month] = dayKey.split('-').map(Number)
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).toISOString().slice(0, 10)
}

/** Whole calendar days between two day keys. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/**
 * "Today" / "Tomorrow" / "Yesterday" / "In 3 days", reckoned where the user is.
 *
 * `now` is passed in rather than read, so a server render and the hydration
 * that follows it agree about which day is today even if the request straddles
 * midnight.
 */
export function relativeDayIn(
  value: string | Date | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): string {
  const target = value === null || value === undefined ? null : dayKeyIn(value, timeZone)
  if (!target) return '—'

  const days = daysBetween(todayIn(timeZone, now), target)

  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'

  // Locale pinned for the same reason the zone is: this renders on both sides.
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (Math.abs(days) < 7) return capitalise(rtf.format(days, 'day'))
  if (Math.abs(days) < 31) return capitalise(rtf.format(Math.round(days / 7), 'week'))
  if (Math.abs(days) < 365) return capitalise(rtf.format(Math.round(days / 30), 'month'))
  return capitalise(rtf.format(Math.round(days / 365), 'year'))
}

/**
 * "Thursday, August 27", in the account holder's zone.
 *
 * `en-US` deliberately: the heading previously formatted with an ambient
 * locale, which on the server is en-US, so this is the wording already on the
 * screen. Pinning it keeps the fix to the date and leaves the styling alone.
 */
export function formatDayLabelIn(value: string | Date, timeZone: string): string {
  const zone = safeZone(timeZone)
  // A date-only value has no instant to place, so it is read at noon UTC — far
  // enough from either midnight that no zone on earth shifts it to another day.
  const date = isDateOnly(value) ? new Date(`${value}T12:00:00Z`) : toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: isDateOnly(value) ? 'UTC' : zone,
  })
}

/** "9:22 PM", in the account holder's zone. */
export function formatTimeIn(value: string | Date | null | undefined, timeZone: string): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: safeZone(timeZone),
  })
}

/** "27 Aug 2026", in the account holder's zone. */
export function formatDateIn(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  const zone = safeZone(timeZone)
  const date = isDateOnly(value) ? new Date(`${value}T12:00:00Z`) : toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: isDateOnly(value) ? 'UTC' : zone,
  })
}

/** True when a due date is before today, where the account holder is. */
export function isOverdueIn(
  dueOn: string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!dueOn) return false
  const due = dayKeyIn(dueOn, timeZone)
  return due !== null && due < todayIn(timeZone, now)
}
