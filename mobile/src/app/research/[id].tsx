import * as React from 'react'
import { Alert, Linking, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type {
  ResearchFact,
  ResearchResponse,
  ResearchSource,
  RunResearchResponse,
  SourceDecisionResponse,
} from '@atturel/web/lib/mobile/contracts'
import { EVIDENCE_WORDS } from '@atturel/web/lib/evidence-words'
import { api, ApiError, useApi } from '~/lib/api'
import { firstName, formatDate } from '~/lib/format'
import { Button } from '~/components/button'
import { Chip } from '~/components/chip'
import { Notice } from '~/components/notice'
import { Card, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
import { useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * PUBLIC FOOTPRINT
 * =============================================================================
 * The web's research, from the phone, with nothing added unseen. Opening this
 * screen never searches: the search runs only from the button that says so.
 * Every page it finds waits here with why it may be them, where their name
 * appears, and what it would add, each fact with its evidence. Only "This is
 * them" puts a page's facts in the person's record; "Not them" sets it aside
 * for good. This is research about one person you have saved -- it is not
 * searching your people, and it reaches nobody else's record.
 * =============================================================================
 */

const MISSING_WORDS: Record<'organization' | 'jobTitle' | 'profileUrl', string> = {
  organization: 'their company',
  jobTitle: 'their role',
  profileUrl: 'a profile link',
}

function failureText(e: unknown): string {
  if (e instanceof ApiError && e.failure.kind === 'offline') return 'You are offline. Nothing changed.'
  // The plan's own words; the app offers no purchase.
  if (e instanceof ApiError && e.failure.kind === 'plan_required') return e.failure.message
  if (e instanceof ApiError && e.failure.kind === 'server') return e.failure.message
  return 'That did not go through. Try again.'
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

export default function Research() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, stale, loading, refreshing, refresh } = useApi<ResearchResponse>(
    id ? `/api/mobile/people/${id}/research` : null,
  )
  const [latest, setLatest] = React.useState<ResearchResponse | null>(null)
  const [outcome, setOutcome] = React.useState<RunResearchResponse['outcome'] | null>(null)
  const [running, setRunning] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  if (loading)
    return (
      <Screen topInset={false}>
        <Loading />
      </Screen>
    )
  const review = latest ?? data
  if (error || !review)
    return (
      <Screen topInset={false} onRefresh={refresh}>
        {error ? <Failure failure={error} onRetry={refresh} /> : null}
      </Screen>
    )

  const { person } = review
  const first = firstName(person.name)
  const waiting = review.sources.filter((s) => s.state === 'waiting')
  const kept = review.sources.filter((s) => s.state === 'kept')
  const rejected = review.sources.filter((s) => s.state === 'rejected')
  const canRun = review.canDiscover || person.hasProfileUrl

  const run = async () => {
    setRunning(true)
    setProblem(null)
    setOutcome(null)
    try {
      const result = await api.post<RunResearchResponse>(`/api/mobile/people/${person.id}/research`, {})
      const { outcome: said, ...next } = result
      setLatest(next)
      setOutcome(said)
    } catch (e) {
      setProblem(failureText(e))
    } finally {
      setRunning(false)
    }
  }

  const decide = async (source: ResearchSource, decision: 'confirm' | 'reject') => {
    setBusy(`${source.id}:${decision}`)
    setProblem(null)
    try {
      const result = await api.post<SourceDecisionResponse>(
        `/api/mobile/people/${person.id}/sources/${source.id}`,
        { decision },
      )
      if (!result.ok) {
        setProblem(result.error)
        return
      }
      setLatest(result.research)
      setNotice(
        decision === 'reject'
          ? `Marked as someone else. It will not be used for ${first}.`
          : result.factsAdded > 0
            ? `Added ${result.factsAdded} ${result.factsAdded === 1 ? 'fact' : 'facts'} to ${first}'s record.`
            : `Kept. Nothing new for ${first}'s record from that page.`,
      )
    } catch (e) {
      setProblem(failureText(e))
    } finally {
      setBusy(null)
    }
  }

  const withdraw = (source: ResearchSource) => {
    const resting = source.facts.length
    Alert.alert(
      'Not them?',
      `${resting ? `The ${resting === 1 ? 'fact' : `${resting} facts`} resting only on this page will be withdrawn from ${first}'s record. ` : ''}Research will not use this page for ${first} again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not them', style: 'destructive', onPress: () => void decide(source, 'reject') },
      ],
    )
  }

  return (
    <Screen
      topInset={false}
      refreshing={refreshing}
      onRefresh={() => {
        setLatest(null)
        void refresh()
      }}
    >
      <StaleNote failure={latest ? null : stale} />
      <T variant="title" accessibilityRole="header">{person.name}</T>
      {person.jobTitle || person.organization ? (
        <T variant="small" tone="secondary" style={{ marginTop: 2 }}>
          {[person.jobTitle, person.organization].filter(Boolean).join(' · ')}
        </T>
      ) : null}
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}

      <Card tone="sunken" style={{ marginTop: 16 }}>
        <T variant="small">
          {review.canDiscover
            ? `Atturel searches public professional sources — company pages, talks, interviews, articles — for ${person.fullName}, using the name, company, role and email domain on record.`
            : (review.hint ?? `Atturel reads the profile link on record for ${first}.`)}
        </T>
        <T variant="small" tone="secondary" style={{ marginTop: 8 }}>
          {`Each page waits here. Nothing is added to ${first}'s record until you say a page is them.`}
        </T>
        {review.lastResearchedAt ? (
          <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
            Last searched {formatDate(review.lastResearchedAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}.
          </T>
        ) : null}
        <View style={{ marginTop: 14 }}>
          <Button
            label={review.sources.length || review.lastResearchedAt ? 'Search again' : 'Research public footprint'}
            icon="search"
            busy={running}
            disabled={!canRun || busy !== null}
            accessibilityHint="Searches public sources now. Uses one research from your plan."
            onPress={() => void run()}
          />
        </View>
        <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
          {canRun
            ? 'Each search uses one research from your plan this month.'
            : `Add a profile link for ${first} in Edit details first.`}
        </T>
      </Card>

      {running ? (
        <T variant="small" tone="secondary" style={{ marginTop: 12 }} accessibilityLiveRegion="polite">
          Searching public sources and reading what they say. This can take up to a minute.
        </T>
      ) : null}
      {problem ? (
        <T variant="small" tone="critical" style={{ marginTop: 12 }} accessibilityRole="alert">
          {problem}
        </T>
      ) : null}
      {outcome ? (
        <Card tone={outcome.ok ? 'surface' : 'caution'} style={{ marginTop: 12 }}>
          <T variant="small" accessibilityRole="alert">{outcome.message}</T>
          {outcome.missing?.length ? (
            <>
              <T variant="small" tone="secondary" style={{ marginTop: 8 }}>
                {`Adding ${list(outcome.missing.map((m) => MISSING_WORDS[m]))} helps tell ${first} apart from others with the same name. Saving it does not start a search.`}
              </T>
              <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
                <Button
                  label="Edit details"
                  icon="edit-3"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/edit-person/[id]', params: { id: person.id } })}
                />
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      {waiting.length > 0 ? (
        <Section label={`Check ${waiting.length === 1 ? 'this page' : `these ${waiting.length} pages`}`} icon="help-circle">
          <View style={{ gap: 12 }}>
            {waiting.map((s) => (
              <Card key={s.id}>
                <SourceHead source={s} />
                <Facts facts={s.facts} proposals={s.proposals} intro={`If it is ${first}, this adds:`} empty="Nothing new to add from this page." />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="This is them"
                      icon="check"
                      busy={busy === `${s.id}:confirm`}
                      disabled={busy !== null || running}
                      onPress={() => void decide(s, 'confirm')}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Not them"
                      icon="x"
                      variant="secondary"
                      busy={busy === `${s.id}:reject`}
                      disabled={busy !== null || running}
                      onPress={() => void decide(s, 'reject')}
                    />
                  </View>
                </View>
                {s.url ? <OpenPage url={s.url} /> : null}
              </Card>
            ))}
          </View>
        </Section>
      ) : null}

      {kept.length > 0 ? (
        <Section label={`In ${first}'s record`} icon="book-open">
          <View style={{ gap: 12 }}>
            {kept.map((s) => (
              <Card key={s.id}>
                <SourceHead source={s} />
                <Facts facts={s.facts} proposals={s.proposals} intro="What rests on it:" empty="No facts rest on this page." />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  {s.url ? <OpenPage url={s.url} /> : null}
                  <Button
                    label="Not them"
                    variant="ghost"
                    busy={busy === `${s.id}:reject`}
                    disabled={busy !== null || running}
                    onPress={() => withdraw(s)}
                  />
                </View>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}

      {rejected.length > 0 ? (
        <Section label="Marked as someone else" icon="slash">
          {rejected.map((s) => (
            <T key={s.id} variant="small" tone="muted" style={{ marginBottom: 6 }}>
              {s.title}
              {s.host ? ` · ${s.host}` : ''}
            </T>
          ))}
        </Section>
      ) : null}

      {review.notUsed > 0 ? (
        <T variant="meta" tone="muted" style={{ marginTop: 20 }}>
          {`${review.notUsed} other ${review.notUsed === 1 ? 'page was' : 'pages were'} checked and not used: about someone else, or unreadable.`}
        </T>
      ) : null}
    </Screen>
  )
}

function SourceHead({ source }: { source: ResearchSource }) {
  const { c } = useTheme()
  const when = source.publishedAt ? formatDate(source.publishedAt, Intl.DateTimeFormat().resolvedOptions().timeZone) : null
  return (
    <View>
      {source.match ? (
        <Chip tone={source.match === 'strong' ? 'accent' : 'caution'} icon={source.match === 'strong' ? 'user-check' : 'help-circle'}>
          {source.match === 'strong' ? 'Looks like them' : 'Might be them'}
        </Chip>
      ) : null}
      <T variant="body" style={{ marginTop: source.match ? 8 : 0 }}>{source.title}</T>
      <T variant="meta" tone="muted">{[source.publisher ?? source.host, when].filter(Boolean).join(' · ')}</T>
      <T variant="small" tone="secondary" style={{ marginTop: 8 }}>{source.why}</T>
      {source.nameExcerpt ? (
        <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: c.line, paddingLeft: 10 }}>
          <T variant="meta" tone="muted">Where the name appears</T>
          <T variant="small" tone="secondary">{`“${source.nameExcerpt}”`}</T>
        </View>
      ) : null}
    </View>
  )
}

function Facts({ facts, proposals, intro, empty }: { facts: ResearchFact[]; proposals: number; intro: string; empty: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <T variant="label" tone="muted">{facts.length ? intro : empty}</T>
      {facts.map((f) => (
        <View key={f.id} style={{ marginTop: 8 }} accessible accessibilityLabel={`${f.label}: ${f.value}. ${EVIDENCE_WORDS[f.evidence].label}.`}>
          <T variant="small">
            {f.label}: {f.value}
            {f.current ? '' : ' (earlier)'}
          </T>
          <T variant="meta" tone="muted">
            {EVIDENCE_WORDS[f.evidence].label} · {EVIDENCE_WORDS[f.evidence].description}
          </T>
          {f.excerpt ? <T variant="meta" tone="secondary">{`“${f.excerpt}”`}</T> : null}
        </View>
      ))}
      {proposals > 0 ? (
        <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
          {`And ${proposals} ${proposals === 1 ? 'reading' : 'readings'} of how they communicate, each reviewed on its own on the web before it is kept.`}
        </T>
      ) : null}
    </View>
  )
}

function OpenPage({ url }: { url: string }) {
  return (
    <Button
      label="Open page"
      icon="external-link"
      variant="ghost"
      accessibilityHint="Opens the page in your browser"
      onPress={() => void Linking.openURL(url)}
    />
  )
}
