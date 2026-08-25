/**
 * TIMEZONES
 * =============================================================================
 * The stored value is always an IANA identifier — `Europe/Lisbon`, never
 * "WEST" or "+01:00". Abbreviations are ambiguous (CST is three different
 * things) and fixed offsets are wrong twice a year. IANA is the only
 * representation that survives daylight saving and political boundary changes.
 *
 * What a person reads, though, should never be `Europe/Lisbon`. These helpers
 * exist to keep those two facts apart: machine value in the database, human
 * sentence on the screen.
 * =============================================================================
 */

/**
 * Fallback list for runtimes without `Intl.supportedValuesOf`. Deliberately
 * broad rather than complete — every inhabited UTC offset is represented, so a
 * user can always find a zone that keeps the right time even on an old browser.
 */
const FALLBACK_ZONES = [
  'Africa/Abidjan', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Sao_Paulo', 'America/Toronto',
  'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
  'Asia/Kolkata', 'Asia/Karachi', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Adelaide', 'Australia/Brisbane',
  'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens',
  'Europe/Berlin', 'Europe/Brussels', 'Europe/Dublin', 'Europe/Istanbul', 'Europe/Lisbon',
  'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Stockholm',
  'Europe/Warsaw', 'Europe/Zurich', 'Pacific/Auckland', 'Pacific/Honolulu', 'UTC',
]

/** Every zone this runtime knows about, or the fallback list. */
export function allTimezones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf

  if (typeof supported === 'function') {
    try {
      const zones = supported('timeZone')
      if (Array.isArray(zones) && zones.length > 0) return zones
    } catch {
      // Fall through to the static list.
    }
  }
  return FALLBACK_ZONES
}

/** True when the string names a zone this runtime can actually resolve. */
export function isValidTimezone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The city, as a person would write it: `Europe/Lisbon` becomes "Lisbon", and
 * `America/Argentina/Buenos_Aires` becomes "Buenos Aires" rather than the
 * region-qualified identifier.
 */
export function cityOf(zone: string): string {
  const segments = zone.split('/')
  const last = segments[segments.length - 1] ?? zone
  return last.replace(/_/g, ' ')
}

/** The continent-level grouping, used only to organise a long list. */
export function regionOf(zone: string): string {
  const [region] = zone.split('/')
  if (!region || zone === 'UTC') return 'Universal'
  return region.replace(/_/g, ' ')
}

/**
 * Current offset from UTC, in minutes, for a zone at a given instant.
 *
 * Computed by formatting the same instant in both zones and differencing,
 * because there is no direct API for "what is this zone's offset right now"
 * and hard-coded tables go stale whenever a government changes its mind.
 */
export function offsetMinutes(zone: string, at: Date = new Date()): number {
  try {
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const parts: Record<string, string> = {}
    for (const part of format.formatToParts(at)) {
      if (part.type !== 'literal') parts[part.type] = part.value
    }

    // `hour` can format midnight as "24" under hour12:false in some runtimes.
    const hour = Number(parts.hour) % 24

    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      hour,
      Number(parts.minute),
      Number(parts.second),
    )

    // Seconds are dropped so a whole-minute offset does not pick up rounding.
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch {
    return 0
  }
}

/** "GMT+05:30", "GMT−04:00", "GMT" — a true minus sign, not a hyphen. */
export function formatOffset(zone: string, at: Date = new Date()): string {
  const minutes = offsetMinutes(zone, at)
  if (minutes === 0) return 'GMT'
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const mins = String(abs % 60).padStart(2, '0')
  return `GMT${sign}${hours}:${mins}`
}

/** What goes in a dropdown option: "Lisbon — GMT+01:00". */
export function timezoneLabel(zone: string, at: Date = new Date()): string {
  if (zone === 'UTC') return 'UTC — Coordinated Universal Time'
  return `${cityOf(zone)} — ${formatOffset(zone, at)}`
}

/** The wall-clock time in that zone right now: "4:12 PM". */
export function localTimeIn(zone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(at)
  } catch {
    return ''
  }
}

/**
 * The confirmation sentence shown under the picker.
 *
 * Showing the actual current time is the only way a person can tell whether
 * they picked the right zone — an identifier alone is unverifiable.
 */
export function timezoneConfirmation(zone: string, at: Date = new Date()): string {
  const time = localTimeIn(zone, at)
  if (!time) return ''
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long' }).format(at)
  return `It is ${time} on ${weekday} there.`
}

/** Zones grouped by continent, each group sorted west to east then by name. */
export function groupedTimezones(at: Date = new Date()): Array<{ region: string; zones: string[] }> {
  const groups = new Map<string, string[]>()

  for (const zone of allTimezones()) {
    const region = regionOf(zone)
    const list = groups.get(region)
    if (list) list.push(zone)
    else groups.set(region, [zone])
  }

  return [...groups.entries()]
    .map(([region, zones]) => ({
      region,
      zones: zones.sort(
        (a, b) => offsetMinutes(a, at) - offsetMinutes(b, at) || cityOf(a).localeCompare(cityOf(b)),
      ),
    }))
    .sort((a, b) => {
      // "Universal" last: it is a technical choice, not a place someone lives.
      if (a.region === 'Universal') return 1
      if (b.region === 'Universal') return -1
      return a.region.localeCompare(b.region)
    })
}

/**
 * The device's own zone, or UTC when the runtime will not say.
 * Safe on the server, where it resolves to the deployment region rather than
 * the user — which is why callers should only trust it on the client.
 */
export function detectTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isValidTimezone(zone) ? zone : 'UTC'
  } catch {
    return 'UTC'
  }
}
