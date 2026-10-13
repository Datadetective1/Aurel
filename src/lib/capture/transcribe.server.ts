import 'server-only'
import { transcribeAudio, type TranscribeFailure } from '@/lib/ai/transcribe'
import { checkTranscriptionAllowance, recordUsage } from '@/lib/billing/entitlements'
import { transcriptionCostMicros, transcriptionUsageRecords } from '@/lib/billing/transcription'
import { logger } from '@/lib/logger'
import { measureDuration, type MeasuredDuration } from './audio-duration'

/**
 * One metered transcription: audio in, words out, usage recorded.
 *
 * Shared by the single-upload route and the segmented, storage-backed route,
 * so both measure and record exactly the same way. Usage is recorded only
 * after the provider succeeded: a failed attempt does not count against
 * anyone.
 */
export type MeteredTranscription =
  | {
      ok: true
      text: string
      model: string
      duration: MeasuredDuration
      latencyMs: number
      /** "8 minutes of transcription left this month." when close, else null. */
      notice: string | null
    }
  | { ok: false; reason: TranscribeFailure; latencyMs: number }
  /** Refused before any audio was sent: the monthly allowance. */
  | { ok: false; reason: 'allowance'; message: string; latencyMs: 0 }

export async function transcribeAndMeter(input: {
  audio: Blob
  extension: string
  declaredSeconds: number
  keywords?: string[]
}): Promise<MeteredTranscription> {
  // The header is read once for the duration; the audio itself is not kept.
  const head =
    input.extension === 'm4a' || input.extension === 'mp4'
      ? new Uint8Array(await input.audio.arrayBuffer())
      : null

  // Measured before the provider call, so the allowance is checked against
  // what this recording will cost -- and a refusal sends nothing anywhere.
  const duration = measureDuration({
    bytes: head,
    extension: input.extension,
    declaredSeconds: input.declaredSeconds,
    byteLength: input.audio.size,
  })
  const allowance = await checkTranscriptionAllowance(duration.seconds)
  if (!allowance.allowed) {
    return { ok: false, reason: 'allowance', message: allowance.message, latencyMs: 0 }
  }

  const result = await transcribeAudio({
    audio: input.audio,
    extension: input.extension,
    keywords: input.keywords,
  })
  if (!result.ok) return result

  for (const record of transcriptionUsageRecords({
    model: result.model,
    duration,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  })) {
    await recordUsage(record)
  }
  if (transcriptionCostMicros(result.model, duration.seconds) === null) {
    logger.warn('usage.unpriced_transcription_model', { model: result.model })
  }

  return {
    ok: true,
    text: result.text,
    model: result.model,
    duration,
    latencyMs: result.latencyMs,
    notice: allowance.notice,
  }
}

/** What a person is told when transcription fails. No provider, no configuration. */
export function transcriptionFailureMessage(reason: TranscribeFailure): string {
  switch (reason) {
    case 'empty_result':
      return "We couldn't make out any speech in that recording. Try again, or type what happened."
    case 'not_configured':
      return "Voice transcription isn't available right now. You can paste or type what happened instead."
    case 'too_large':
      return 'That recording is too long to transcribe in one piece. Split it and try again.'
    case 'unsupported_media':
      return "That audio format isn't supported. MP3, M4A, WAV, WebM and MP4 work."
    default:
      return "We couldn't transcribe that recording. You can try again or paste a transcript."
  }
}
