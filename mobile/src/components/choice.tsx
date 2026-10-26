import * as React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import {
  allTimezones,
  cityOf,
  detectTimezone,
  isValidTimezone,
  timezoneConfirmation,
  timezoneLabel,
} from '@atturel/web/lib/timezones'
import { deviceName } from '~/lib/device'
import { fonts, TOUCH, useTheme } from '~/theme'
import { T } from './text'

/**
 * A field whose answer is one of a list: the current answer on a row, and the
 * list opening under it when tapped. Visible label, real radio semantics for
 * VoiceOver, every row 44 points tall.
 */
export function ChoiceField<V extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string }[]
  onChange: (value: V) => void
  hint?: string
}) {
  const { c } = useTheme()
  const [open, setOpen] = React.useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <View>
      <T variant="meta" tone="secondary" style={{ marginBottom: 6 }}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'not set'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{
          minHeight: TOUCH + 6,
          borderWidth: 1,
          borderColor: c.lineStrong,
          borderRadius: 10,
          paddingHorizontal: 14,
          backgroundColor: c.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <T variant="body" style={{ flex: 1 }}>
          {current?.label ?? 'Not set'}
        </T>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.inkMuted} />
      </Pressable>
      {hint ? (
        <T variant="meta" tone="muted" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
      {open ? (
        <View
          accessibilityRole="radiogroup"
          style={{
            marginTop: 4,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 10,
            backgroundColor: c.surface,
          }}
        >
          {options.map((o) => (
            <Option
              key={String(o.value)}
              label={o.label}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value)
                setOpen(false)
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function Option({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string
  detail?: string
  selected: boolean
  onPress: () => void
}) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TOUCH,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        opacity: pressed ? 0.7 : 1,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      })}
    >
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <T variant="small">{label}</T>
        {detail ? (
          <T variant="meta" tone="muted">
            {detail}
          </T>
        ) : null}
      </View>
      {selected ? <Feather name="check" size={16} color={c.ink} /> : null}
    </Pressable>
  )
}

/**
 * A time zone, chosen by city, proved by the time it is there now. The
 * phone's own zone is offered, never imposed. For someone else's zone,
 * `optional` allows "Not set": a person never silently inherits yours.
 */
export function TimeZoneField({
  label,
  value,
  onChange,
  optional = false,
  hint,
}: {
  label: string
  value: string
  onChange: (zone: string) => void
  optional?: boolean
  hint?: string
}) {
  const { c } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const device = detectTimezone()
  const zones = React.useMemo(() => allTimezones(), [])
  const q = query.trim().toLowerCase()
  const matches = q
    ? zones
        .filter((z) => z.toLowerCase().includes(q) || cityOf(z).toLowerCase().includes(q))
        .slice(0, 40)
    : []
  const shown = value && isValidTimezone(value) ? timezoneLabel(value) : value || 'Not set'
  const choose = (zone: string) => {
    onChange(zone)
    setOpen(false)
    setQuery('')
  }

  return (
    <View>
      <T variant="meta" tone="secondary" style={{ marginBottom: 6 }}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{
          minHeight: TOUCH + 6,
          borderWidth: 1,
          borderColor: c.lineStrong,
          borderRadius: 10,
          paddingHorizontal: 14,
          backgroundColor: c.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <T variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {shown}
        </T>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.inkMuted} />
      </Pressable>
      {value && isValidTimezone(value) ? (
        <T variant="meta" tone="muted" style={{ marginTop: 4 }}>
          {timezoneConfirmation(value)}
        </T>
      ) : hint ? (
        <T variant="meta" tone="muted" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
      {open ? (
        <View
          style={{
            marginTop: 4,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 10,
            backgroundColor: c.surface,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <Feather name="search" size={15} color={c.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by city"
              placeholderTextColor={c.inkMuted}
              accessibilityLabel="Search time zones by city"
              autoCorrect={false}
              style={{
                flex: 1,
                minHeight: TOUCH,
                color: c.ink,
                fontFamily: fonts.sans,
                fontSize: 16,
              }}
            />
          </View>
          {!q && device && device !== value ? (
            <Option
              label={`Use this ${deviceName}’s: ${timezoneLabel(device)}`}
              selected={false}
              onPress={() => choose(device)}
            />
          ) : null}
          {!q && optional ? (
            <Option label="Not set" selected={!value} onPress={() => choose('')} />
          ) : null}
          {matches.map((z) => (
            <Option
              key={z}
              label={timezoneLabel(z)}
              detail={z}
              selected={z === value}
              onPress={() => choose(z)}
            />
          ))}
          {q && matches.length === 0 ? (
            <T variant="small" tone="muted" style={{ padding: 14 }}>
              No city by that name. Try a nearby larger city.
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
