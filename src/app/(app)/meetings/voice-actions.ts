'use server'

import { track } from '@/lib/analytics'

/**
 * The two voice events the server cannot see for itself.
 *
 * Opening the microphone and discarding before upload both happen entirely in
 * the browser, and they are the two most interesting drop-offs in this funnel:
 * how many people press record, and how many abandon before saying anything
 * worth sending. Everything after upload is recorded by the transcription
 * endpoint, which already knows.
 *
 * The name is a closed union rather than a string, so this cannot become a
 * general-purpose "log anything from the client" hole. Duration is a number of
 * seconds and there is deliberately no way to pass text through it.
 */
export async function recordVoiceEvent(
  name: 'voice_debrief_started' | 'voice_debrief_cancelled',
  durationSeconds?: number,
): Promise<void> {
  await track(
    name,
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
      ? { durationSeconds: Math.max(0, Math.round(durationSeconds)) }
      : {},
  )
}
