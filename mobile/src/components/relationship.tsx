import * as React from 'react'
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { LoopActionResponse, TimelineEntry, VisualLoop, VisualMeetingSummary, VisualPerson } from '@atturel/web/lib/mobile/contracts'
import { DIRECTION_META } from '@atturel/web/lib/visual/relationship-actions'
import { TIMELINE_KIND_LABEL } from '@atturel/web/lib/visual/timeline'
import { monogram } from '@atturel/web/lib/visual/logo'
import { api, ApiError } from '~/lib/api'
import { formatDate, formatTime, relativeDay, firstName } from '~/lib/format'
import { TOUCH, useTheme, fonts } from '~/theme'
import { Avatar, FaceStack } from './avatar'
import { Chip, ChipRow, DIRECTION_ICON, PrepChip } from './chip'
import { T } from './text'

/** A company as a monogram and its name. Logos are a web-only refinement for now. */
export function CompanyLine({ name }: { name: string }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: c.line, backgroundColor: c.bgSunken, alignItems: 'center', justifyContent: 'center' }}
      >
        <T style={{ fontSize: 9, lineHeight: 11, color: c.inkSecondary, fontFamily: fonts.sansMedium }} maxFontSizeMultiplier={1}>
          {monogram(name)}
        </T>
      </View>
      <T variant="meta" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </T>
    </View>
  )
}

/** Marks the invented sample record wherever it appears, so it is never mistaken for a real one. */
export function SampleChip() {
  return <Chip icon="eye">Sample · invented</Chip>
}

/**
 * An upcoming meeting: faces, when, who, whether it is prepared, what is open.
 * The whole card is one large tap target into Prepare.
 */
export function MeetingCard({ meeting, timeZone, now }: { meeting: VisualMeetingSummary; timeZone: string; now: Date }) {
  const { c } = useTheme()
  const owe = meeting.people.reduce((n, p) => n + p.owe, 0)
  const company = meeting.people.find((p) => p.company)?.company
  const when = meeting.scheduledAt
    ? `${relativeDay(meeting.scheduledAt, timeZone, now)} · ${formatTime(meeting.scheduledAt, timeZone)}`
    : 'Unscheduled'
  const names = meeting.people.map((p) => firstName(p.name))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meeting.title}, ${when}${names.length ? `, with ${names.join(', ')}` : ''}`}
      accessibilityHint="Opens the brief"
      onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: meeting.id } })}
      style={({ pressed }) => ({
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        opacity: pressed ? 0.86 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
        {meeting.people.length > 0 ? (
          <FaceStack people={meeting.people.map((p) => ({ id: p.id, name: p.fullName, src: p.src }))} size={46} max={3} />
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderStyle: 'dashed', borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="user-plus" size={18} color={c.inkMuted} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="meta" tone="secondary" style={{ fontFamily: fonts.sansMedium }}>{when}</T>
          <T variant="title" style={{ marginTop: 2, fontSize: 20, lineHeight: 25 }} numberOfLines={2}>
            {meeting.title}
          </T>
          {names.length > 0 ? (
            <T variant="small" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
              {names.join(', ')}
            </T>
          ) : null}
          {company ? <View style={{ marginTop: 6 }}><CompanyLine name={company} /></View> : null}
          <View style={{ marginTop: 10 }}>
            <ChipRow>
              <PrepChip prep={meeting.prep} />
              {owe > 0 ? <Chip icon={DIRECTION_ICON.owe} tone="accent">{`You owe ${owe}`}</Chip> : null}
              {meeting.openLoops > owe ? <Chip>{`${meeting.openLoops - owe} open`}</Chip> : null}
              {meeting.isDemo ? <SampleChip /> : null}
            </ChipRow>
          </View>
        </View>
        <Feather name="chevron-right" size={20} color={c.inkMuted} style={{ alignSelf: 'center' }} />
      </View>
    </Pressable>
  )
}

const LOOP_ACTIONS = [
  { action: 'done', label: 'Done', done: 'Marked done.' },
  { action: 'later', label: 'Later', done: 'Moved to later.' },
  { action: 'cancel', label: 'No longer needed', done: 'Cancelled.' },
] as const

/**
 * The web's one-tap loop actions, as the system's own action sheet. Nothing
 * is asked back: the moment somebody closes a loop between meetings is not
 * the moment for a form.
 */
export function chooseLoopAction(loop: VisualLoop, onChanged: (message: string) => void) {
  const run = async (index: number) => {
    const choice = LOOP_ACTIONS[index]
    if (!choice) return
    try {
      const result = await api.post<LoopActionResponse>(`/api/mobile/loops/${loop.id}`, { action: choice.action })
      if (result.ok) onChanged(choice.done)
      else Alert.alert('Not saved', result.error)
    } catch (e) {
      Alert.alert(
        'Not saved',
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline. Nothing changed.'
          : e instanceof ApiError && e.failure.kind === 'not_found'
            ? 'Closing loops from the app is not available yet. Use atturel.com.'
            : 'That could not be saved. Try again.',
      )
    }
  }
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: loop.description,
        options: [...LOOP_ACTIONS.map((a) => a.label), 'Keep open'],
        cancelButtonIndex: LOOP_ACTIONS.length,
        destructiveButtonIndex: 2,
      },
      (index) => void run(index),
    )
    return
  }
  Alert.alert(loop.description, undefined, [
    ...LOOP_ACTIONS.map((a, i) => ({ text: a.label, onPress: () => void run(i) })),
    { text: 'Keep open', style: 'cancel' as const },
  ])
}

/** One open loop: which way it runs, what it is, whose, when. Tap to close it. */
export function LoopRow({
  loop,
  timeZone,
  now,
  showPerson = true,
  onChanged,
  freshness,
}: {
  loop: VisualLoop
  timeZone: string
  now: Date
  showPerson?: boolean
  /** How close it is to going stale, said in place of the due date. */
  freshness?: { note: string; tone: 'critical' | 'caution' | 'muted' }
  /** When given, the row opens Done / Later / Cancel and calls this after a change. */
  onChanged?: (message: string) => void
}) {
  const { c } = useTheme()
  const meta = DIRECTION_META[loop.direction]
  return (
    <Pressable
      disabled={!onChanged}
      onPress={() => onChanged && chooseLoopAction(loop, onChanged)}
      accessibilityRole={onChanged ? 'button' : 'text'}
      accessibilityHint={onChanged ? 'Mark done, later, or no longer needed' : undefined}
      accessibilityLabel={`${meta.label}${loop.personName && showPerson ? `, ${loop.personName}` : ''}: ${loop.description}${freshness ? `, ${freshness.note}` : loop.overdue ? ', overdue' : ''}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, minHeight: TOUCH, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: loop.overdue ? c.criticalWash : loop.direction === 'owe' ? c.accentWash : c.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={loop.overdue ? 'alert-circle' : DIRECTION_ICON[loop.direction]} size={15} color={loop.overdue ? c.critical : loop.direction === 'owe' ? c.accent : c.inkSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="small">{loop.description}</T>
        <T variant="meta" tone={freshness ? freshness.tone : loop.overdue ? 'critical' : 'muted'} style={{ marginTop: 2 }}>
          {[
            meta.label,
            showPerson ? loop.personName : null,
            freshness ? freshness.note : loop.dueOn ? `${loop.overdue ? 'was due' : 'due'} ${relativeDay(loop.dueOn, timeZone, now).toLowerCase()}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>
      {onChanged ? <Feather name="more-horizontal" size={18} color={c.inkMuted} style={{ alignSelf: 'center' }} /> : null}
    </Pressable>
  )
}

const KIND_ICON: Record<TimelineEntry['kind'], React.ComponentProps<typeof Feather>['name']> = {
  upcoming: 'calendar',
  meeting: 'calendar',
  conversation: 'message-circle',
  commitment: 'corner-up-right',
  commitment_completed: 'check-circle',
  decision: 'git-commit',
  note: 'file-text',
  memory: 'zap',
}

const EVIDENCE_ICON: Record<TimelineEntry['evidence'], React.ComponentProps<typeof Feather>['name']> = {
  confirmed: 'check-circle',
  observed: 'eye',
  inferred: 'help-circle',
  unknown: 'help-circle',
}

/** The dated record between you, one line per event; detail opens on tap. */
export function Timeline({ entries, timeZone, limit = 8 }: { entries: TimelineEntry[]; timeZone: string; limit?: number }) {
  const { c } = useTheme()
  const [open, setOpen] = React.useState<string | null>(null)
  const [all, setAll] = React.useState(false)
  const shown = all ? entries : entries.slice(0, limit)
  return (
    <View>
      {shown.map((e, i) => {
        const expanded = open === e.id
        const evidence = `${e.evidence[0]!.toUpperCase()}${e.evidence.slice(1)}`
        return (
          <Pressable
            key={e.id}
            disabled={!e.detail}
            onPress={() => setOpen(expanded ? null : e.id)}
            accessibilityRole={e.detail ? 'button' : 'text'}
            accessibilityState={e.detail ? { expanded } : undefined}
            accessibilityLabel={`${TIMELINE_KIND_LABEL[e.kind]}: ${e.title}. ${formatDate(e.at, timeZone)}. ${e.context ?? ''}. ${evidence}.`}
            style={{ flexDirection: 'row', gap: 12 }}
          >
            <View style={{ alignItems: 'center', width: 32 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: e.kind === 'upcoming' ? c.accentGraphic : c.line, backgroundColor: e.kind === 'upcoming' ? c.accentWash : e.kind === 'commitment_completed' ? c.positiveWash : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={KIND_ICON[e.kind]} size={14} color={e.kind === 'upcoming' ? c.accent : e.kind === 'commitment_completed' ? c.positive : c.inkSecondary} />
              </View>
              {i < shown.length - 1 ? <View style={{ flex: 1, width: 1, backgroundColor: c.line, minHeight: 14 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 18, paddingTop: 5 }}>
              <T variant="small">{e.title}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <T variant="meta" tone="muted">{formatDate(e.at, timeZone)}</T>
                {e.context ? <T variant="meta" tone="muted">· {e.context}</T> : null}
                <Feather name={EVIDENCE_ICON[e.evidence]} size={11} color={c.inkMuted} />
                <T variant="meta" tone="muted">{evidence}</T>
              </View>
              {e.detail && expanded ? (
                <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: c.line, paddingLeft: 10 }}>
                  <T variant="meta" tone="secondary">{e.detail}</T>
                </View>
              ) : e.detail ? (
                <T variant="meta" tone="accent" style={{ marginTop: 4 }}>Show more</T>
              ) : null}
            </View>
          </Pressable>
        )
      })}
      {entries.length > limit ? (
        <Pressable onPress={() => setAll(!all)} accessibilityRole="button" style={{ minHeight: TOUCH, justifyContent: 'center' }}>
          <T variant="small" tone="accent">{all ? 'Show fewer' : `Show ${entries.length - limit} earlier`}</T>
        </Pressable>
      ) : null}
    </View>
  )
}

/** A person as a row: face, name, place, and the one fact worth knowing. */
export function PersonRow({ person, timeZone, now }: { person: VisualPerson; timeZone: string; now: Date }) {
  const { c } = useTheme()
  const place = [person.title, person.company].filter(Boolean).join(' · ')
  const fact = person.owe > 0
    ? `You owe ${person.owe}`
    : person.openLoops > 0
      ? `${person.openLoops} open`
      : person.lastInteractionAt
        ? `Last spoke ${relativeDay(person.lastInteractionAt, timeZone, now).toLowerCase()}`
        : 'No conversations yet'
  return (
      <Pressable
        onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}${person.isDemo ? ', invented sample person' : ''}${place ? `, ${place}` : ''}. ${fact}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.8 : 1, minHeight: 64 })}
      >
        <Avatar name={person.fullName} src={person.src} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="body" style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>{person.name}</T>
          {place ? <T variant="meta" tone="muted" numberOfLines={1}>{place}</T> : null}
          <T variant="meta" tone={person.owe > 0 ? 'accent' : 'secondary'} style={{ marginTop: 2 }}>{fact}</T>
          {person.isDemo ? <View style={{ marginTop: 6 }}><SampleChip /></View> : null}
        </View>
        <Feather name="chevron-right" size={18} color={c.inkMuted} />
      </Pressable>
  )
}
