import * as React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import type { CardFields } from '@atturel/web/lib/people/card-text'
import { scanCard, scanSupported } from '~/lib/scan'
import { NewPerson } from '~/components/people-picker'
import { Button } from '~/components/button'
import { Card, Screen } from '~/components/screen'
import { T } from '~/components/text'
export { RouteError as ErrorBoundary } from '~/components/route-error'

const WHY: Record<'unsupported' | 'nothing_read' | 'failed', string> = {
  unsupported: 'This device cannot read text from photos. Add the person by hand instead.',
  nothing_read: 'No text could be read from that photo. Try one taken straight on, in good light.',
  failed: 'That photo could not be read. Try another.',
}

/**
 * SCAN A CARD OR BADGE
 * =============================================================================
 * Pick a photo of a business card or a conference badge; the phone reads it;
 * the fields it found are filled in for the user to check. Nothing is saved
 * until they press Add, and the usual duplicate check runs first.
 * =============================================================================
 */
export default function Scan() {
  const [fields, setFields] = React.useState<CardFields | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [round, setRound] = React.useState(0)

  const scan = async () => {
    setBusy(true)
    setProblem(null)
    const result = await scanCard()
    setBusy(false)
    if (result.ok) {
      setFields(result.fields)
      setRound((r) => r + 1)
    } else if (result.reason !== 'cancelled') setProblem(WHY[result.reason])
  }

  const open = (id: string) => router.replace({ pathname: '/person/[id]', params: { id } })

  return (
    <Screen topInset={false}>
      <T variant="small" tone="secondary">
        Choose a photo of a business card or a conference badge. Your iPhone reads it, and the photo never leaves your phone. You check every field before the person is added.
      </T>
      <View style={{ marginTop: 14, alignItems: 'flex-start' }}>
        <Button
          label={fields ? 'Choose another photo' : 'Choose a photo'}
          icon="image"
          variant={fields ? 'secondary' : 'primary'}
          busy={busy}
          disabled={!scanSupported}
          accessibilityHint="Opens the system photo picker. Take the photo with the Camera app first if you need to."
          onPress={() => void scan()}
        />
      </View>
      {!scanSupported ? <T variant="small" tone="muted" style={{ marginTop: 10 }}>{WHY.unsupported}</T> : null}
      {problem ? (
        <View style={{ marginTop: 12 }}>
          <Card tone="caution">
            <T variant="small" accessibilityRole="alert">{problem}</T>
          </Card>
        </View>
      ) : null}

      {fields ? (
        <>
          <T variant="meta" tone="muted" style={{ marginTop: 18 }}>
            Read from the photo. Correct anything that came out wrong.
          </T>
          <NewPerson
            key={round}
            initialName={fields.fullName}
            initial={{
              company: fields.organizationName,
              title: fields.jobTitle,
              email: fields.email,
              profileUrl: fields.profileUrl,
              notes: fields.notes,
            }}
            onCancel={() => router.back()}
            onAdded={(p) => open(p.id)}
            onExisting={(p) => open(p.id)}
          />
        </>
      ) : null}
    </Screen>
  )
}
