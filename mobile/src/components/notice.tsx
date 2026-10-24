import * as React from 'react'
import { View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useTheme } from '~/theme'
import { T } from './text'

/**
 * A quiet confirmation -- "Marked done." -- that says what happened and goes
 * away on its own. Announced to VoiceOver as it appears.
 */
export function Notice({ text, onDone, ms = 3500 }: { text: string; onDone: () => void; ms?: number }) {
  const { c } = useTheme()
  React.useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [text, onDone, ms])
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.positiveWash }}
    >
      <Feather name="check" size={15} color={c.positiveStrong} />
      <T variant="small" style={{ color: c.positiveStrong, flex: 1 }}>{text}</T>
    </View>
  )
}
