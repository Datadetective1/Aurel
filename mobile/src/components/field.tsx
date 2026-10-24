import * as React from 'react'
import { TextInput, View, type TextInputProps } from 'react-native'
import { fonts, TOUCH, useTheme } from '~/theme'
import { T } from './text'

/**
 * A labelled text field: the label is visible (not a placeholder that
 * disappears once typing starts), the error sits under the field it is
 * about, and VoiceOver reads both.
 */
export const Field = React.forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null; hint?: string }
>(function Field({ label, error, hint, style, multiline, ...props }, ref) {
  const { c } = useTheme()
  const id = React.useId().replace(/:/g, '')
  return (
    <View>
      <T variant="meta" tone="secondary" nativeID={`${id}-label`} style={{ marginBottom: 6 }}>
        {label}
      </T>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.inkMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          {
            minHeight: multiline ? 96 : TOUCH + 6,
            borderWidth: 1,
            borderColor: error ? c.critical : c.lineStrong,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 12 : 0,
            color: c.ink,
            backgroundColor: c.surface,
            fontFamily: fonts.sans,
            fontSize: 16,
            lineHeight: multiline ? 22 : undefined,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <T variant="meta" tone="critical" style={{ marginTop: 4 }} accessibilityRole="alert">
          {error}
        </T>
      ) : hint ? (
        <T variant="meta" tone="muted" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
    </View>
  )
})
