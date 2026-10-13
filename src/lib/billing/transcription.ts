import type { MeasuredDuration } from '@/lib/capture/audio-duration'
import type { UsageRecord } from './entitlements'
import { PLANS } from './plans'

/**
 * TRANSCRIPTION, METERED IN SECONDS
 * =============================================================================
 * Speech-to-text is billed per minute of audio, so it is metered in seconds:
 * `transcription_seconds`, one row per provider call, quantity = seconds. The
 * older `voice_transcription` row (quantity 1 per call) is still written, so
 * the history it already holds keeps meaning what it meant.
 *
 * Allowances are set per plan in lib/billing/plans (`transcription_seconds`)
 * and enforced on the server before any audio is sent: Free 60 minutes a
 * month, Pro 600, owner and pilot unlimited. See `transcriptionAllowance`.
 *
 * Prices are the provider's published per-minute rates where known, as
 * internal estimates. A model with no published rate on file is left unpriced
 * (and logged) rather than given an invented one.
 * =============================================================================
 */

/** USD per minute of audio. */
export const TRANSCRIPTION_PRICE_PER_MINUTE: Record<string, number> = {
  // The supported model (lib/ai/transcribe).
  'gpt-transcribe': 0.0045,
  // Deprecated; kept so rows it already wrote stay priced.
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

// --- the allowance -------------------------------------------------------------

export type AllowanceDecision =
  | {
      allowed: true
      /** Null when unlimited (owner, pilot, or a plan without a ceiling). */
      remainingSeconds: number | null
      /** Shown to the user when they are close to the allowance, else null. */
      notice: string | null
    }
  | { allowed: false; reason: 'exhausted' | 'too_long'; message: string; remainingSeconds: number }

const minutes = (seconds: number) => {
  const m = Math.max(0, Math.floor(seconds / 60))
  return m === 1 ? '1 minute' : `${m} minutes`
}

/**
 * Whether a recording of `requestSeconds` may be transcribed, in words a
 * person can act on. Decided before the audio is sent, so a refusal costs
 * nothing and loses nothing: the recording is still on the device, and typed
 * notes always work.
 */
export function transcriptionAllowance(input: {
  limitSeconds: number | null | undefined
  usedSeconds: number
  requestSeconds: number
  plan: 'free' | 'pro' | 'team'
}): AllowanceDecision {
  if (input.limitSeconds === null || input.limitSeconds === undefined) {
    return { allowed: true, remainingSeconds: null, notice: null }
  }
  const limit = input.limitSeconds
  const remaining = Math.max(0, limit - input.usedSeconds)
  const request = Math.max(1, Math.ceil(input.requestSeconds))
  const more =
    input.plan === 'free'
      ? `Pro includes ${minutes(PLANS.pro.quotas.transcription_seconds ?? 0)} a month.`
      : 'Contact support if you need more.'

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: 'exhausted',
      remainingSeconds: 0,
      message: `You've used this month's ${minutes(limit)} of transcription. You can still type or paste what happened, and minutes reset on the 1st. ${more}`,
    }
  }
  if (request > remaining) {
    return {
      allowed: false,
      reason: 'too_long',
      remainingSeconds: remaining,
      message: `This recording is about ${minutes(Math.max(60, request))}, and you have ${minutes(remaining)} of transcription left this month. Keep a shorter part, or type what happened. ${more}`,
    }
  }
  const after = remaining - request
  const near = after <= Math.max(10 * 60, limit * 0.1)
  return {
    allowed: true,
    remainingSeconds: after,
    notice: near ? `${minutes(after)} of transcription left this month.` : null,
  }
}
