import * as React from 'react'
import { Alert, Linking, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import type {
  ResearchFact,
  ResearchProfileFact,
  ResearchResponse,
  ResearchSource,
  RunResearchResponse,
  SourceDecisionResponse,
  SourcePhotoResponse,
} from '@atturel/web/lib/mobile/contracts'
import { api, apiImage, ApiError, useApi } from '~/lib/api'
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
 * appears, and what it would add. What every page says is merged at the top,
 * newest first, so five articles saying one thing read as one line. Only
 * "This is them" (or "These are all them", which says it of each page in
 * turn) puts a page's facts in the person's record; "Not them" sets it aside
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

/** Facts shown on a card before "Show more": enough to judge the page by. */
const FACTS_SHOWN = 2
/** Lines of the merged profile shown before "Show all". */
const PROFILE_SHOWN = 6

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

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

  /** "These are all them": each waiting page confirmed in turn, stopping at the first that fails. */
  const confirmAll = () => {
    const pages = waiting
    Alert.alert(
      'These are all them?',
      `The ${pages.length} pages waiting here will be added to ${first}'s record, as if you said "This is them" on each.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add all',
          onPress: () =>
            void (async () => {
              setBusy('all')
              setProblem(null)
              let added = 0
              let done = 0
              try {
                for (const source of pages) {
                  const result = await api.post<SourceDecisionResponse>(
                    `/api/mobile/people/${person.id}/sources/${source.id}`,
                    { decision: 'confirm' },
                  )
                  if (!result.ok) {
                    setProblem(result.error)
                    break
                  }
                  setLatest(result.research)
                  added += result.factsAdded
                  done += 1
                }
              } catch (e) {
                setProblem(failureText(e))
              } finally {
                setBusy(null)
                if (done > 0)
                  setNotice(
                    `Kept ${done} ${done === 1 ? 'page' : 'pages'}${added > 0 ? ` and added ${added} ${added === 1 ? 'fact' : 'facts'} to ${first}'s record` : ''}.`,
                  )
              }
            })(),
        },
      ],
    )
  }

  /** Their photo from a page they said is them: used, or skipped for good. */
  const photo = async (source: ResearchSource, use: boolean) => {
    setBusy(`${source.id}:${use ? 'photo' : 'skip'}`)
    setProblem(null)
    try {
      const path = `/api/mobile/people/${person.id}/sources/${source.id}/photo`
      const result = use ? await api.post<SourcePhotoResponse>(path, {}) : await api.delete<SourcePhotoResponse>(path)
      if (!result.ok) {
        setProblem(result.error)
        return
      }
      setLatest(result.research)
      if (use) setNotice(`Saved as ${first}'s photo. Change it any time in Edit details.`)
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
            ? `Atturel searches public professional sources (company pages, talks, interviews, articles) for ${person.fullName}, using the name, company, role and email domain on record.`
            : (review.hint ?? `Atturel reads the profile link on record for ${first}.`)}
        </T>
        <T variant="small" tone="secondary" style={{ marginTop: 8 }}>
          {`Each page waits here. Nothing is added to ${first}'s record until you say a page is them.`}
        </T>
        {review.lastResearchedAt ? (
          <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
            Last searched {formatDate(review.lastResearchedAt, zone())}.
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
          {!outcome.ok && !outcome.missing?.length ? (
            <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
              <Button
                label="Add what you know"
                icon="edit-3"
                variant="secondary"
                onPress={() => router.push({ pathname: '/edit-person/[id]', params: { id: person.id } })}
              />
            </View>
          ) : null}
          {!outcome.ok ? (
            <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
              {`Plenty of people have little online. Notes you add about ${first} are used in every brief.`}
            </T>
          ) : null}
        </Card>
      ) : null}

      {review.profile?.length ? <Profile facts={review.profile} first={first} /> : null}

      {waiting.length > 0 ? (
        <Section label={`Check ${waiting.length === 1 ? 'this page' : `these ${waiting.length} pages`}`} icon="help-circle">
          {waiting.length > 1 ? (
            <View style={{ marginBottom: 12, alignItems: 'flex-start' }}>
              <Button
                label="These are all them"
                icon="check-circle"
                variant="secondary"
                busy={busy === 'all'}
                disabled={busy !== null || running}
                accessibilityHint={`Adds every page waiting here to ${first}'s record`}
                onPress={confirmAll}
              />
            </View>
          ) : null}
          <View style={{ gap: 12 }}>
            {waiting.map((s) => (
              <Card key={s.id}>
                <SourceHead source={s} personId={person.id} />
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
                <SourceHead source={s} personId={person.id} />
                <Facts facts={s.facts} proposals={s.proposals} intro="What rests on it:" empty="No facts rest on this page." />
                {s.offerPhoto ? (
                  <Card tone="sunken" style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Thumbnail personId={person.id} source={s} size={56} />
                      <T variant="small" style={{ flex: 1 }}>{`Use this page's picture as ${first}'s photo?`}</T>
                    </View>
                    <T variant="meta" tone="muted" style={{ marginTop: 6 }}>
                      {`You said this page is ${first}. Check the picture is them too.`}
                    </T>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Button
                        label="Use as photo"
                        icon="user"
                        variant="secondary"
                        busy={busy === `${s.id}:photo`}
                        disabled={busy !== null || running}
                        onPress={() => void photo(s, true)}
                      />
                      <Button
                        label="Skip"
                        variant="ghost"
                        busy={busy === `${s.id}:skip`}
                        disabled={busy !== null || running}
                        onPress={() => void photo(s, false)}
                      />
                    </View>
                  </Card>
                ) : null}
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

function SourceHead({ source, personId }: { source: ResearchSource; personId: string }) {
  const { c } = useTheme()
  // A guide updated since it was published reads by its update.
  const when = source.updatedAt
    ? `Updated ${formatDate(source.updatedAt, zone())}`
    : source.publishedAt
      ? formatDate(source.publishedAt, zone())
      : null
  return (
    <View>
      {source.match ? (
        <Chip tone={source.match === 'strong' ? 'accent' : 'caution'} icon={source.match === 'strong' ? 'user-check' : 'help-circle'}>
          {source.match === 'strong' ? 'Looks like them' : 'Might be them'}
        </Chip>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: source.match ? 8 : 0 }}>
        <View style={{ flex: 1 }}>
          <T variant="body">{source.title}</T>
          <T variant="meta" tone="muted">{[source.publisher ?? source.host, when].filter(Boolean).join(' · ')}</T>
        </View>
        <Thumbnail personId={personId} source={source} size={52} />
      </View>
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
  const [open, setOpen] = React.useState(false)
  const shown = open ? facts : facts.slice(0, FACTS_SHOWN)
  const more = facts.length - shown.length
  return (
    <View style={{ marginTop: 12 }}>
      <T variant="label" tone="muted">{facts.length ? intro : empty}</T>
      {shown.map((f) => (
        <View key={f.id} style={{ marginTop: 8 }} accessible accessibilityLabel={`${f.label}: ${f.value}.${f.evidence === 'inferred' ? ' Worth checking.' : ''}`}>
          <T variant="small">
            {f.label}: {f.value}
            {f.current ? '' : ' (earlier)'}
          </T>
          {f.evidence === 'inferred' ? (
            <T variant="meta" tone="muted">
              Worth checking: the page implies it rather than says it.
            </T>
          ) : null}
          {open && f.excerpt ? <T variant="meta" tone="secondary">{`“${f.excerpt}”`}</T> : null}
        </View>
      ))}
      {more > 0 || (open && facts.length > FACTS_SHOWN) ? (
        <View style={{ marginTop: 4, alignItems: 'flex-start' }}>
          <Button
            label={open ? 'Show less' : `Show ${more} more`}
            variant="ghost"
            onPress={() => setOpen(!open)}
          />
        </View>
      ) : null}
      {proposals > 0 ? (
        <T variant="meta" tone="muted" style={{ marginTop: 8 }}>
          {`And ${proposals} ${proposals === 1 ? 'reading' : 'readings'} of how they communicate, each reviewed on its own on the web before it is kept.`}
        </T>
      ) : null}
    </View>
  )
}

/** What the pages say, merged: one line per thing, with how many pages say it and when. */
function Profile({ facts, first }: { facts: ResearchProfileFact[]; first: string }) {
  const [open, setOpen] = React.useState(false)
  const shown = open ? facts : facts.slice(0, PROFILE_SHOWN)
  const waitingOnly = facts.every((f) => !f.onRecord)
  return (
    <Section label="What the pages say" icon="layers">
      <Card>
        <T variant="meta" tone="muted">
          {waitingOnly
            ? `From the pages below. None of it is in ${first}'s record until you confirm a page.`
            : `From the pages below. Lines marked waiting join ${first}'s record when you confirm their page.`}
        </T>
        {shown.map((f) => {
          const when = f.asOf ? formatDate(f.asOf, zone()) : null
          const note = [
            `${f.pages} ${f.pages === 1 ? 'page' : 'pages'}`,
            f.dated && when ? `as of ${when}` : when ? `newest ${when}` : null,
            !waitingOnly && !f.onRecord ? 'waiting' : null,
            f.worthChecking ? 'worth checking' : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <View key={`${f.kind}:${f.value}`} style={{ marginTop: 10 }} accessible accessibilityLabel={`${f.label}: ${f.value}. ${note}.`}>
              <T variant="small" tone={f.past || f.dated ? 'secondary' : undefined}>
                {f.label}: {f.value}
              </T>
              <T variant="meta" tone="muted">{note}</T>
            </View>
          )
        })}
        {facts.length > PROFILE_SHOWN ? (
          <View style={{ marginTop: 4, alignItems: 'flex-start' }}>
            <Button
              label={open ? 'Show less' : `Show all ${facts.length}`}
              variant="ghost"
              onPress={() => setOpen(!open)}
            />
          </View>
        ) : null}
      </Card>
    </Section>
  )
}

/**
 * The page's lead image, small, through Atturel's server so the phone never
 * tells the publisher who is being looked up. Nothing at all when the page
 * has none or it does not load: no empty box, no broken-image icon.
 */
function Thumbnail({ personId, source, size }: { personId: string; source: ResearchSource; size: number }) {
  const { c } = useTheme()
  const [image, setImage] = React.useState<Awaited<ReturnType<typeof apiImage>>>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let live = true
    if (source.image) void apiImage(`/api/mobile/people/${personId}/sources/${source.id}/image`).then((next) => live && setImage(next))
    return () => {
      live = false
    }
  }, [personId, source.id, source.image])
  if (!source.image || !image || failed) return null
  return (
    <Image
      source={image}
      accessibilityIgnoresInvertColors
      accessible={false}
      style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.line }}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={source.id}
      transition={120}
      onError={() => setFailed(true)}
    />
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
