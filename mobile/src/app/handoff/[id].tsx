import * as React from 'react'
import { Share, Switch, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { HandoffResponse } from '@atturel/web/lib/mobile/contracts'
import { useApi } from '~/lib/api'
import { Button } from '~/components/button'
import { Card, Failure, Loading, Screen } from '~/components/screen'
import { T } from '~/components/text'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * HANDOFF PACK
 * =============================================================================
 * One relationship as a clean brief: for a colleague taking it over, or for
 * the user after time away. The whole text is shown before it goes anywhere,
 * and it goes only where the user sends it from the share sheet. Private
 * notes stay out unless they turn them on.
 * =============================================================================
 */
export default function Handoff() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [notes, setNotes] = React.useState(false)
  const { data, error, loading, refresh } = useApi<HandoffResponse>(
    id ? `/api/mobile/people/${id}/handoff${notes ? '?notes=1' : ''}` : null,
  )
  const [shareError, setShareError] = React.useState<string | null>(null)

  const share = async () => {
    if (!data) return
    setShareError(null)
    try {
      await Share.share({ title: data.title, message: data.text })
    } catch {
      setShareError('The share sheet did not open. Try again.')
    }
  }

  return (
    <Screen topInset={false} onRefresh={refresh}>
      <T variant="small" tone="secondary">
        Everything on record about this relationship, with how each point is known. Read it through, then share it.
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <T variant="small">Include my notes</T>
          <T variant="meta" tone="muted">Off by default. Notes are what you wrote for yourself.</T>
        </View>
        <Switch value={notes} onValueChange={setNotes} accessibilityLabel="Include my notes" />
      </View>

      {loading && !data ? <Loading /> : null}
      {error && !data ? <Failure failure={error} onRetry={refresh} /> : null}
      {data ? (
        <>
          <View style={{ marginTop: 16 }}>
            <Card tone="sunken">
              <T variant="small" selectable>{data.text}</T>
            </Card>
          </View>
          <View style={{ marginTop: 16 }}>
            <Button label="Share" icon="share" onPress={() => void share()} accessibilityHint="Opens the share sheet. Nothing is sent until you choose where." />
          </View>
          {shareError ? <T variant="small" tone="critical" style={{ marginTop: 8 }} accessibilityRole="alert">{shareError}</T> : null}
        </>
      ) : null}
    </Screen>
  )
}
