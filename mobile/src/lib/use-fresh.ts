import * as React from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'

/**
 * Keep a screen current without a spinner: fetch again when the person comes
 * back to it (after preparing a meeting, keeping a conversation, closing a
 * loop) and when the app returns to the foreground -- the reconnect moment,
 * too, since a phone that was offline usually comes back by being reopened.
 * The first focus is skipped: the screen has just loaded.
 */
export function useFresh(reload: () => void) {
  const latest = React.useRef(reload)
  latest.current = reload
  const first = React.useRef(true)

  useFocusEffect(
    React.useCallback(() => {
      if (first.current) {
        first.current = false
        return
      }
      latest.current()
    }, []),
  )

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') latest.current()
    })
    return () => sub.remove()
  }, [])
}
