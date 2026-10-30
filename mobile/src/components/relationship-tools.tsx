import * as React from 'react'
import { Linking, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { GoingColdResponse, OwedLoop, OwedResponse, WarmPathResponse } from '@atturel/web/lib/mobile/contracts'
import { EVIDENCE_WORDS } from '@atturel/web/lib/evidence-words'
import { quietFor } from '@atturel/web/lib/visual/going-cold'
import { useApi } from '~/lib/api'
import { firstName } from '~/lib/format'
import { Avatar } from './avatar'
import { Section } from './screen'
import { T } from './text'
import { useTheme, fonts } from '~/theme'

/**
 * THE RELATIONSHIP TOOLS
 * =============================================================================
 * What is owed and going stale, who is going cold, and who could make an
 * introduction. Each section reads its own endpoint and keeps quiet when it
 * has nothing to say, or when the server it talks to predates it: a missing
 * section costs nothing, a broken one costs trust.
 * =============================================================================
 */

const TOUCH = 44

export function freshnessTone(loop: Pick<OwedLoop, 'freshness'>): 'critical' | 'caution' | 'muted' {
  return loop.freshness === 'overdue' ? 'critical' : loop.freshness === 'fresh' ? 'muted' : 'caution'
}

/** The way into the full owed list, with how many need a look. */
export function OwedLink() {
  const { c } = useTheme()
  const { data } = useApi<OwedResponse>('/api/mobile/owed')
  const total = data ? data.mine.length + data.theirs.length + data.shared.length : null
  const caption =
    data && data.nudges > 0
      ? `${data.nudges} ${data.nudges === 1 ? 'needs' : 'need'} a look before ${data.nudges === 1 ? 'it goes' : 'they go'} stale`
      : total !== null
        ? `${total} open, both ways`
        : 'What you promised, and what you were promised'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Everything owed. ${caption}`}
      onPress={() => router.push('/owed')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: TOUCH, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <T variant="small" style={{ fontFamily: fonts.sansMedium }}>Everything owed</T>
        <T variant="meta" tone={data && data.nudges > 0 ? 'caution' : 'muted'}>{caption}</T>
      </View>
      <Feather name="chevron-right" size={18} color={c.inkMuted} />
    </Pressable>
  )
}

/** Important people nobody has spoken to in weeks, each with a reason to write. */
export function GoingCold() {
  const { c } = useTheme()
  const { data } = useApi<GoingColdResponse>('/api/mobile/going-cold')
  if (!data || data.people.length === 0) return null
  return (
    <Section label="Going cold" icon="thermometer">
      <View style={{ gap: 4 }}>
        {data.people.map((row) => {
          const first = firstName(row.person.name)
          const quiet = row.neverSpoke ? `Added ${quietFor(row.daysQuiet)} ago, no conversation yet` : `No contact in ${quietFor(row.daysQuiet)}`
          return (
            <View key={row.personId} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.person.name}. ${quiet}.`}
                onPress={() => router.push({ pathname: '/person/[id]', params: { id: row.personId } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH, opacity: pressed ? 0.8 : 1 })}
              >
                <Avatar name={row.person.fullName} src={row.person.src} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T variant="small" style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>{row.person.name}</T>
                  <T variant="meta" tone="muted">{quiet}</T>
                </View>
                <Feather name="chevron-right" size={18} color={c.inkMuted} />
              </Pressable>
              {row.reason ? (
                <View style={{ marginTop: 8, marginLeft: 52 }}>
                  <T variant="small" tone="secondary">{row.reason.text}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <Feather name="help-circle" size={12} color={c.inkMuted} />
                    <T variant="meta" tone="muted">{EVIDENCE_WORDS.inferred.label} from public sources</T>
                    {row.reason.sourceTitle && row.reason.sourceUrl ? (
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={`Open the source: ${row.reason.sourceTitle}`}
                        hitSlop={8}
                        onPress={() => void Linking.openURL(row.reason!.sourceUrl!)}
                      >
                        <T variant="meta" tone="accent" numberOfLines={1}>{row.reason.sourceTitle}</T>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : (
                <T variant="meta" tone="muted" style={{ marginTop: 6, marginLeft: 52 }}>
                  Nothing new on record about {first}. A short check-in still counts.
                </T>
              )}
            </View>
          )
        })}
      </View>
    </Section>
  )
}

/** Who the user knows that could introduce them to this person. */
export function WarmPath({ personId, name }: { personId: string; name: string }) {
  const { c } = useTheme()
  const { data } = useApi<WarmPathResponse>(`/api/mobile/people/${personId}/warm-path`)
  if (!data || data.paths.length === 0) return null
  const first = firstName(name)
  return (
    <Section label="Warm path" icon="share-2">
      <T variant="meta" tone="muted" style={{ marginBottom: 6 }}>
        People you know who share something on record with {first}, and could introduce you.
      </T>
      {data.paths.map((path) => (
        <Pressable
          key={path.introducerId}
          accessibilityRole="button"
          accessibilityLabel={`${path.person.name} could introduce you. ${path.ties.join('. ')}. ${EVIDENCE_WORDS[path.evidence].label}.`}
          onPress={() => router.push({ pathname: '/person/[id]', params: { id: path.introducerId } })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line, minHeight: TOUCH, opacity: pressed ? 0.8 : 1 })}
        >
          <Avatar name={path.person.fullName} src={path.person.src} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="small" style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>{path.person.name}</T>
            <T variant="meta" tone="secondary">{path.ties.join(' · ')}</T>
            <T variant="meta" tone="muted">{EVIDENCE_WORDS[path.evidence].label}</T>
          </View>
          <Feather name="chevron-right" size={18} color={c.inkMuted} />
        </Pressable>
      ))}
    </Section>
  )
}
