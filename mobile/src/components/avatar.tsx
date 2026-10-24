import * as React from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { config } from '~/lib/config'
import { useTheme } from '~/theme'
import { T } from './text'

/**
 * A face. Initials on a tint derived from the name always render, so the same
 * person always looks the same and a list stays scannable; a photo, when
 * there is one, is layered over them and removed if it fails, so a slow,
 * broken or expired link shows initials rather than an empty circle -- the
 * web's fallback, on the phone. The image is decorative beside a visible
 * name, so it is hidden from VoiceOver; where no name is visible the caller
 * passes `label`.
 */

/** Photos are signed URLs; the sample people's illustrations are paths on the website. */
function resolve(src: string | null | undefined): string | null {
  if (!src) return null
  if (/^https?:\/\//i.test(src)) return src
  return src.startsWith('/') ? `${config.apiUrl}${src}` : null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase()
}

function bucket(input: string, n: number) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % n
}

export function Avatar({
  name,
  src,
  size = 44,
  label,
  ring,
}: {
  name: string
  src?: string | null
  size?: number
  label?: string
  ring?: string
}) {
  const { c } = useTheme()
  const tints = [
    { bg: c.accentWash, fg: c.accentStrong },
    { bg: c.infoWash, fg: c.info },
    { bg: c.positiveWash, fg: c.positiveStrong },
    { bg: c.cautionWash, fg: c.cautionStrong },
    { bg: c.bgSunken, fg: c.inkSecondary },
  ]
  const tint = tints[bucket(name, tints.length)]!
  const uri = resolve(src)
  const [failed, setFailed] = React.useState<string | null>(null)
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

  return (
    <View
      {...a11y}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.bg,
        borderWidth: ring ? 2 : 1,
        borderColor: ring ?? c.line,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <T style={{ color: tint.fg, fontSize: size * 0.34, lineHeight: size * 0.4, fontFamily: 'InstrumentSans_500Medium' }} maxFontSizeMultiplier={1}>
        {initials(name)}
      </T>
      {uri && failed !== uri ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }}
          contentFit="cover"
          contentPosition={{ top: '35%' }}
          transition={120}
          onError={() => setFailed(uri)}
        />
      ) : null}
    </View>
  )
}

export function FaceStack({
  people,
  size = 40,
  max = 3,
}: {
  people: { id: string; name: string; src?: string | null }[]
  size?: number
  max?: number
}) {
  const { c } = useTheme()
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={people.map((p) => p.name).join(', ')}
      style={{ flexDirection: 'row' }}
    >
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.28 }}>
          <Avatar name={p.name} src={p.src} size={size} ring={c.bg} />
        </View>
      ))}
      {rest > 0 ? (
        <View
          style={{
            marginLeft: -size * 0.28,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.bgSunken,
            borderWidth: 2,
            borderColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T variant="meta" tone="muted" maxFontSizeMultiplier={1}>+{rest}</T>
        </View>
      ) : null}
    </View>
  )
}
