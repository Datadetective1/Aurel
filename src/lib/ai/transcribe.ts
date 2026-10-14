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
 * The supported file-transcription model. There is deliberately no fallback:
 * the previous generation (`gpt-4o-transcribe`) is deprecated and scheduled
 * for removal, and silently switching to it would hide an outage behind a
 * model that is about to stop existing. A failure is retried when it is
 * transient, and otherwise reported.
 */
export const TRANSCRIPTION_MODEL = 'gpt-transcribe'

/** Per attempt. Three attempts stay inside the segment route's two minutes. */
const TIMEOUT_MS = 30_000

/** Retries after the first attempt, for transient failures only. */
const RETRIES = 2
const BACKOFF_MS = [1_000, 3_000]
/** Never wait longer than this for a provider-suggested Retry-After. */
const MAX_RETRY_AFTER_MS = 5_000

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

export interface TranscribeDeps {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export async function transcribeAudio(
  input: TranscribeInput,
  deps: TranscribeDeps = {},
): Promise<TranscribeResult> {
  const started = Date.now()
  const doFetch = deps.fetch ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  if (!serverEnv.OPENAI_API_KEY) {
    return { ok: false, reason: 'not_configured', latencyMs: 0 }
  }

  type Attempt = TranscribeResult & { retryAfterMs?: number; transient?: boolean }

  const attempt = async (): Promise<Attempt> => {
    const form = new FormData()
    // A name we construct, never one the browser sent. The extension is the
    // only part the provider needs and the only part we accept.
    form.set('file', input.audio, `debrief.${input.extension}`)
    form.set('model', TRANSCRIPTION_MODEL)
    form.set('response_format', 'json')
    if (input.keywords?.length) {
      form.set('keywords', input.keywords.slice(0, 24).join(', '))
    }

    let response: Response
    try {
      response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // Timeout and network failure are the same thing to a caller: no words.
      return { ok: false, reason: 'unavailable', latencyMs: Date.now() - started, transient: true }
    }

    if (!response.ok) {
      // Read and discard, never log: a provider error body can echo the
      // request back, and the request is somebody's audio.
      await response.text().catch(() => '')

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

      // 404 means the model itself cannot be reached. Reported loudly and
      // never papered over with another model.
      logger.warn(
        response.status === 404 ? 'transcribe.model_unavailable' : 'transcribe.provider_error',
        {
          model: TRANSCRIPTION_MODEL,
          status: response.status,
          reason,
        },
      )
      const retryAfter = Number(response.headers.get('retry-after'))
      return {
        ok: false,
        reason,
        latencyMs: Date.now() - started,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        // Busy or briefly down. A missing model (404) is not transient.
        transient: response.status === 429 || response.status >= 500,
      }
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
      model: TRANSCRIPTION_MODEL,
      latencyMs: Date.now() - started,
      inputTokens: payload?.usage?.input_tokens ?? null,
      outputTokens: payload?.usage?.output_tokens ?? null,
    }
  }

  for (let i = 0; ; i++) {
    const result = await attempt()
    if (result.ok || !result.transient || i >= RETRIES) {
      const { retryAfterMs: _wait, transient: _transient, ...final } = result
      if (!final.ok && i > 0)
        logger.warn('transcribe.gave_up', { attempts: i + 1, reason: final.reason })
      return final as TranscribeResult
    }
    const wait = Math.min(result.retryAfterMs ?? BACKOFF_MS[i] ?? 3_000, MAX_RETRY_AFTER_MS)
    await sleep(wait)
  }
}
