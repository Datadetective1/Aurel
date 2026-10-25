import * as React from 'react'
import { Pressable, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import type { AddAttendeeResponse, MeetingResponse, PrepareResponse } from '@atturel/web/lib/mobile/contracts'
import { DIRECTION_META } from '@atturel/web/lib/visual/relationship-actions'
import { api, ApiError, useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { countdown, formatDate, formatTime, relativeDay, firstName } from '~/lib/format'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { Chip, ChipRow, DIRECTION_ICON, PrepChip } from '~/components/chip'
import { CompanyLine, LoopRow, SampleChip } from '~/components/relationship'
import { PeoplePicker } from '~/components/people-picker'
import { Notice } from '~/components/notice'
import { Card, Empty, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * PREPARE
 * =============================================================================
 * One brief at three depths, designed for a phone rather than shrunk onto it.
 *
 *   GLANCE   five to ten seconds: objective, three things to remember, the
 *            one open loop, capture
 *   QUICK    sixty seconds: last time, what is open by direction, the room,
 *            how to approach each person, what may come up
 *   DEEP     everything in the stored brief, each section collapsed to its
 *            headline until opened
 *
 * Nothing is generated on the phone. Every line is read from the brief the
 * server stored, or fresh from the record. "Prepare" asks the server to build
 * that brief with the web's own Generate -- the same entitlement, metering and
 * evidence trail -- and then reads it like any other.
 * =============================================================================
 */

type Depth = 'glance' | 'quick' | 'deep'

export default function Prepare() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const [depth, setDepth] = React.useState<Depth>('glance')
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<MeetingResponse>(id ? `/api/mobile/meetings/${id}` : null)
  const [notice, setNotice] = React.useState<string | null>(null)
  useFresh(reload)
  const changed = (message: string) => {
    setNotice(message)
    reload()
  }

  if (loading) return <Screen topInset={false}><Loading label="Loading the brief" /></Screen>
  if (error || !data) return <Screen topInset={false} onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>

  const now = new Date()
  const tz = data.timeZone
  const owe = data.loops.filter((l) => l.direction === 'owe').length
  const soon = countdown(data.meeting.scheduledAt, now)

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      <Stack.Screen options={{ title: '' }} />

      {/* --- the cockpit: who, when, what state ------------------------------- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="clock" size={13} color={c.accent} />
        <T variant="label" tone="accent">
          {[soon, data.meeting.scheduledAt ? `${relativeDay(data.meeting.scheduledAt, tz, now)} ${formatTime(data.meeting.scheduledAt, tz)}` : 'Unscheduled']
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>
      <T variant="display" style={{ marginTop: 8 }} accessibilityRole="header">{data.meeting.title}</T>
      {data.meeting.isDemo ? <View style={{ marginTop: 8 }}><SampleChip /></View> : null}
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}

      {data.people.length === 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${data.people[0]!.name}${data.people[0]!.archived ? ', archived' : ''}, open their page`}
          onPress={() => openPerson(data.people[0]!)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}
        >
          <Avatar name={data.people[0]!.fullName} src={data.people[0]!.src} size={72} />
          <View style={{ flex: 1 }}>
            <T variant="title">{data.people[0]!.name}</T>
            {data.people[0]!.title ? <T variant="small" tone="secondary">{data.people[0]!.title}</T> : null}
            {data.people[0]!.company ? <View style={{ marginTop: 4 }}><CompanyLine name={data.people[0]!.company} /></View> : null}
            {data.people[0]!.archived ? <View style={{ marginTop: 6, alignSelf: 'flex-start' }}><Chip icon="archive">Archived</Chip></View> : null}
          </View>
        </Pressable>
      ) : data.people.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
          {data.people.slice(0, 6).map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}${p.archived ? ', archived' : ''}, open their page`}
              onPress={() => openPerson(p)}
              style={{ alignItems: 'center', width: 64, gap: 6 }}
            >
              <Avatar name={p.fullName} src={p.src} size={56} />
              <T variant="meta" numberOfLines={1}>{firstName(p.name)}</T>
              {p.archived ? <T variant="meta" tone="muted" numberOfLines={1}>Archived</T> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <ChipRow>
          <PrepChip prep={data.prep} />
          {owe > 0 ? <Chip icon={DIRECTION_ICON.owe} tone="accent">{`You owe ${owe}`}</Chip> : null}
          {data.loops.length > owe ? <Chip>{`${data.loops.length - owe} other open`}</Chip> : null}
        </ChipRow>
      </View>

      {/* --- depth ------------------------------------------------------------- */}
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', marginTop: 20, backgroundColor: c.bgSunken, borderRadius: 12, padding: 4 }}
      >
        {(
          [
            ['glance', 'Glance'],
            ['quick', 'Quick'],
            ['deep', 'Deep'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: depth === key }}
            onPress={() => setDepth(key)}
            style={{ flex: 1, minHeight: TOUCH - 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: depth === key ? c.surface : 'transparent' }}
          >
            <T variant="small" tone={depth === key ? 'ink' : 'muted'} style={{ fontFamily: 'InstrumentSans_500Medium' }}>{label}</T>
          </Pressable>
        ))}
      </View>

      {data.prep !== 'ready' ? (
        <Unprepared data={data} onChanged={changed} />
      ) : depth === 'glance' ? (
        <Glance data={data} />
      ) : depth === 'quick' ? (
        <Quick data={data} onChanged={changed} />
      ) : (
        <Deep data={data} />
      )}

      {data.prep === 'ready' ? <PrepareButton meetingId={data.meeting.id} again onDone={changed} /> : null}

      <View style={{ marginTop: 28, gap: 10 }}>
        <Button
          label="Capture this conversation"
          icon="mic"
          size="lg"
          onPress={() => router.push({ pathname: '/capture', params: { meetingId: data.meeting.id } })}
        />
      </View>
    </Screen>
  )
}

function Glance({ data }: { data: MeetingResponse }) {
  const { c } = useTheme()
  const tz = data.timeZone
  const loop = data.glance.openLoop
  return (
    <View>
      {data.glance.objective ? (
        <Section label="Objective" icon="target">
          <T variant="title">{data.glance.objective}</T>
        </Section>
      ) : null}

      {data.glance.remember.length > 0 ? (
        <Section label="Remember">
          <View style={{ gap: 12 }}>
            {data.glance.remember.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accentGraphic, marginTop: 8 }} />
                <View style={{ flex: 1 }}>
                  <T variant="body">{item.text}</T>
                  <T variant="meta" tone="muted" style={{ marginTop: 1 }}>{item.basis}</T>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {loop ? (
        <View style={{ marginTop: 24 }}>
          <Card tone={loop.overdue ? 'critical' : 'accent'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name={loop.overdue ? 'alert-circle' : DIRECTION_ICON[loop.direction]} size={13} color={loop.overdue ? c.critical : c.accent} />
              <T variant="label" tone={loop.overdue ? 'critical' : 'accent'}>{loop.overdue ? 'Overdue' : 'Open loop'}</T>
            </View>
            <T variant="body" style={{ marginTop: 8 }}>{loop.description}</T>
            <T variant="meta" tone="muted" style={{ marginTop: 3 }}>
              {[DIRECTION_META[loop.direction].label, loop.dueOn ? `due ${relativeDay(loop.dueOn, tz, new Date()).toLowerCase()}` : null].filter(Boolean).join(' · ')}
            </T>
          </Card>
        </View>
      ) : null}

      {data.glance.howToOpen ? (
        <Section label="Open with" icon="message-square">
          <View style={{ borderLeftWidth: 2, borderLeftColor: c.accentGraphic, paddingLeft: 12 }}>
            <T variant="small" tone="secondary">{data.glance.howToOpen}</T>
          </View>
        </Section>
      ) : null}
    </View>
  )
}

/**
 * Before the brief: who is missing, or the one button that builds it. The
 * web's Generate runs on the server; this screen waits and then reads.
 */
function Unprepared({ data, onChanged }: { data: MeetingResponse; onChanged: (message: string) => void }) {
  const [adding, setAdding] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Whoever is already in the meeting, or was just added, is not offered again.
  const [added, setAdded] = React.useState<string[]>([])
  const hidden = [...data.people.map((p) => p.id), ...added]
  if (data.prep === 'needs_people') {
    const add = async (personId: string, name: string) => {
      setError(null)
      try {
        if (hidden.includes(personId)) return
        setAdded((a) => [...a, personId])
        const result = await api.post<AddAttendeeResponse>(`/api/mobile/meetings/${data.meeting.id}/attendees`, { personId })
        if (result.ok) onChanged(`${firstName(name)} added. Prepare when everyone is in.`)
        else {
          setAdded((a) => a.filter((id) => id !== personId))
          setError(result.error)
        }
      } catch (e) {
        setAdded((a) => a.filter((id) => id !== personId))
        setError(
          e instanceof ApiError && e.failure.kind === 'offline'
            ? 'You are offline.'
            : e instanceof ApiError && e.failure.kind === 'not_found'
              ? 'Adding people from the app is not available yet. Use atturel.com.'
              : 'That person could not be added. Try again.',
        )
      }
    }
    return (
      <View>
        <Empty icon="user-plus" title="No one is in this meeting yet" body="The brief is built from what you know about the people in the room. Add who will be there." />
        {adding ? (
          <PeoplePicker selected={[]} hidden={hidden} onToggle={(p) => void add(p.id, p.name)} />
        ) : (
          <Button label="Add people" icon="user-plus" variant="secondary" onPress={() => setAdding(true)} />
        )}
        {error ? <T variant="small" tone="critical" style={{ marginTop: 10 }} accessibilityRole="alert">{error}</T> : null}
      </View>
    )
  }
  return (
    <View>
      <Empty icon="edit-3" title="Not prepared yet" body="Atturel reads what you know about these people — past conversations, open loops, what they care about — and writes a brief at every depth." />
      <PrepareButton meetingId={data.meeting.id} onDone={onChanged} />
    </View>
  )
}

function PrepareButton({ meetingId, again, onDone }: { meetingId: string; again?: boolean; onDone: (message: string) => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const prepare = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<PrepareResponse>(`/api/mobile/meetings/${meetingId}/prepare`, {})
      if (result.ok) {
        onDone(result.grounded ? 'Prepared from your records alone — no language model was involved.' : 'Prepared.')
      } else {
        setError(result.upgrade ? 'This account has used the briefs its plan includes.' : result.error)
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline.'
          : e instanceof ApiError && e.failure.kind === 'not_found'
            ? 'Preparing from the app is not available yet. Prepare it once on atturel.com.'
            : e instanceof ApiError && e.failure.kind === 'server'
              ? /upgrade|pro\b|plan/i.test(e.failure.message)
                ? 'This account has used the briefs its plan includes.'
                : e.failure.message
              : 'The brief could not be prepared. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ marginTop: again ? 20 : 0, gap: 8 }}>
      <Button
        label={again ? 'Prepare again with what is new' : 'Prepare now'}
        icon={again ? 'refresh-cw' : 'zap'}
        variant={again ? 'ghost' : 'primary'}
        size={again ? 'md' : 'lg'}
        busy={busy}
        onPress={() => void prepare()}
      />
      {busy ? (
        <T variant="small" tone="secondary" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
          Reading what you know about them — usually 10 to 30 seconds.
        </T>
      ) : null}
      {error ? <T variant="small" tone="critical" accessibilityRole="alert">{error}</T> : null}
    </View>
  )
}

function Quick({ data, onChanged }: { data: MeetingResponse; onChanged: (message: string) => void }) {
  const { c } = useTheme()
  const q = data.quick
  const tz = data.timeZone
  const now = new Date()
  const faces = new Map(data.people.map((p) => [p.id, p]))
  if (!q) return null
  return (
    <View>
      {q.outcomeToLeaveWith ? (
        <Section label="Leave with" icon="flag">
          <T variant="body">{q.outcomeToLeaveWith}</T>
        </Section>
      ) : null}

      {data.lastConversation ? (
        <Section label="Last time" icon="message-circle">
          <Card>
            <T variant="meta" tone="muted">{formatDate(data.lastConversation.occurredAt, tz)} · {data.lastConversation.title}</T>
            {data.lastConversation.outcome || data.lastConversation.summary ? (
              <T variant="small" style={{ marginTop: 6 }}>{data.lastConversation.outcome ?? data.lastConversation.summary}</T>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {data.loops.length > 0 ? (
        <Section label="Open between you" icon="corner-up-right">
          {data.loops.map((l) => <LoopRow key={l.id} loop={l} timeZone={tz} now={now} onChanged={onChanged} />)}
        </Section>
      ) : null}

      {q.participants.some((p) => p.guidance[0] || p.knownConcerns[0]) ? (
        <Section label="How to approach them" icon="users">
          <View style={{ gap: 16 }}>
            {q.participants.map((p, i) => {
              if (!p.guidance[0] && !p.knownConcerns[0]) return null
              const face = p.personId ? faces.get(p.personId) : undefined
              return (
                <View key={p.personId ?? i} style={{ flexDirection: 'row', gap: 12 }}>
                  <Avatar name={face?.fullName ?? p.name} src={face?.src} size={40} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <T variant="small" style={{ fontFamily: 'InstrumentSans_500Medium' }}>{p.name}</T>
                    {p.guidance[0] ? <T variant="small" tone="secondary">{p.guidance[0]}</T> : null}
                    {p.knownConcerns[0] ? <Chip icon="shield">{`Has raised: ${p.knownConcerns[0]}`}</Chip> : null}
                    {p.publicOnly ? <T variant="meta" tone="muted">Public sources only — preliminary until you have met.</T> : null}
                  </View>
                </View>
              )
            })}
          </View>
        </Section>
      ) : null}

      {data.connections.length > 0 ? (
        <Section label="Between them, on record" icon="link">
          <ChipRow>
            {data.connections.slice(0, 4).map((x) => (
              <Chip key={`${x.a}-${x.b}-${x.kind}-${x.label}`}>
                {`${firstName(faces.get(x.a)?.name ?? '')} & ${firstName(faces.get(x.b)?.name ?? '')} · ${x.description}`}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      ) : null}

      {q.cues.length > 0 ? (
        <Section label="Listen for" icon="headphones">
          <T variant="meta" tone="muted" style={{ marginBottom: 8 }}>Open in your record — not a prediction of what anyone will say.</T>
          {q.cues.map((cue, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <T variant="small">{cue.text}</T>
              <T variant="meta" tone="muted">{cue.note}</T>
            </View>
          ))}
        </Section>
      ) : null}

      {q.likelyObjections.length > 0 ? (
        <Section label="May come up" icon="shield">
          {q.likelyObjections.slice(0, 3).map((o, i) => (
            <Disclosure key={i} title={o.objection}>
              <T variant="small" tone="secondary">{o.response}</T>
              {o.basis ? <T variant="meta" tone="muted" style={{ marginTop: 6 }}>Why: {o.basis}</T> : null}
            </Disclosure>
          ))}
        </Section>
      ) : null}

      {q.uncertainties.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Card tone="caution">
            <T variant="label" tone="caution">What isn’t known</T>
            {q.uncertainties.slice(0, 3).map((u, i) => (
              <T key={i} variant="small" tone="secondary" style={{ marginTop: 6 }}>{u}</T>
            ))}
          </Card>
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: c.line, marginTop: 24 }} />
    </View>
  )
}

function Deep({ data }: { data: MeetingResponse }) {
  const b = data.deep
  if (!b) return null
  const lists: [string, string[]][] = [
    ['Recommended approach', b.recommendedApproach],
    ['Emphasize', b.emphasize],
    ['Avoid', b.avoid],
    ['Questions to ask', b.questionsToAsk],
    ['Before you walk in', b.checklist],
    ['Still unresolved', b.roomDynamics?.unresolvedIssues ?? []],
    ['Known disagreements', b.roomDynamics?.knownDisagreements ?? []],
  ]
  return (
    <View>
      {b.sixtySecond ? (
        <Section label="In short">
          <T variant="title">{b.sixtySecond}</T>
        </Section>
      ) : null}
      <Section label="Everything in the brief">
        {b.participants.map((p, i) => (
          <Disclosure key={p.personId ?? i} title={p.name} subtitle={p.relevance ?? undefined}>
            {p.relationshipNote ? <T variant="meta" tone="muted" style={{ marginBottom: 6 }}>{p.relationshipNote}</T> : null}
            <Bullets label="What matters to them" items={p.whatMatters} />
            <Bullets label="How to approach them" items={p.guidance} />
            <Bullets label="Concerns they have raised" items={p.knownConcerns} />
            <Bullets label="From public sources" items={p.publicContext.map((x) => (x.sourceLabel ? `${x.statement} · ${x.sourceLabel}` : x.statement))} />
          </Disclosure>
        ))}
        {lists.filter(([, items]) => items.length > 0).map(([label, items]) => (
          <Disclosure key={label} title={label} subtitle={`${items.length}`}>
            <Bullets items={items} />
          </Disclosure>
        ))}
        {b.questionsYouMayGet.length > 0 ? (
          <Disclosure title="Questions you may get" subtitle={`${b.questionsYouMayGet.length}`}>
            {b.questionsYouMayGet.map((x, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <T variant="small" style={{ fontFamily: 'InstrumentSans_500Medium' }}>{x.question}</T>
                <T variant="small" tone="secondary">{x.response}</T>
              </View>
            ))}
          </Disclosure>
        ) : null}
      </Section>
      <T variant="meta" tone="muted" style={{ marginTop: 16 }}>
        {data.grounded ? 'Composed directly from your records — no language model was involved.' : 'Generated from your records.'}
        {data.preparedAt ? ` Prepared ${formatDate(data.preparedAt, data.timeZone)}.` : ''}
      </T>
    </View>
  )
}

function Bullets({ label, items }: { label?: string; items: string[] }) {
  const { c } = useTheme()
  if (items.length === 0) return null
  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <T variant="meta" tone="muted" style={{ marginBottom: 4 }}>{label}</T> : null}
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <View style={{ width: 10, height: 1, backgroundColor: c.lineStrong, marginTop: 10 }} />
          <T variant="small" style={{ flex: 1 }}>{item}</T>
        </View>
      ))}
    </View>
  )
}

function Disclosure({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { c } = useTheme()
  const [open, setOpen] = React.useState(false)
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 10 }}
      >
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ fontFamily: 'InstrumentSans_500Medium' }}>{title}</T>
          {subtitle ? <T variant="meta" tone="muted">{subtitle}</T> : null}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.inkMuted} />
      </Pressable>
      {open ? <View style={{ paddingBottom: 14 }}>{children}</View> : null}
    </View>
  )
}

/** Someone removed from the user's people opens on their archived page. */
function openPerson(p: { id: string; archived?: boolean }) {
  if (p.archived) router.push({ pathname: '/archived/[id]', params: { id: p.id } })
  else router.push({ pathname: '/person/[id]', params: { id: p.id } })
}
