import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { AtlasResponse } from '@atturel/web/lib/mobile/contracts'
import type { ConnectionKind } from '@atturel/web/lib/visual/commonality'
import { useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { firstName, relativeDay } from '~/lib/format'
import { Avatar } from '~/components/avatar'
import { Empty, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { CompanyLine } from '~/components/relationship'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * ATLAS
 * =============================================================================
 * Not a social graph. People by where they work, the connections the record
 * holds at both ends -- met together, in a conversation together, the same
 * past employer or school in sourced facts -- and the important relationships
 * going quiet. Every line says what it rests on.
 * =============================================================================
 */

const CONNECTION_ICON: Record<ConnectionKind, React.ComponentProps<typeof Feather>['name']> = {
  same_organization: 'briefcase',
  former_employer: 'rotate-ccw',
  education: 'book-open',
  shared_meeting: 'calendar',
  shared_conversation: 'message-circle',
}

export default function Atlas() {
  const { c } = useTheme()
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<AtlasResponse>('/api/mobile/atlas')
  // Someone added, removed or met since the last visit shows on return.
  useFresh(reload)

  if (loading) return <Screen><Loading /></Screen>
  if (error || !data) return <Screen onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>

  const everyone = [...data.organizations.flatMap((o) => o.people), ...data.unaffiliated]
  const byId = new Map(everyone.map((p) => [p.id, p]))
  const now = new Date()

  if (everyone.length === 0) {
    return (
      <Screen onRefresh={refresh}>
        <T variant="display">Atlas</T>
        <Empty icon="compass" title="Nothing to map yet" body="Once you are tracking a few people, they are grouped here by where they work, with the connections your record actually holds." />
      </Screen>
    )
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <T variant="display" accessibilityRole="header">Atlas</T>
      <T variant="small" tone="secondary" style={{ marginTop: 6 }}>Who you know, where, and what connects them — only what your record holds.</T>

      {data.connections.length > 0 ? (
        <Section label="Connections on record" icon="link">
          <View style={{ gap: 10 }}>
            {data.connections.map((x) => {
              const a = byId.get(x.a)
              const b = byId.get(x.b)
              if (!a || !b) return null
              return (
                <View
                  key={`${x.a}-${x.b}-${x.kind}-${x.label}`}
                  accessible
                  accessibilityLabel={`${a.name} and ${b.name}: ${x.description}. ${x.evidence === 'confirmed' ? 'Confirmed' : 'Observed'}.`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}
                >
                  <Avatar name={a.fullName} src={a.src} size={34} />
                  <View style={{ width: 6, height: 1, backgroundColor: c.lineStrong }} />
                  <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={CONNECTION_ICON[x.kind]} size={13} color={c.inkSecondary} />
                  </View>
                  <View style={{ width: 6, height: 1, backgroundColor: c.lineStrong }} />
                  <Avatar name={b.fullName} src={b.src} size={34} />
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <T variant="small" numberOfLines={2}>{firstName(a.name)} & {firstName(b.name)}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name={x.evidence === 'confirmed' ? 'check-circle' : 'eye'} size={11} color={c.inkMuted} />
                      <T variant="meta" tone="muted" numberOfLines={2} style={{ flex: 1 }}>{x.description}</T>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </Section>
      ) : null}

      {data.goingQuiet.length > 0 ? (
        <Section label="Going quiet" icon="trending-down">
          <T variant="meta" tone="muted" style={{ marginBottom: 8 }}>People you marked important with no contact in a month.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {data.goingQuiet.map((p) => (
              <Node key={p.id} id={p.id} name={p.name} fullName={p.fullName} src={p.src} caption={p.lastInteractionAt ? relativeDay(p.lastInteractionAt, data.timeZone, now) : 'Never'} />
            ))}
          </View>
        </Section>
      ) : null}

      {data.organizations.map((org) => (
        <Section key={org.name} label={`${org.people.length} ${org.people.length === 1 ? 'person' : 'people'}`}>
          <View style={{ marginBottom: 10 }}>
            <CompanyLine name={org.name} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {org.people.map((p) => (
              <Node key={p.id} id={p.id} name={p.name} fullName={p.fullName} src={p.src} caption={p.owe ? `You owe ${p.owe}` : p.openLoops ? `${p.openLoops} open` : (p.title ?? '')} accent={p.owe > 0} />
            ))}
          </View>
        </Section>
      ))}

      {data.unaffiliated.length > 0 ? (
        <Section label="No organization recorded">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {data.unaffiliated.map((p) => (
              <Node key={p.id} id={p.id} name={p.name} fullName={p.fullName} src={p.src} caption={p.title ?? ''} />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  )
}

function Node({ id, name, fullName, src, caption, accent }: { id: string; name: string; fullName: string; src: string | null; caption: string; accent?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${caption ? `, ${caption}` : ''}`}
      onPress={() => router.push({ pathname: '/person/[id]', params: { id } })}
      style={{ width: 76, alignItems: 'center', gap: 6 }}
    >
      <Avatar name={fullName} src={src} size={56} />
      <T variant="meta" numberOfLines={1}>{firstName(name)}</T>
      {caption ? <T variant="meta" tone={accent ? 'accent' : 'muted'} numberOfLines={1} style={{ fontSize: 12 }}>{caption}</T> : null}
    </Pressable>
  )
}
