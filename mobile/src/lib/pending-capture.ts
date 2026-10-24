import type { Bookmark, CaptureMode } from './capture'

/**
 * A RECORDING THAT CANNOT BE LOST QUIETLY
 * =============================================================================
 * A recording is kept as parts. Every pause, and every ten minutes, closes
 * the file and starts a new one, so each part is a complete recording on its
 * own -- if the app is closed, only the part being recorded at that moment is
 * at risk, never the ones before it.
 *
 * The parts, and the words each one becomes, are written down on the phone
 * (one small JSON file beside the audio) until the conversation has been
 * kept on the server. Then, and only then, the audio is deleted. So:
 *
 *   - a transcription that fails leaves the audio where it was, to try again
 *   - a part already turned into words is never sent twice
 *   - a conversation that fails to save keeps its words, not just its audio
 *   - reopening the app finds an unsent recording and offers it back
 *   - nothing is thrown away except by the person, or after it was kept
 *
 * The audio is the person's own and stays in the app's private Documents
 * folder. It is never kept on Atturel's servers: each part is transcribed
 * and dropped there exactly as a voice note is.
 *
 * Storage and transcription are injected, so these rules are tested without
 * a phone or a network.
 * =============================================================================
 */

export interface CapturePart {
  uri: string
  seconds: number
  /** The words, once transcribed. Empty for a part too short to hold speech. */
  text: string | null
  /** Set by the storage transport: the server-side capture holding this part. */
  captureId?: string | null
}

export interface PendingCapture {
  id: string
  createdAt: string
  mode: CaptureMode
  meetingId: string | null
  personId: string | null
  /** The person confirmed everyone knew. Recorded because it was asked. */
  consent: boolean
  bookmarks: Bookmark[]
  note: string
  parts: CapturePart[]
  /** The file being recorded right now, if any. Only this part can be lost. */
  current: string | null
}

export interface PendingStore {
  load(): PendingCapture | null
  save(pending: PendingCapture): void
  clear(): void
  /** Bytes on disk, or null when the file is gone. */
  sizeOf(uri: string): number | null
  removeAudio(uri: string): void
}

export type TranscribeResult =
  | { ok: true; text: string; captureId?: string | null }
  | { ok: false; error: string; retryable: boolean; captureId?: string | null }

export type PartTranscriber = (part: CapturePart, index: number) => Promise<TranscribeResult>

/** Below this a file holds no speech worth sending; the server refuses it anyway. */
export const MIN_PART_BYTES = 1_000
const RETRIES = 2

export function newPending(input: {
  id: string
  now: Date
  mode: CaptureMode
  meetingId?: string | null
  personId?: string | null
  consent: boolean
}): PendingCapture {
  return {
    id: input.id,
    createdAt: input.now.toISOString(),
    mode: input.mode,
    meetingId: input.meetingId ?? null,
    personId: input.personId ?? null,
    consent: input.consent,
    bookmarks: [],
    note: '',
    parts: [],
    current: null,
  }
}

export function recordedSeconds(pending: PendingCapture | null): number {
  return (pending?.parts ?? []).reduce((n, p) => n + p.seconds, 0)
}

/**
 * Close the part being recorded. A part too small to hold speech is dropped
 * here rather than sent and refused.
 */
export function closePart(
  pending: PendingCapture,
  part: { uri: string; seconds: number },
  store: PendingStore,
): void {
  const size = store.sizeOf(part.uri)
  if (size === null || size < MIN_PART_BYTES || part.seconds < 1) {
    if (size !== null) store.removeAudio(part.uri)
  } else {
    pending.parts.push({ uri: part.uri, seconds: part.seconds, text: null })
  }
  pending.current = null
  store.save(pending)
}

/**
 * Turn every part that has no words yet into words, in order, saving after
 * each one. A retryable failure is tried again twice; the first failure that
 * remains stops the run and is reported. Nothing is deleted here.
 */
export async function transcribeParts(
  pending: PendingCapture,
  transcribe: PartTranscriber,
  store: PendingStore,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Parts may be added while this runs (the conversation is still being
  // recorded); the live length picks them up.
  for (let i = 0; i < pending.parts.length; i++) {
    const part = pending.parts[i]!
    if (part.text !== null) continue
    if (store.sizeOf(part.uri) === null) {
      return { ok: false, error: 'Part of this recording is missing from the phone.' }
    }
    let last: TranscribeResult | null = null
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      last = await transcribe(part, i)
      if (last.captureId !== undefined) part.captureId = last.captureId
      if (last.ok || !last.retryable) break
    }
    if (last && last.ok) {
      part.text = last.text
      store.save(pending)
      continue
    }
    store.save(pending)
    return {
      ok: false,
      error: last && !last.ok ? last.error : 'Part of the recording could not be turned into words.',
    }
  }
  return { ok: true }
}

/** Every part's words, in order. Only meaningful once transcribeParts succeeded. */
export function transcriptOf(pending: PendingCapture): string {
  return pending.parts
    .map((p) => (p.text ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** The conversation was kept, or the person threw it away: remove the audio and the note. */
export function forget(pending: PendingCapture | null, store: PendingStore): void {
  for (const part of pending?.parts ?? []) store.removeAudio(part.uri)
  if (pending?.current) store.removeAudio(pending.current)
  store.clear()
}

/**
 * What reopening the app finds. A recording the app was closed in the middle
 * of keeps every part closed before that moment; the part being recorded is
 * not a complete file and cannot be sent, and the person is told so.
 */
export function recover(store: PendingStore):
  | { kind: 'none' }
  | { kind: 'unsent'; pending: PendingCapture; lostCurrentPart: boolean }
  | { kind: 'lost'; lostCurrentPart: true } {
  const pending = store.load()
  if (!pending) return { kind: 'none' }
  const lostCurrentPart = Boolean(pending.current)
  if (pending.current) {
    store.removeAudio(pending.current)
    pending.current = null
  }
  pending.parts = pending.parts.filter((p) => p.text !== null || store.sizeOf(p.uri) !== null)
  if (pending.parts.length === 0) {
    store.clear()
    return lostCurrentPart ? { kind: 'lost', lostCurrentPart: true } : { kind: 'none' }
  }
  store.save(pending)
  return { kind: 'unsent', pending, lostCurrentPart }
}

/** A store that lives in memory: tests, and the web preview where there is no file system. */
export function memoryStore(sizes: Map<string, number> = new Map()): PendingStore & {
  sizes: Map<string, number>
  saved: PendingCapture | null
} {
  let saved: PendingCapture | null = null
  return {
    sizes,
    get saved() {
      return saved
    },
    load: () => (saved ? (JSON.parse(JSON.stringify(saved)) as PendingCapture) : null),
    save: (p) => {
      saved = JSON.parse(JSON.stringify(p)) as PendingCapture
    },
    clear: () => {
      saved = null
    },
    sizeOf: (uri) => sizes.get(uri) ?? null,
    removeAudio: (uri) => {
      sizes.delete(uri)
    },
  }
}
