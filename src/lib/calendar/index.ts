import 'server-only'
import { googleProvider } from './google'
import { microsoftProvider } from './microsoft'
import {
  missingProviderEnv,
  nearMatchFor,
  providerConfigured,
  tokenKeyState,
  type CalendarProvider,
  type CalendarProviderId,
} from './provider'

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
      /** Named so an operator knows which setting is the one still missing. */
      missingEnv: missingProviderEnv(id),
      /** Distinguishes an absent encryption key from one too short to use. */
      tokenKey: tokenKeyState(),
      /**
       * For each missing variable, a name already in the environment that is
       * one slip away from it. Turns "missing" into "you spelled it wrong".
       */
      nearMatches: missingProviderEnv(id)
        .map((name) => ({ expected: name, found: nearMatchFor(name) }))
        .filter((pair): pair is { expected: string; found: string } => pair.found !== null),
      scopes: provider.scopes,
    }
  })
}

export * from './provider'
