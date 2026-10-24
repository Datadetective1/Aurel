import type { CapturePart, PartTranscriber, PendingCapture } from './pending-capture'

/**
 * PARTS THROUGH PRIVATE, TEMPORARY STORAGE
 * =============================================================================
 * When the server offers it (`partTransport: 'storage'`, migration 0022), a
 * finished part is uploaded straight to a signed URL in the user's own
 * folder of a private bucket, transcribed there, and deleted by the server
 * the moment it succeeds or gives up. Otherwise each part goes as the body
 * of one request to the single-upload route (lib/api `directTranscriber`).
 *
 * Each part is its own server-side capture. A part that failed can then be
 * sent again from the copy on the phone without colliding with the one that
 * failed -- the server keys an upload by capture and index -- and the orphan
 * sweep removes anything a failed attempt left behind within the hour.
 *
 * The dependencies are injected, so the rules here are tested without a
 * network.
 * =============================================================================
 */

export interface SegmentUploadTicket {
  uploadId: string
  captureId: string
  path: string
  token: string
  contentType: string
}

export interface SegmentedDeps {
  requestUpload(input: {
    captureId: string | null
    index: number
    extension: string
    bytes: number
    declaredSeconds: number
  }): Promise<SegmentUploadTicket>
  readFile(uri: string): Promise<ArrayBuffer>
  putObject(ticket: SegmentUploadTicket, body: ArrayBuffer): Promise<void>
  transcribe(uploadId: string): Promise<
    { ok: true; text: string } | { ok: false; error: string; retryable: boolean }
  >
  discard(captureId: string): Promise<void>
}

/** One part: upload, transcribe, words back. The server deletes the audio. */
export function storageTranscriber(deps: SegmentedDeps): PartTranscriber {
  return async (part: CapturePart) => {
    let captureId: string | null = null
    try {
      const extension = (part.uri.split('.').pop() ?? 'm4a').toLowerCase()
      const body = await deps.readFile(part.uri)
      const ticket = await deps.requestUpload({
        captureId: null,
        index: 0,
        extension,
        bytes: body.byteLength,
        declaredSeconds: Math.round(part.seconds),
      })
      captureId = ticket.captureId
      await deps.putObject(ticket, body)
      const result = await deps.transcribe(ticket.uploadId)
      return result.ok
        ? { ok: true, text: result.text, captureId }
        : { ok: false, error: result.error, retryable: result.retryable, captureId }
    } catch (error) {
      return {
        ok: false,
        // An upload that never reached the server is worth trying again.
        error:
          error instanceof Error && error.message
            ? error.message
            : 'That part of the recording could not be sent.',
        retryable: true,
        captureId,
      }
    }
  }
}

/** Throw away whatever the server still holds for parts that never became words. */
export async function discardRemote(deps: SegmentedDeps, pending: PendingCapture | null): Promise<void> {
  const ids = new Set(
    (pending?.parts ?? []).filter((p) => p.text === null && p.captureId).map((p) => p.captureId!),
  )
  await Promise.all([...ids].map((id) => deps.discard(id).catch(() => {})))
}
