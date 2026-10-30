import * as React from 'react'
import { View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { DIRECTION_META, type ActionDirection } from '@atturel/web/lib/visual/relationship-actions'
import type { PrepState } from '@atturel/web/lib/visual/glance'
import { PREP_META } from '@atturel/web/lib/visual/glance'
import { useTheme, fonts } from '~/theme'
import { T } from './text'

/**
 * An icon and two or three words in place of a sentence. Status is carried by
 * the icon and the words as well as the tint, never colour alone.
 */

type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'quiet'

export function Chip({
  icon,
  children,
  tone = 'neutral',
}: {
  icon?: React.ComponentProps<typeof Feather>['name']
  children: React.ReactNode
  tone?: Tone
}) {
  const { c } = useTheme()
  const palette: Record<Tone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: c.bgSunken, fg: c.inkSecondary, border: c.line },
    accent: { bg: c.accentWash, fg: c.accentStrong, border: c.accentWash },
    positive: { bg: c.positiveWash, fg: c.positiveStrong, border: c.positiveWash },
    caution: { bg: c.cautionWash, fg: c.cautionStrong, border: c.cautionWash },
    critical: { bg: c.criticalWash, fg: c.criticalStrong, border: c.criticalWash },
    quiet: { bg: 'transparent', fg: c.inkMuted, border: 'transparent' },
  }
  const p = palette[tone]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: tone === 'quiet' ? 0 : 10,
        paddingVertical: 4,
        minHeight: 26,
        borderRadius: 999,
        backgroundColor: p.bg,
        borderWidth: 1,
        borderColor: p.border,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Feather name={icon} size={13} color={p.fg} accessibilityElementsHidden /> : null}
      <T variant="meta" style={{ color: p.fg, fontFamily: fonts.sansMedium }} maxFontSizeMultiplier={1.5}>
        {children}
      </T>
    </View>
  )
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
}

export const DIRECTION_ICON: Record<ActionDirection, React.ComponentProps<typeof Feather>['name']> = {
  owe: 'arrow-up-right',
  waiting: 'arrow-down-left',
  revisit: 'repeat',
  personal: 'bookmark',
  completed: 'check',
}

export function DirectionChip({ direction, count, short }: { direction: ActionDirection; count?: number; short?: boolean }) {
  const meta = DIRECTION_META[direction]
  return (
    <Chip icon={DIRECTION_ICON[direction]} tone={direction === 'owe' ? 'accent' : direction === 'completed' ? 'positive' : 'neutral'}>
      {typeof count === 'number' ? `${count} ` : ''}
      {short ? meta.short : meta.label}
    </Chip>
  )
}

const PREP_ICON: Record<PrepState, React.ComponentProps<typeof Feather>['name']> = {
  ready: 'check-circle',
  needs_people: 'user-plus',
  not_prepared: 'circle',
}

export function PrepChip({ prep }: { prep: PrepState }) {
  const meta = PREP_META[prep]
  return (
    <Chip icon={PREP_ICON[prep]} tone={meta.tone === 'positive' ? 'positive' : meta.tone === 'caution' ? 'caution' : 'neutral'}>
      {meta.label}
    </Chip>
  )
}
