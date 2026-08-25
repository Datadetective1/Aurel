'use client'

import { useSyncExternalStore } from 'react'

/**
 * The OS "reduce motion" setting, as a reactive value.
 *
 * Read through useSyncExternalStore rather than an effect, so it participates
 * in the render pass instead of triggering a second one — and so it stays
 * correct if the user changes the setting while the page is open.
 */
const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void) {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', callback)
  return () => list.removeEventListener('change', callback)
}

const getClientSnapshot = () => window.matchMedia(QUERY).matches
// The server cannot know the preference; assume motion is fine and let the
// client correct it. The animation is a single forward pass either way.
const getServerSnapshot = () => false

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
