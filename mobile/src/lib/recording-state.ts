import * as React from 'react'

/**
 * Whether a recording is open, for the parts of the app outside Capture.
 *
 * Switching tabs mid-meeting -- to glance at the brief -- does not stop a
 * recording, so the state must be unmissable everywhere: the Capture tab
 * shows it, and iOS shows its own microphone indicator besides.
 */
export type RecordingState = 'idle' | 'recording' | 'paused'

let current: RecordingState = 'idle'
const listeners = new Set<() => void>()

export function setRecordingState(next: RecordingState) {
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

export function useRecordingState(): RecordingState {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => current,
  )
}
