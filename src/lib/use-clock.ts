'use client'

import { useSyncExternalStore } from 'react'

/**
 * A clock that re-renders its subscribers, at a coarse tick.
 *
 * WHY NOT useState + useEffect
 *
 * The obvious implementation — `useState(serverNow)` plus an effect that calls
 * `setNow(new Date())` and starts an interval — is what this replaced. It is
 * flagged by `react-hooks/set-state-in-effect` for the same reason
 * `useHasMounted` does not use it: a value that legitimately differs between
 * the server snapshot and the client snapshot is not state to be written back
 * after render, it is an external store to be read.
 *
 * HYDRATION
 *
 * `getServerSnapshot` returns 0, and React uses it for the server render AND
 * for the hydration pass. Callers treat 0 as "no client clock yet" and fall
 * back to the `now` the server rendered against, so the first client render is
 * byte-identical to the server's. React then reads the real snapshot and
 * re-renders, which is where the label corrects itself to the reader's own
 * clock.
 *
 * THE TICK
 *
 * Snapshots are floored to `TICK_MS`, which is what makes `getSnapshot` stable
 * across the several calls React makes within one render pass — returning
 * `Date.now()` there is an infinite render loop.
 *
 * Thirty seconds, not one. A per-second countdown to a meeting is a stress
 * object, and one timer for the whole page is enough: the interval is shared by
 * every subscriber and is cleared when the last one unmounts, so a page with
 * three countdowns on it still has one timer.
 */

const TICK_MS = 30_000

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    timer = setInterval(() => {
      for (const notify of listeners) notify()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS
const getServerSnapshot = () => 0

/**
 * The current time, or `null` before hydration.
 *
 * A caller that needs to render something on the server passes its own `now`
 * through and uses this only once it is non-null.
 */
export function useClock(): Date | null {
  const millis = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return millis === 0 ? null : new Date(millis)
}
