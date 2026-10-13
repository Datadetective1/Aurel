import {
  MAX_SEGMENTS,
  ORPHAN_AFTER_MS,
  SEGMENT_MAX_BYTES,
  isUuid,
  ownsSegmentPath,
  segmentPath,
} from './limits'

/**
 * SEGMENTED CAPTURE: UPLOAD, TRANSCRIBE, DELETE
 * =============================================================================
 *
 *   phone ──(signed URL, own folder only)──▶ private bucket
 *   phone ──(segment id)──▶ server: owner? ─▶ download ─▶ transcribe ─▶ DELETE
 *   phone ◀──────────────── words ──────────────────────┘
 *
 * The object lives for as long as one transcription takes. It is deleted:
 *   - right after a successful transcription
 *   - right after a failure that retrying cannot fix
 *   - after the third failed attempt of any kind
 *   - when the user discards the recording
 *   - by the orphan sweep, an hour after upload at the latest (a segment the
 *     phone uploaded and then never asked to transcribe)
 *   - with the account
 *
 * A transient failure (provider busy or unreachable) keeps the object for a
 * retry, so a long meeting is not lost to one bad minute -- bounded by the
 * same sweep.
 *
 * AUTHORIZATION: every call names the signed-in user. A segment belonging to
 * anyone else is reported as not found -- not "forbidden" -- so ids cannot be
 * probed. Paths are built here, never accepted from the client, and checked
 * against the owner again before any storage call.
 * =============================================================================
 */

export const ALLOWED_EXTENSIONS = ['m4a', 'mp4', 'webm', 'mp3', 'wav'] as const
export type SegmentExtension = (typeof ALLOWED_EXTENSIONS)[number]

export const CONTENT_TYPE: Record<SegmentExtension, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

export interface SegmentRow {
  id: string
  userId: string
  captureId: string
  index: number
  path: string
  extension: SegmentExtension
  declaredBytes: number
  declaredSeconds: number | null
  status: 'pending' | 'transcribed' | 'failed' | 'deleted'
  attempts: number
  createdAt: string
  objectDeletedAt: string | null
}

export interface SegmentStore {
  insert(
    row: Omit<SegmentRow, 'id' | 'status' | 'attempts' | 'createdAt' | 'objectDeletedAt'>,
  ): Promise<{ ok: true; id: string } | { ok: false; reason: 'duplicate' }>
  get(id: string): Promise<SegmentRow | null>
  update(
    id: string,
    patch: Partial<{
      status: SegmentRow['status']
      attempts: number
      errorCode: string | null
      measuredSeconds: number
      transcribedAt: string
      objectDeletedAt: string
    }>,
  ): Promise<void>
  listForCapture(userId: string, captureId: string): Promise<SegmentRow[]>
  listOrphans(olderThan: string, limit: number): Promise<SegmentRow[]>
}

export interface SegmentStorage {
  signedUploadUrl(path: string): Promise<{ signedUrl: string; token: string }>
  download(path: string): Promise<Blob | null>
  remove(paths: string[]): Promise<void>
}

export type TranscribeFn = (input: {
  audio: Blob
  extension: string
  declaredSeconds: number
}) => Promise<{ ok: true; text: string; seconds: number } | { ok: false; reason: string }>

export interface SegmentDeps {
  store: SegmentStore
  storage: SegmentStorage
  now?: () => Date
  newId?: () => string
}

const PERMANENT_FAILURES = new Set([
  'unsupported_media',
  'too_large',
  'empty_result',
  'not_configured',
  'unauthorized',
])
const MAX_ATTEMPTS = 3

// --- 1. ask for an upload ------------------------------------------------------

export type UploadRequestResult =
  | {
      ok: true
      uploadId: string
      captureId: string
      path: string
      signedUrl: string
      token: string
      contentType: string
    }
  | { ok: false; status: 400 | 409 | 413; error: string }

export async function requestSegmentUpload(
  userId: string,
  input: {
    captureId?: unknown
    index: unknown
    extension: unknown
    bytes: unknown
    declaredSeconds?: unknown
  },
  deps: SegmentDeps,
): Promise<UploadRequestResult> {
  const index = Number(input.index)
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SEGMENTS) {
    return { ok: false, status: 400, error: 'That recording is longer than can be kept in one go.' }
  }
  const extension = String(input.extension ?? '').toLowerCase() as SegmentExtension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { ok: false, status: 400, error: "That audio format isn't supported." }
  }
  const bytes = Number(input.bytes)
  if (!Number.isFinite(bytes) || bytes < 1_000) {
    return { ok: false, status: 400, error: 'That recording was empty.' }
  }
  if (bytes > SEGMENT_MAX_BYTES) {
    return { ok: false, status: 413, error: 'That part of the recording is too large to upload.' }
  }

  const captureId =
    input.captureId === undefined || input.captureId === null
      ? (deps.newId ?? (() => crypto.randomUUID()))()
      : input.captureId
  if (!isUuid(captureId))
    return { ok: false, status: 400, error: 'That recording could not be found.' }

  const path = segmentPath(userId, captureId, index, extension)
  const declared = Number(input.declaredSeconds)
  const inserted = await deps.store.insert({
    userId,
    captureId,
    index,
    path,
    extension,
    declaredBytes: Math.round(bytes),
    declaredSeconds: Number.isFinite(declared) && declared > 0 ? Math.round(declared) : null,
  })
  if (!inserted.ok) return { ok: false, status: 409, error: 'That part was already uploaded.' }

  const signed = await deps.storage.signedUploadUrl(path)
  return {
    ok: true,
    uploadId: inserted.id,
    captureId,
    path,
    signedUrl: signed.signedUrl,
    token: signed.token,
    contentType: CONTENT_TYPE[extension],
  }
}

// --- 2. transcribe one segment -------------------------------------------------

export type SegmentTranscription =
  | { ok: true; text: string; seconds: number }
  | { ok: false; status: 404 | 409 | 413 | 422 | 502; error: string; retryable: boolean }

export async function transcribeSegment(
  userId: string,
  uploadId: unknown,
  deps: SegmentDeps & { transcribe: TranscribeFn; failureMessage: (reason: string) => string },
): Promise<SegmentTranscription> {
  const notFound = {
    ok: false as const,
    status: 404 as const,
    error: 'That recording could not be found.',
    retryable: false,
  }
  if (!isUuid(uploadId)) return notFound

  const row = await deps.store.get(uploadId)
  // Someone else's segment is indistinguishable from no segment.
  if (!row || row.userId !== userId || !ownsSegmentPath(userId, row.path)) return notFound
  if (row.status === 'transcribed' || row.objectDeletedAt) {
    return { ok: false, status: 409, error: 'That part was already transcribed.', retryable: false }
  }

  const now = () => (deps.now ?? (() => new Date()))().toISOString()
  const attempts = row.attempts + 1
  const removeObject = async () => {
    await deps.storage.remove([row.path])
    await deps.store.update(row.id, { objectDeletedAt: now() })
  }

  const audio = await deps.storage.download(row.path)
  if (!audio) {
    await deps.store.update(row.id, { status: 'failed', attempts, errorCode: 'missing_object' })
    return {
      ok: false,
      status: 422,
      error: 'That part of the recording did not arrive. Try again.',
      retryable: false,
    }
  }
  if (audio.size > SEGMENT_MAX_BYTES) {
    await removeObject()
    await deps.store.update(row.id, { status: 'failed', attempts, errorCode: 'too_large' })
    return {
      ok: false,
      status: 413,
      error: 'That part of the recording is too large.',
      retryable: false,
    }
  }

  let result: Awaited<ReturnType<TranscribeFn>>
  try {
    result = await deps.transcribe({
      audio,
      extension: row.extension,
      declaredSeconds: row.declaredSeconds ?? 0,
    })
  } catch {
    result = { ok: false, reason: 'unavailable' }
  }

  if (result.ok) {
    await removeObject()
    await deps.store.update(row.id, {
      status: 'transcribed',
      attempts,
      measuredSeconds: result.seconds,
      transcribedAt: now(),
      errorCode: null,
    })
    return { ok: true, text: result.text, seconds: result.seconds }
  }

  const permanent = PERMANENT_FAILURES.has(result.reason) || attempts >= MAX_ATTEMPTS
  if (permanent) await removeObject()
  await deps.store.update(row.id, { status: 'failed', attempts, errorCode: result.reason })
  return {
    ok: false,
    status: 502,
    error: deps.failureMessage(result.reason),
    retryable: !permanent,
  }
}

// --- 3. discard a recording ----------------------------------------------------

export async function discardCapture(
  userId: string,
  captureId: unknown,
  deps: SegmentDeps,
): Promise<number> {
  if (!isUuid(captureId)) return 0
  const rows = (await deps.store.listForCapture(userId, captureId)).filter(
    (r) => r.userId === userId && !r.objectDeletedAt && ownsSegmentPath(userId, r.path),
  )
  if (rows.length === 0) return 0
  await deps.storage.remove(rows.map((r) => r.path))
  const at = (deps.now ?? (() => new Date()))().toISOString()
  for (const row of rows) {
    await deps.store.update(row.id, {
      objectDeletedAt: at,
      ...(row.status === 'pending' ? { status: 'deleted' as const } : {}),
    })
  }
  return rows.length
}

// --- 4. the orphan sweep -------------------------------------------------------

export async function sweepOrphans(deps: SegmentDeps, limit = 500): Promise<number> {
  const now = (deps.now ?? (() => new Date()))()
  const cutoff = new Date(now.getTime() - ORPHAN_AFTER_MS).toISOString()
  const rows = await deps.store.listOrphans(cutoff, limit)
  if (rows.length === 0) return 0
  await deps.storage.remove(rows.map((r) => r.path))
  for (const row of rows) {
    await deps.store.update(row.id, {
      objectDeletedAt: now.toISOString(),
      ...(row.status === 'pending' ? { status: 'deleted' as const } : {}),
    })
  }
  return rows.length
}
