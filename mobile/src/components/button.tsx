import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import * as Haptics from 'expo-haptics'
import { TOUCH, useTheme, fonts } from '~/theme'
import { T } from './text'

/**
 * Primary actions are high-contrast ink, not brass: brass is a marker, and
 * spending it on a rectangle would stop it reading as precious. Every button
 * is at least 44pt tall.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  accessibilityHint,
  size = 'md',
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: React.ComponentProps<typeof Feather>['name']
  disabled?: boolean
  busy?: boolean
  accessibilityHint?: string
  size?: 'md' | 'lg'
}) {
  const { c } = useTheme()
  const bg = variant === 'primary' ? c.surfaceInverse : variant === 'danger' ? c.criticalWash : variant === 'secondary' ? c.surface : 'transparent'
  const fg = variant === 'primary' ? c.inkInverse : variant === 'danger' ? c.criticalStrong : c.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      style={({ pressed }) => ({
        minHeight: size === 'lg' ? 54 : TOUCH,
        paddingHorizontal: 18,
        borderRadius: 10,
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: c.lineStrong,
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {busy ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={17} color={fg} /> : null}
        <T variant="body" style={{ color: fg, fontFamily: fonts.sansMedium }}>
          {label}
        </T>
      </View>
    </Pressable>
  )
}
