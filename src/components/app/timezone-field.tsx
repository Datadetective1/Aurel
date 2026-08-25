'use client'

import * as React from 'react'
import { Check, Clock } from 'lucide-react'
import { FormField, Select } from '@/components/ui/field'
import { useHasMounted } from '@/lib/use-has-mounted'
import {
  detectTimezone,
  groupedTimezones,
  isValidTimezone,
  timezoneConfirmation,
  timezoneLabel,
} from '@/lib/timezones'

/**
 * TIMEZONE PICKER
 * =============================================================================
 * Stores an IANA identifier, shows a city and an offset, and proves the choice
 * by displaying the current wall-clock time in the selected zone. A person can
 * verify "Lisbon — 4:12 PM on Monday" at a glance; nobody can verify
 * `Europe/Lisbon`.
 *
 * Detection is offered, never imposed. Silently overwriting a saved zone with
 * the device's would relocate someone every time they opened the app from an
 * airport, and this value decides when their briefings arrive.
 *
 * The device zone and the current time are only knowable after hydration, so
 * both are DERIVED from mount state rather than written back through an effect
 * — the same pattern used in onboarding, and the reason this component has no
 * state synchronisation to get wrong.
 * =============================================================================
 */
export function TimezoneField({
  name = 'timezone',
  id = 'timezone',
  defaultValue,
  label = 'Timezone',
  description,
  className,
}: {
  name?: string
  id?: string
  /** The stored IANA zone. Empty on first run. */
  defaultValue?: string
  label?: string
  description?: string
  className?: string
}) {
  const mounted = useHasMounted()
  const [override, setOverride] = React.useState<string | null>(null)

  const device = mounted ? detectTimezone() : ''
  // Stored preference wins; the device is only a starting point for a new user.
  const zone = override ?? (defaultValue || device)

  const groups = React.useMemo(() => (mounted ? groupedTimezones() : []), [mounted])

  const confirmation = mounted && zone && isValidTimezone(zone) ? timezoneConfirmation(zone) : ''
  const deviceDiffers = mounted && device !== '' && zone !== '' && device !== zone

  // A stored zone this runtime does not list (renamed, or hand-edited) still
  // needs an option of its own, or the select would silently snap to a
  // different city and save that instead.
  const listed = groups.some((group) => group.zones.includes(zone))

  return (
    <div className={className}>
      <FormField id={id} label={label} description={description}>
        {(props) => (
          <Select
            {...props}
            name={name}
            value={zone}
            onChange={(event) => setOverride(event.currentTarget.value)}
          >
            {zone && !listed ? <option value={zone}>{timezoneLabel(zone)}</option> : null}
            {groups.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.zones.map((z) => (
                  <option key={z} value={z}>
                    {timezoneLabel(z)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </FormField>

      {confirmation ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="size-3 shrink-0 text-ink-faint" aria-hidden="true" />
          {confirmation}
        </p>
      ) : null}

      {deviceDiffers ? (
        <button
          type="button"
          onClick={() => setOverride(device)}
          className="mt-1.5 flex w-fit items-center gap-1.5 rounded-[var(--radius-sm)] text-xs text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Check className="size-3 shrink-0" aria-hidden="true" />
          Use {timezoneLabel(device)}, detected from this device
        </button>
      ) : null}
    </div>
  )
}
