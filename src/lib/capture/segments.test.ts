import { describe, expect, it } from 'vitest'
import {
  discardCapture,
  requestSegmentUpload,
  sweepOrphans,
  transcribeSegment,
  type SegmentDeps,
  type SegmentRow,
  type SegmentStore,
  type TranscribeFn,
} from './segments'
import {
  captureLimits,
  ownsSegmentPath,
  segmentPath,
  SEGMENT_MAX_BYTES,
  MAX_SEGMENTS,
} from './limits'
import { measureDuration, mp4DurationSeconds } from './audio-duration'
import { transcriptionCostMicros, transcriptionUsageRecords } from '@/lib/billing/transcription'

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CAPTURE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function memory(start = new Date('2026-10-13T12:00:00Z')) {
  const rows = new Map<string, SegmentRow>()
  const objects = new Map<string, Blob>()
  const removed: string[] = []
  const downloads: string[] = []
  let n = 0
  let clock = start.getTime()
  const store: SegmentStore = {
    async insert(row) {
      if (
        [...rows.values()].some(
          (r) => r.userId === row.userId && r.captureId === row.captureId && r.index === row.index,
        )
      ) {
        return { ok: false, reason: 'duplicate' }
      }
      const id = `0000000${++n}-0000-4000-8000-000000000000`.slice(-36)
      rows.set(id, {
        ...row,
        id,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(clock).toISOString(),
        objectDeletedAt: null,
      })
      return { ok: true, id }
    },
    async get(id) {
      return rows.get(id) ?? null
    },
    async update(id, patch) {
      const row = rows.get(id)!
      rows.set(id, {
        ...row,
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.objectDeletedAt ? { objectDeletedAt: patch.objectDeletedAt } : {}),
      })
    },
    async listForCapture(userId, captureId) {
      return [...rows.values()].filter((r) => r.userId === userId && r.captureId === captureId)
    },
    async listOrphans(olderThan) {
      return [...rows.values()].filter((r) => !r.objectDeletedAt && r.createdAt < olderThan)
    },
  }
  const deps: SegmentDeps = {
    store,
    storage: {
      async signedUploadUrl(path) {
        objects.set(path, new Blob([new Uint8Array(5_000)]))
        return { signedUrl: `https://storage.example/upload/${path}?token=t`, token: 't' }
      },
      async download(path) {
        downloads.push(path)
        return objects.get(path) ?? null
      },
      async remove(paths) {
        for (const p of paths) {
          objects.delete(p)
          removed.push(p)
        }
      },
    },
    now: () => new Date(clock),
    newId: () => CAPTURE,
  }
  return { rows, objects, removed, downloads, deps, advance: (ms: number) => (clock += ms) }
}

const ok: TranscribeFn = async () => ({ ok: true, text: 'hello', seconds: 600 })
const failing =
  (reason: string): TranscribeFn =>
  async () => ({ ok: false, reason })
const message = (r: string) => `failed: ${r}`

async function upload(m: ReturnType<typeof memory>, user = ALICE, index = 0) {
  const r = await requestSegmentUpload(
    user,
    { index, extension: 'm4a', bytes: 2_400_000, declaredSeconds: 600 },
    m.deps,
  )
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('asking for an upload', () => {
  it('builds the path under the caller, never from client input', async () => {
    const m = memory()
    const r = await upload(m)
    expect(r.path).toBe(`${ALICE}/${CAPTURE}/000.m4a`)
    expect(ownsSegmentPath(ALICE, r.path)).toBe(true)
    expect(ownsSegmentPath(BOB, r.path)).toBe(false)
  })

  it('refuses oversized, malformed, out-of-range and duplicate segments', async () => {
    const m = memory()
    const ask = (body: Record<string, unknown>) =>
      requestSegmentUpload(ALICE, { index: 0, extension: 'm4a', bytes: 2_000_000, ...body }, m.deps)
    expect(await ask({ bytes: SEGMENT_MAX_BYTES + 1 })).toMatchObject({ ok: false, status: 413 })
    expect(await ask({ extension: 'exe' })).toMatchObject({ ok: false, status: 400 })
    expect(await ask({ index: MAX_SEGMENTS })).toMatchObject({ ok: false, status: 400 })
    expect(await ask({ captureId: '../../etc' })).toMatchObject({ ok: false, status: 400 })
    expect(await ask({})).toMatchObject({ ok: true })
    expect(await ask({ captureId: CAPTURE })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('transcribing a segment', () => {
  it('returns the words and deletes the audio at once', async () => {
    const m = memory()
    const r = await upload(m)
    const out = await transcribeSegment(ALICE, r.uploadId, {
      ...m.deps,
      transcribe: ok,
      failureMessage: message,
    })
    expect(out).toEqual({ ok: true, text: 'hello', seconds: 600, notice: null })
    expect(m.objects.has(r.path)).toBe(false)
    expect(m.rows.get(r.uploadId)).toMatchObject({ status: 'transcribed' })
  })

  it("denies another user's segment as not found, without touching storage", async () => {
    const m = memory()
    const r = await upload(m, ALICE)
    const out = await transcribeSegment(BOB, r.uploadId, {
      ...m.deps,
      transcribe: ok,
      failureMessage: message,
    })
    expect(out).toMatchObject({ ok: false, status: 404 })
    expect(m.downloads).toEqual([])
    expect(m.objects.has(r.path)).toBe(true)
  })

  it('refuses a malformed id and a second transcription', async () => {
    const m = memory()
    const r = await upload(m)
    const deps = { ...m.deps, transcribe: ok, failureMessage: message }
    expect(await transcribeSegment(ALICE, 'not-an-id', deps)).toMatchObject({ status: 404 })
    await transcribeSegment(ALICE, r.uploadId, deps)
    expect(await transcribeSegment(ALICE, r.uploadId, deps)).toMatchObject({ status: 409 })
  })

  it('deletes the audio after a failure retrying cannot fix', async () => {
    const m = memory()
    const r = await upload(m)
    const out = await transcribeSegment(ALICE, r.uploadId, {
      ...m.deps,
      transcribe: failing('unsupported_media'),
      failureMessage: message,
    })
    expect(out).toMatchObject({ ok: false, retryable: false })
    expect(m.objects.has(r.path)).toBe(false)
  })

  it('keeps the audio for a retry after a transient failure, and gives up after three', async () => {
    const m = memory()
    const r = await upload(m)
    const deps = { ...m.deps, transcribe: failing('unavailable'), failureMessage: message }
    expect(await transcribeSegment(ALICE, r.uploadId, deps)).toMatchObject({ retryable: true })
    expect(m.objects.has(r.path)).toBe(true)
    await transcribeSegment(ALICE, r.uploadId, deps)
    expect(await transcribeSegment(ALICE, r.uploadId, deps)).toMatchObject({ retryable: false })
    expect(m.objects.has(r.path)).toBe(false)
  })

  it('treats a thrown provider error as transient, never as a crash', async () => {
    const m = memory()
    const r = await upload(m)
    const out = await transcribeSegment(ALICE, r.uploadId, {
      ...m.deps,
      transcribe: async () => {
        throw new Error('socket hang up')
      },
      failureMessage: message,
    })
    expect(out).toMatchObject({ ok: false, retryable: true })
  })
})

describe('the transcription allowance on a segment', () => {
  it('refuses without retrying, deletes the audio, and says why in product language', async () => {
    const m = memory()
    const r = await upload(m)
    const out = await transcribeSegment(ALICE, r.uploadId, {
      ...m.deps,
      transcribe: async () => ({
        ok: false,
        reason: 'allowance',
        message: "You've used this month's 60 minutes of transcription.",
      }),
      failureMessage: message,
    })
    expect(out).toEqual({
      ok: false,
      status: 403,
      error: "You've used this month's 60 minutes of transcription.",
      retryable: false,
    })
    expect(m.objects.has(r.path)).toBe(false)
  })

  it('passes a near-limit notice back with the words', async () => {
    const m = memory()
    const r = await upload(m)
    const out = await transcribeSegment(ALICE, r.uploadId, {
      ...m.deps,
      transcribe: async () => ({
        ok: true,
        text: 'hi',
        seconds: 60,
        notice: '8 minutes of transcription left this month.',
      }),
      failureMessage: message,
    })
    expect(out).toMatchObject({ ok: true, notice: '8 minutes of transcription left this month.' })
  })
})

describe('cleanup', () => {
  it('discarding a recording deletes its segments now, and only the owner can', async () => {
    const m = memory()
    const a = await upload(m, ALICE, 0)
    const b = await upload(m, ALICE, 1)
    expect(await discardCapture(BOB, CAPTURE, m.deps)).toBe(0)
    expect(m.objects.size).toBe(2)
    expect(await discardCapture(ALICE, CAPTURE, m.deps)).toBe(2)
    expect(m.objects.has(a.path) || m.objects.has(b.path)).toBe(false)
  })

  it('the sweep removes anything uploaded and abandoned for over an hour', async () => {
    const m = memory()
    const r = await upload(m)
    expect(await sweepOrphans(m.deps)).toBe(0)
    m.advance(61 * 60 * 1000)
    expect(await sweepOrphans(m.deps)).toBe(1)
    expect(m.objects.has(r.path)).toBe(false)
    expect(m.rows.get(r.uploadId)?.status).toBe('deleted')
    expect(await sweepOrphans(m.deps)).toBe(0)
  })
})

describe('limits', () => {
  it('single upload is seventeen minutes; segmented is two hours in ten-minute parts', () => {
    expect(captureLimits(false)).toEqual({ maxSeconds: 17 * 60, segmentSeconds: null })
    expect(captureLimits(true)).toEqual({ maxSeconds: 2 * 3600, segmentSeconds: 600 })
    expect(segmentPath(ALICE, CAPTURE, 7, 'm4a')).toBe(`${ALICE}/${CAPTURE}/007.m4a`)
  })
})

/** A minimal MP4: ftyp, then moov > mvhd. */
function mp4(seconds: number, version: 0 | 1 = 0): Uint8Array {
  const timescale = 1000
  const mvhdBody = version === 0 ? 100 : 112
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length)
    const v = new DataView(out.buffer)
    v.setUint32(0, out.length)
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(body, 8)
    return out
  }
  const mvhd = new Uint8Array(mvhdBody)
  const v = new DataView(mvhd.buffer)
  v.setUint8(0, version)
  if (version === 0) {
    v.setUint32(12, timescale)
    v.setUint32(16, seconds * timescale)
  } else {
    v.setUint32(20, timescale)
    v.setUint32(24, 0)
    v.setUint32(28, seconds * timescale)
  }
  const ftyp = box('ftyp', new Uint8Array(8))
  const moov = box('moov', box('mvhd', mvhd))
  const file = new Uint8Array(ftyp.length + moov.length)
  file.set(ftyp)
  file.set(moov, ftyp.length)
  return file
}

describe('measuring what was transcribed', () => {
  it('reads the duration from an iPhone-style m4a, in both header versions', () => {
    expect(mp4DurationSeconds(mp4(605))).toBe(605)
    expect(mp4DurationSeconds(mp4(42, 1))).toBe(42)
    expect(mp4DurationSeconds(new Uint8Array(32))).toBeNull()
  })

  it('prefers the file over the client, and bounds a client claim by the file size', () => {
    expect(
      measureDuration({
        bytes: mp4(605),
        extension: 'm4a',
        declaredSeconds: 9_999,
        byteLength: 2_400_000,
      }),
    ).toEqual({ seconds: 605, source: 'container' })
    expect(
      measureDuration({
        bytes: null,
        extension: 'webm',
        declaredSeconds: 120,
        byteLength: 500_000,
      }),
    ).toEqual({ seconds: 120, source: 'declared' })
    expect(
      measureDuration({
        bytes: null,
        extension: 'webm',
        declaredSeconds: 99_999,
        byteLength: 500_000,
      }),
    ).toEqual({ seconds: 500, source: 'size_bound' })
    expect(
      measureDuration({ bytes: null, extension: 'webm', declaredSeconds: 0, byteLength: 400_000 }),
    ).toEqual({ seconds: 100, source: 'size_estimate' })
  })

  it('meters seconds and calls, priced only where a published rate is on file', () => {
    expect(transcriptionCostMicros('gpt-4o-transcribe', 600)).toBe(60_000)
    // gpt-transcribe at $0.0045 a minute: ten minutes is 4.5 cents.
    expect(transcriptionCostMicros('gpt-transcribe', 600)).toBe(45_000)
    expect(transcriptionCostMicros('some-unlisted-model', 600)).toBeNull()
    const rows = transcriptionUsageRecords({
      model: 'gpt-4o-transcribe',
      duration: { seconds: 600, source: 'container' },
      inputTokens: 10,
      outputTokens: 20,
    })
    expect(rows.map((r) => [r.meter, r.quantity ?? 1])).toEqual([
      ['transcription_seconds', 600],
      ['voice_transcription', 1],
    ])
  })
})
