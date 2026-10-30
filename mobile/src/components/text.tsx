import * as React from 'react'
import { Text, type TextProps } from 'react-native'
import { fonts, useTheme } from '~/theme'

/**
 * Type, in four voices. Display serif for what you act on and for names;
 * sans for everything else; a small-caps label for section eyebrows. Sizes
 * follow Dynamic Type (font scaling stays on), capped where a label would
 * otherwise break the layout it labels.
 */

type Variant = 'display' | 'title' | 'body' | 'small' | 'label' | 'meta'

const STYLE: Record<Variant, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: 'uppercase' }> = {
  display: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33 },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' },
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 17 },
}

export function T({
  variant = 'body',
  tone = 'ink',
  style,
  ...props
}: TextProps & {
  variant?: Variant
  tone?: 'ink' | 'secondary' | 'muted' | 'accent' | 'positive' | 'caution' | 'critical' | 'inverse'
}) {
  const { c } = useTheme()
  const color =
    tone === 'ink'
      ? c.ink
      : tone === 'secondary'
        ? c.inkSecondary
        : tone === 'muted'
          ? c.inkMuted
          : tone === 'accent'
            ? c.accent
            : tone === 'positive'
              ? c.positiveStrong
              : tone === 'caution'
                ? c.cautionStrong
                : tone === 'critical'
                  ? c.criticalStrong
                  : c.inkInverse
  return (
    <Text
      maxFontSizeMultiplier={variant === 'label' ? 1.4 : variant === 'display' ? 1.6 : 2}
      {...props}
      style={[STYLE[variant], { color }, style]}
    />
  )
}
