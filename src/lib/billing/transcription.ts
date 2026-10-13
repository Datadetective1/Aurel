import type { MeasuredDuration } from '@/lib/capture/audio-duration'
import type { UsageRecord } from './entitlements'

/**
 * TRANSCRIPTION, METERED IN SECONDS
 * =============================================================================
 * Speech-to-text is billed per minute of audio, so it is metered in seconds:
 * `transcription_seconds`, one row per provider call, quantity = seconds. The
 * older `voice_transcription` row (quantity 1 per call) is still written, so
 * the history it already holds keeps meaning what it meant.
 *
 * No allowance is set on any plan. The meter exists so that one can be, from
 * real usage, with a single number in lib/billing/plans.
 *
 * Prices are the provider's published per-minute rates where known, as
 * internal estimates. A model with no published rate on file is left unpriced
 * (and logged) rather than given an invented one.
 * =============================================================================
 */

/** USD per minute of audio. */
export const TRANSCRIPTION_PRICE_PER_MINUTE: Record<string, number> = {
  'gpt-4o-transcribe': 0.006,
  'gpt-4o-mini-transcribe': 0.003,
  'whisper-1': 0.006,
}

/** Estimated cost in USD millionths, or null when the model has no rate on file. */
export function transcriptionCostMicros(model: string, seconds: number): number | null {
  const perMinute = TRANSCRIPTION_PRICE_PER_MINUTE[model]
  if (perMinute === undefined) return null
  return Math.round((seconds / 60) * perMinute * 1_000_000)
}

/** The two usage rows one successful transcription writes. */
export function transcriptionUsageRecords(input: {
  model: string
  duration: MeasuredDuration
  inputTokens: number | null
  outputTokens: number | null
  subjectKind?: string
}): UsageRecord[] {
  // An unpriced model writes 0 and is flagged by the caller (see
  // `transcriptionCostMicros` returning null), never a guessed rate.
  const cost = transcriptionCostMicros(input.model, input.duration.seconds)
  return [
    {
      meter: 'transcription_seconds',
      quantity: input.duration.seconds,
      provider: 'openai',
      model: input.model,
      inputTokens: input.inputTokens ?? undefined,
      outputTokens: input.outputTokens ?? undefined,
      // null (unpriced) still overrides the token estimate, which cannot
      // price audio and would read as a misleading zero.
      estimatedCostMicros: cost ?? 0,
      subjectKind: input.subjectKind,
    },
    {
      meter: 'voice_transcription',
      provider: 'openai',
      model: input.model,
      estimatedCostMicros: 0,
    },
  ]
}
