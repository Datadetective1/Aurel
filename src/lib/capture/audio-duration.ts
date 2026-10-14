import { SPEECH_BYTES_PER_SECOND } from './limits'

/**
 * HOW LONG A RECORDING IS, READ FROM THE FILE
 * =============================================================================
 * Transcription is billed by the minute, so the meter needs a duration it can
 * trust more than a number the client sends. MP4-family files (the iPhone's
 * .m4a, and .mp4) state their own duration in the `mvhd` box; this reads it
 * without decoding any audio.
 *
 * Other containers (WebM from a browser, MP3, WAV) return null, and the caller
 * falls back to the client's figure, bounded by what the byte size allows.
 * =============================================================================
 */

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function readUint64(view: DataView, offset: number): number {
  const high = view.getUint32(offset, false)
  const low = view.getUint32(offset + 4, false)
  return high * 2 ** 32 + low
}

function boxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

/** Walk sibling boxes in [start, end), returning the first of `type`. */
function findBox(
  view: DataView,
  start: number,
  end: number,
  type: string,
): [number, number] | null {
  let offset = start
  while (offset + 8 <= end) {
    let size = readUint32(view, offset)
    const name = boxType(view, offset + 4)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) return null
      size = readUint64(view, offset + 8)
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) return null
    if (name === type) return [offset + header, offset + size]
    offset += size
  }
  return null
}

/** Duration in seconds from an MP4/M4A file, or null when it cannot be read. */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const moov = findBox(view, 0, bytes.byteLength, 'moov')
  if (!moov) return null
  const mvhd = findBox(view, moov[0], moov[1], 'mvhd')
  if (!mvhd) return null

  const [body, bodyEnd] = mvhd
  if (body + 4 > bodyEnd) return null
  const version = view.getUint8(body)
  let timescale: number
  let duration: number
  if (version === 1) {
    if (body + 32 > bodyEnd) return null
    timescale = readUint32(view, body + 20)
    duration = readUint64(view, body + 24)
  } else {
    if (body + 20 > bodyEnd) return null
    timescale = readUint32(view, body + 12)
    duration = readUint32(view, body + 16)
  }
  if (!timescale || !Number.isFinite(duration)) return null
  const seconds = duration / timescale
  return seconds > 0 && seconds < 24 * 3600 ? seconds : null
}

/**
 * The slowest encoding a speech recording plausibly uses: 8 kbps. A file of
 * N bytes cannot honestly hold more than N/1000 seconds of it, so a client
 * claiming longer is capped there.
 */
const MIN_BYTES_PER_SECOND = 1_000

export interface MeasuredDuration {
  seconds: number
  source: 'container' | 'declared' | 'size_bound' | 'size_estimate'
}

/** Billable seconds for one transcription: whole seconds, at least one. */
export function measureDuration(input: {
  bytes: Uint8Array | null
  extension: string
  declaredSeconds: number
  byteLength: number
}): MeasuredDuration {
  if (input.bytes && ['m4a', 'mp4'].includes(input.extension)) {
    const fromFile = mp4DurationSeconds(input.bytes)
    if (fromFile !== null) return { seconds: Math.max(1, Math.ceil(fromFile)), source: 'container' }
  }
  const bound = Math.ceil(input.byteLength / MIN_BYTES_PER_SECOND)
  const declared = Number.isFinite(input.declaredSeconds) ? Math.ceil(input.declaredSeconds) : 0
  if (declared > 0 && declared <= bound)
    return { seconds: Math.max(1, declared), source: 'declared' }
  if (declared > bound) return { seconds: Math.max(1, bound), source: 'size_bound' }
  // Nothing declared: estimate at the apps' own speech encoding.
  return {
    seconds: Math.max(1, Math.ceil(input.byteLength / SPEECH_BYTES_PER_SECOND)),
    source: 'size_estimate',
  }
}
