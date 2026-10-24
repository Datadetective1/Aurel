import * as React from 'react'
import type { ErrorBoundaryProps } from 'expo-router'
import { brand } from '@atturel/web/lib/brand'
import { Empty, Screen } from './screen'
import { T } from './text'

/**
 * What a screen shows when it throws while rendering, instead of the app
 * closing. With no boundary, a render error is fatal on iOS: React Native
 * reports it and the process ends, which is how TestFlight 0.1.0 (1) crashed
 * on People. Each route exports this as its ErrorBoundary, so the tab bar and
 * the rest of the app stay usable and "Try again" renders the screen afresh.
 * The error's message is shown small, for a tester to pass on.
 */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <Empty
        icon="alert-circle"
        title="This screen could not be shown"
        body={`Nothing you saved is affected. Try again, and if it keeps happening, write to ${brand.email.support}.`}
        action={{ label: 'Try again', onPress: () => void retry() }}
      />
      <T variant="meta" tone="muted" style={{ textAlign: 'center' }} selectable>
        {error.message}
      </T>
    </Screen>
  )
}
