import 'server-only'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * SPEECH TO TEXT
 * =============================================================================
 * One job: turn an audio blob into the words that were said.
 *
 * It does not summarise, does not extract commitments, does not propose
 * observations and does not touch relationship memory. Everything downstream of
 * the words is the existing debrief pipeline's work, and keeping this layer
 * dumb is what stops a second, parallel analysis path growing beside it.
 *
 * Called with the REST endpoint directly rather than through the AI SDK. The
 * installed @ai-sdk/openai predates `gpt-transcribe` -- its typed model list
 * stops at the gpt-4o-transcribe family -- and its provider options schema is
 * written against those models. A plain multipart POST takes the current model
 * and its parameters without arguing, and matches how this codebase already
 * calls Exa and Microsoft Graph.
 *
 * NOTHING HERE LOGS AUDIO OR TRANSCRIPT. Duration, byte size, model, latency
 * and an error category are the whole of what leaves this file.
 * =============================================================================
 */

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

/**
 * Current recommended model for transcribing speech in its original language.
 * `gpt-4o-transcribe` is the fallback: same API shape, previous generation,
 * used only if the account cannot reach the newer model.
 */
const PRIMARY_MODEL = 'gpt-transcribe'
const FALLBACK_MODEL = 'gpt-4o-transcribe'

const TIMEOUT_MS = 60_000

export type TranscribeFailure =
  | 'not_configured'
  | 'unauthorized'
  | 'rate_limited'
  | 'too_large'
  | 'unsupported_media'
  | 'empty_result'
  | 'unavailable'

export type TranscribeResult =
  | {
      ok: true
      text: string
      model: string
      latencyMs: number
      inputTokens: number | null
      outputTokens: number | null
    }
  | { ok: false; reason: TranscribeFailure; latencyMs: number }

interface TranscribeInput {
  audio: Blob
  /** Extension only. Never the browser-supplied filename. */
  extension: string
  /**
   * Names likely to appear, so they are spelled the way the record spells
   * them. A hint, not content: the model still transcribes only what was said,
   * and an absent name simply stays absent.
   */
  keywords?: string[]
}

export async function transcribeAudio(input: TranscribeInput): Promise<TranscribeResult> {
  const started = Date.now()

  if (!serverEnv.OPENAI_API_KEY) {
    return { ok: false, reason: 'not_configured', latencyMs: 0 }
  }

  const attempt = async (model: string): Promise<TranscribeResult | 'retry_other_model'> => {
    const form = new FormData()
    // A name we construct, never one the browser sent. The extension is the
    // only part the provider needs and the only part we accept.
    form.set('file', input.audio, `debrief.${input.extension}`)
    form.set('model', model)
    form.set('response_format', 'json')
    if (input.keywords?.length) {
      // Supported by gpt-transcribe; ignored by older models rather than
      // rejected, which is why it is safe to send on both paths.
      form.set('keywords', input.keywords.slice(0, 24).join(', '))
    }

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // Timeout and network failure are the same thing to a caller: no words.
      return { ok: false, reason: 'unavailable', latencyMs: Date.now() - started }
    }

    if (!response.ok) {
      // Read as text and never log it -- a provider error body can echo the
      // request back, and the request is somebody's audio.
      const body = await response.text().catch(() => '')

      if (response.status === 400 && /model/i.test(body) && model === PRIMARY_MODEL) {
        return 'retry_other_model'
      }
      if (response.status === 404 && model === PRIMARY_MODEL) return 'retry_other_model'

      const reason: TranscribeFailure =
        response.status === 401 || response.status === 403
          ? 'unauthorized'
          : response.status === 429
            ? 'rate_limited'
            : response.status === 413
              ? 'too_large'
              : response.status === 415 || response.status === 400
                ? 'unsupported_media'
                : 'unavailable'

      logger.warn('transcribe.provider_error', {
        model,
        status: response.status,
        reason,
      })
      return { ok: false, reason, latencyMs: Date.now() - started }
    }

    const payload = (await response.json().catch(() => null)) as {
      text?: unknown
      usage?: { input_tokens?: number; output_tokens?: number }
    } | null

    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (text === '') {
      // Silence, or a recording of nothing. Not an error at the provider, but
      // not a success the user should be told about either.
      return { ok: false, reason: 'empty_result', latencyMs: Date.now() - started }
    }

    return {
      ok: true,
      text,
      model,
      latencyMs: Date.now() - started,
      inputTokens: payload?.usage?.input_tokens ?? null,
      outputTokens: payload?.usage?.output_tokens ?? null,
    }
  }

  const first = await attempt(PRIMARY_MODEL)
  if (first !== 'retry_other_model') return first

  logger.warn('transcribe.model_fallback', { from: PRIMARY_MODEL, to: FALLBACK_MODEL })
  const second = await attempt(FALLBACK_MODEL)
  return second === 'retry_other_model'
    ? { ok: false, reason: 'unavailable', latencyMs: Date.now() - started }
    : second
}
