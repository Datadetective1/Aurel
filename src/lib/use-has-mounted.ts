'use client'

import { useSyncExternalStore } from 'react'

/**
 * True only after hydration.
 *
 * Theme controls cannot know the resolved theme during server render, so they
 * must render a neutral state first and the real one after mount. The obvious
 * implementation — `useState(false)` plus `useEffect(() => setMounted(true))` —
 * schedules a second render pass on every mount and is flagged by the React
 * Compiler for exactly that reason.
 *
 * `useSyncExternalStore` expresses the same idea as what it actually is: a value
 * that differs between the server snapshot and the client snapshot. No effect,
 * no cascading render.
 */

/** Never emits; "has mounted" transitions once and only via the snapshot pair. */
const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
