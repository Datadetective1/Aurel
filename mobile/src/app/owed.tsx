import * as React from 'react'
import { View } from 'react-native'
import type { OwedLoop, OwedResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { useFresh } from '~/lib/use-fresh'
import { LoopRow } from '~/components/relationship'
import { freshnessTone } from '~/components/relationship-tools'
import { Notice } from '~/components/notice'
import { Empty, Failure, Loading, Screen, Section, StaleNote } from '~/components/screen'
import { T } from '~/components/text'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * EVERYTHING OWED
 * =============================================================================
 * Every open commitment across every meeting and conversation, in two
 * directions: what the user promised, and what they were promised. Each one
 * says how close it is to going stale, nearest first, so the nudge arrives
 * while the promise can still be kept. Tap any one to close it.
 * =============================================================================
 */
export default function Owed() {
  const { data, error, stale, loading, refreshing, refresh, reload } = useApi<OwedResponse>('/api/mobile/owed')
  const [notice, setNotice] = React.useState<string | null>(null)
  useFresh(reload)
  const changed = (message: string) => {
    setNotice(message)
    reload()
  }

  if (loading) return <Screen topInset={false}><Loading /></Screen>
  if (error || !data) return <Screen topInset={false} onRefresh={refresh}>{error ? <Failure failure={error} onRetry={refresh} /> : null}</Screen>

  const now = new Date(data.now)
  const empty = data.mine.length + data.theirs.length + data.shared.length === 0
  const rows = (loops: OwedLoop[]) =>
    loops.map((l) => (
      <LoopRow key={l.id} loop={l} timeZone={data.timeZone} now={now} onChanged={changed} freshness={{ note: l.note, tone: freshnessTone(l) }} />
    ))

  return (
    <Screen topInset={false} refreshing={refreshing} onRefresh={refresh}>
      <StaleNote failure={stale} />
      {notice ? <Notice text={notice} onDone={() => setNotice(null)} /> : null}
      <T variant="small" tone="secondary">
        {data.nudges > 0
          ? `${data.nudges} ${data.nudges === 1 ? 'is' : 'are'} overdue or close to going stale. Those come first.`
          : 'Nothing is close to going stale.'}
      </T>

      {empty ? (
        <View style={{ marginTop: 20 }}>
          <Empty
            icon="corner-up-right"
            title="Nothing owed either way"
            body="Promises from your meetings and conversations collect here once you confirm them."
          />
        </View>
      ) : null}

      {data.mine.length > 0 ? <Section label="You owe" icon="arrow-up-right">{rows(data.mine)}</Section> : null}
      {data.theirs.length > 0 ? <Section label="Owed to you" icon="arrow-down-left">{rows(data.theirs)}</Section> : null}
      {data.shared.length > 0 ? <Section label="Still to settle" icon="repeat">{rows(data.shared)}</Section> : null}
    </Screen>
  )
}
