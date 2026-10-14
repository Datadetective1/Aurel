/**
 * CAPTURE LIMITS, IN ONE PLACE
 * =============================================================================
 * Two ways audio reaches transcription, with different ceilings:
 *
 *   SINGLE UPLOAD   the audio is the request body of one function call. The
 *                   platform caps a request body at 4.5 MB; at the 32 kbps
 *                   speech encoding the apps use (~4 KB a second) that is
 *                   about seventeen minutes.
 *
 *   SEGMENTED       the app records in ten-minute segments and uploads each
 *                   one straight to private, temporary storage. Each segment
 *                   is transcribed on its own and deleted at once, so no
 *                   request carries more than one segment and no provider
 *                   call more than ten minutes of audio. Ten minutes also
 *                   stays well inside what a transcription model returns in
 *                   one response, which a single long file does not.
 *
 * The segmented ceiling is a product decision, not a technical infinity: two
 * hours. Nothing here promises unlimited recording.
 * =============================================================================
 */

/** Bytes per second at the apps' speech encoding (32 kbps mono AAC/Opus). */
export const SPEECH_BYTES_PER_SECOND = 4_000

/** The platform's request-body ceiling, with headroom for the multipart envelope. */
export const SINGLE_UPLOAD_MAX_BYTES = 4_400_000

/** Seventeen minutes: what fits under the single-upload ceiling, rounded down. */
export const SINGLE_UPLOAD_MAX_SECONDS = 17 * 60

/** One segment: ten minutes of speech. */
export const SEGMENT_SECONDS = 10 * 60

/**
 * A segment file may not exceed this. Ten minutes at the speech encoding is
 * about 2.4 MB; the ceiling leaves room for a device that encodes richer
 * audio, and stays under the provider's 25 MB per-request limit.
 */
export const SEGMENT_MAX_BYTES = 20 * 1024 * 1024

/** Two hours of segments. */
export const MAX_SEGMENTS = 12
export const SEGMENTED_MAX_SECONDS = SEGMENT_SECONDS * MAX_SEGMENTS

/** A temporary object older than this is an orphan and is removed. */
export const ORPHAN_AFTER_MS = 60 * 60 * 1000

export interface CaptureLimitsView {
  maxSeconds: number
  segmentSeconds: number | null
}

/** What the app should allow, given whether segmented storage is enabled. */
export function captureLimits(storageEnabled: boolean): CaptureLimitsView {
  return storageEnabled
    ? { maxSeconds: SEGMENTED_MAX_SECONDS, segmentSeconds: SEGMENT_SECONDS }
    : { maxSeconds: SINGLE_UPLOAD_MAX_SECONDS, segmentSeconds: null }
}

/**
 * The storage path for one segment. The first folder is the owner's user id.
 * No client can touch the bucket at all (migration 0022 grants nothing to
 * anon or authenticated); the server builds every path here and checks it
 * against the signed-in user with `ownsSegmentPath` before any storage call.
 */
export function segmentPath(
  userId: string,
  captureId: string,
  index: number,
  extension: string,
): string {
  return `${userId}/${captureId}/${String(index).padStart(3, '0')}.${extension}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Whether a path is a well-formed segment path owned by this user. */
export function ownsSegmentPath(userId: string, path: string): boolean {
  const parts = path.split('/')
  return (
    parts.length === 3 &&
    parts[0] === userId &&
    UUID.test(parts[1] ?? '') &&
    /^\d{3}\.(m4a|mp4|webm|mp3|wav)$/.test(parts[2] ?? '')
  )
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
