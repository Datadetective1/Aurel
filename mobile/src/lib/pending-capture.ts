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
 *   - reopening the app finds an unsent recording and offers it back, even
 *     after an update moved the app's folder (the store finds the file again)
 *   - a part that cannot be found is reported, never dropped in silence
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
  /**
   * Set when the person discards it, or once it was kept. Work still in
   * flight (a part being transcribed) must not write it back afterwards.
   */
  done?: boolean
}

export interface PendingStore {
  load(): PendingCapture | null
  save(pending: PendingCapture): void
  clear(): void
  /** Bytes on disk, or null when the file is gone. */
  sizeOf(uri: string): number | null
  removeAudio(uri: string): void
  /**
   * Where a file written down earlier is now, or null when it is nowhere.
   * iOS moves an app's folder when the app is updated, so a path saved by
   * the previous version can point at a folder that no longer exists.
   */
  locate(uri: string): string | null
}

export type TranscribeResult =
  | { ok: true; text: string; captureId?: string | null }
  | {
      ok: false
      error: string
      retryable: boolean
      captureId?: string | null
      /** The underlying error, for a tester to pass on. Not a sentence for the person. */
      detail?: string
    }

export type TranscribePartsResult =
  | { ok: true }
  | {
      ok: false
      error: string
      detail?: string
      /** A part's audio is no longer on the phone, so trying again cannot help. */
      missing?: boolean
    }

export type PartTranscriber = (part: CapturePart, index: number) => Promise<TranscribeResult>

/** Below this a file holds no speech worth sending; the server refuses it anyway. */
export const MIN_PART_BYTES = 1_000
/** After the first attempt fails in a way worth retrying, wait this long before each next one. */
export const RETRY_DELAYS_MS = [2_000, 6_000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
  if (pending.done) {
    store.removeAudio(part.uri)
    return
  }
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
 * each one. A retryable failure is tried again after a pause (twice); the
 * first failure that remains stops the run and is reported. Nothing is
 * deleted here.
 */
export async function transcribeParts(
  pending: PendingCapture,
  transcribe: PartTranscriber,
  store: PendingStore,
  options: { wait?: (ms: number) => Promise<void> } = {},
): Promise<TranscribePartsResult> {
  const wait = options.wait ?? sleep
  const discarded = { ok: false as const, error: 'This recording was discarded.' }
  // Parts may be added while this runs (the conversation is still being
  // recorded); the live length picks them up.
  for (let i = 0; i < pending.parts.length; i++) {
    if (pending.done) return discarded
    const part = pending.parts[i]!
    if (part.text !== null) continue
    if (store.sizeOf(part.uri) === null) {
      return { ok: false, error: 'Part of this recording is missing from the phone.', missing: true }
    }
    let last: TranscribeResult | null = null
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await wait(RETRY_DELAYS_MS[attempt - 1]!)
        if (pending.done) return discarded
      }
      last = await transcribe(part, i)
      if (last.captureId !== undefined) part.captureId = last.captureId
      if (last.ok || !last.retryable) break
    }
    // Discarded (or kept) while this part was out: write nothing back.
    if (pending.done) return discarded
    if (last && last.ok) {
      part.text = last.text
      store.save(pending)
      continue
    }
    store.save(pending)
    if (last && !last.ok) {
      return last.detail ? { ok: false, error: last.error, detail: last.detail } : { ok: false, error: last.error }
    }
    return { ok: false, error: 'Part of the recording could not be turned into words.' }
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
  if (pending) pending.done = true
  for (const part of pending?.parts ?? []) store.removeAudio(part.uri)
  if (pending?.current) store.removeAudio(pending.current)
  store.clear()
}

/**
 * What reopening the app finds. A recording the app was closed in the middle
 * of keeps every part closed before that moment; the part being recorded is
 * not a complete file and cannot be sent, and the person is told so. Parts
 * are looked for where an update may have moved them; a part found nowhere
 * is counted and reported, never dropped without a word.
 */
export function recover(store: PendingStore):
  | { kind: 'none' }
  | { kind: 'unsent'; pending: PendingCapture; lostCurrentPart: boolean; missingParts: number }
  | { kind: 'lost'; lostCurrentPart: boolean; missingParts: number } {
  const pending = store.load()
  if (!pending) return { kind: 'none' }
  const lostCurrentPart = Boolean(pending.current)
  if (pending.current) {
    const current = store.locate(pending.current)
    if (current) store.removeAudio(current)
    pending.current = null
  }
  let missingParts = 0
  pending.parts = pending.parts.filter((p) => {
    const found = store.locate(p.uri)
    if (found) {
      p.uri = found
      return true
    }
    // Its words were kept already: the audio is no longer needed.
    if (p.text !== null) return true
    missingParts += 1
    return false
  })
  if (pending.parts.length === 0) {
    store.clear()
    return lostCurrentPart || missingParts > 0 ? { kind: 'lost', lostCurrentPart, missingParts } : { kind: 'none' }
  }
  store.save(pending)
  return { kind: 'unsent', pending, lostCurrentPart, missingParts }
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
    locate: (uri) => (sizes.has(uri) ? uri : null),
  }
}
