import 'server-only'
import { googleProvider } from './google'
import { microsoftProvider } from './microsoft'
import { providerConfigured, type CalendarProvider, type CalendarProviderId } from './provider'

/**
 * Provider registry.
 *
 * The only place that knows both providers exist. Everything downstream takes a
 * `CalendarProvider`, so adding a third is a new file plus one line here.
 */
export function calendarProvider(id: CalendarProviderId): CalendarProvider {
  return id === 'microsoft' ? microsoftProvider() : googleProvider()
}

export const CALENDAR_PROVIDERS: CalendarProviderId[] = ['microsoft', 'google']

/** What the UI needs to describe calendar support honestly. */
export function calendarCapability() {
  return CALENDAR_PROVIDERS.map((id) => {
    const provider = calendarProvider(id)
    return {
      id,
      label: provider.label,
      /**
       * Configured means this deployment *could* offer it. It is not the same
       * as connected, and the Capabilities screen must not conflate them: a
       * client secret in the environment says nothing about whether any user
       * has granted access.
       */
      configured: providerConfigured(id),
      scopes: provider.scopes,
    }
  })
}

export * from './provider'
