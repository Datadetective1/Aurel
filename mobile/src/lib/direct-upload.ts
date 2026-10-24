import type { CapturePart, PartTranscriber } from './pending-capture'

/**
 * ONE PART, ONE REQUEST
 * =============================================================================
 * The single-upload transport: a finished part goes as the `audio` field of a
 * multipart request to /api/conversations/transcribe, which transcribes it and
 * drops the audio -- the same route and the same metering as a voice note.
 *
 * The part is attached as expo-file-system's File. Since SDK 57 the app's
 * global fetch is Expo's, which encodes a File, a Blob or a string, and throws
 * "Unsupported FormDataPart implementation" for React Native's own
 * `{ uri, name, type }` shape. The first TestFlight builds attached that
 * shape, so every recording failed on the phone before a byte was sent, and a
 * catch-all called it "offline".
 *
 * Failures are told apart by where they happen, never by the words of a
 * native error (those come in the phone's language):
 *   - the phone could not read or encode the file  -> not retried
 *   - no answer within the time limit              -> retried
 *   - the request never got an answer              -> retried
 *   - an answer that says no                       -> the server's sentence
 * Whatever happens, the audio stays on the phone (pending-capture). Each
 * failure carries the underlying error as `detail`, for a tester to pass on.
 * The sentences say what went wrong; the screen adds, once, that the
 * recording is safe.
 * =============================================================================
 */

export interface DirectUploadDeps {
  apiUrl: string
  token(): Promise<string | null>
  /** The part's audio in a form fetch can encode: expo-file-system's File on the phone. */
  openFile(uri: string): Blob
  fetch(url: string, init: RequestInit): Promise<Response>
  /** Per attempt. Defaults to UPLOAD_TIMEOUT_MS. */
  timeoutMs?: number
}

/** Room to upload a ten-minute part on a slow connection and transcribe it. */
export const UPLOAD_TIMEOUT_MS = 4 * 60_000

export const UPLOAD_ERRORS = {
  signIn: 'Sign in again to send this recording.',
  unreadable: 'The phone could not prepare this recording for sending.',
  timeout: 'Atturel took too long to answer.',
  unreachable: 'Atturel could not be reached. Check the connection.',
  interrupted: 'The answer from Atturel was cut off.',
  refused: 'That part of the recording could not be turned into words.',
} as const

/** The request body: the audio file, its length, and who was there (spelling hints only). */
export function audioForm(file: Blob, part: CapturePart, participantIds: string[] = []): FormData {
  const form = new FormData()
  form.append('audio', file)
  form.append('durationSeconds', String(Math.round(part.seconds)))
  for (const id of participantIds) form.append('participant', id)
  return form
}

/**
 * The request was sent and no response came back: Expo's fetch reports that
 * as "fetch failed: …" (React Native's as "Network request failed"). Any other
 * error was thrown before sending, while reading or encoding the file.
 */
export function isTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.startsWith('fetch failed') || message === 'Network request failed'
}

export function detailOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.slice(0, 300)
}

export function directTranscriber(
  deps: DirectUploadDeps,
  participantIds: string[] = [],
): PartTranscriber {
  return async (part) => {
    const access = await deps.token()
    if (!access) return { ok: false, error: UPLOAD_ERRORS.signIn, retryable: false }

    let form: FormData
    try {
      form = audioForm(deps.openFile(part.uri), part, participantIds)
    } catch (error) {
      return {
        ok: false,
        error: UPLOAD_ERRORS.unreadable,
        retryable: false,
        detail: detailOf(error),
      }
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, deps.timeoutMs ?? UPLOAD_TIMEOUT_MS)

    let response: Response
    try {
      response = await deps.fetch(`${deps.apiUrl}/api/conversations/transcribe`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${access}` },
        body: form,
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      if (timedOut)
        return { ok: false, error: UPLOAD_ERRORS.timeout, retryable: true, detail: detailOf(error) }
      if (isTransportError(error)) {
        return {
          ok: false,
          error: UPLOAD_ERRORS.unreachable,
          retryable: true,
          detail: detailOf(error),
        }
      }
      return {
        ok: false,
        error: UPLOAD_ERRORS.unreadable,
        retryable: false,
        detail: detailOf(error),
      }
    }

    let body: { text?: string; error?: string } | null = null
    let unreadableBody: unknown = null
    try {
      body = (await response.json()) as { text?: string; error?: string } | null
    } catch (error) {
      unreadableBody = error
    } finally {
      clearTimeout(timer)
    }

    if (response.ok && typeof body?.text === 'string') return { ok: true, text: body.text }
    if (response.status === 401) return { ok: false, error: UPLOAD_ERRORS.signIn, retryable: false }
    if (response.ok) {
      // A success whose body never arrived whole: the words exist on the server
      // but not here, so ask again.
      return {
        ok: false,
        error: timedOut ? UPLOAD_ERRORS.timeout : UPLOAD_ERRORS.interrupted,
        retryable: true,
        detail: unreadableBody ? detailOf(unreadableBody) : `HTTP ${response.status}`,
      }
    }
    return {
      ok: false,
      // 504: the platform gave up waiting for the transcription.
      error:
        body?.error ?? (response.status === 504 ? UPLOAD_ERRORS.timeout : UPLOAD_ERRORS.refused),
      retryable: response.status >= 500 || response.status === 429,
      detail: `HTTP ${response.status}`,
    }
  }
}
