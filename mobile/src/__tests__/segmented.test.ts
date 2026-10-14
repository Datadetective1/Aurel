import { SegmentedCapture, type SegmentedDeps } from '../lib/segmented'

/**
 * The phone's half of segmented capture: segments go up in order, retryable
 * failures are retried, words come back in order, and a discarded recording
 * is deleted on the server.
 */
function deps(overrides: Partial<SegmentedDeps> = {}) {
  const calls: string[] = []
  const d: SegmentedDeps = {
    async readFile(uri) {
      calls.push(`read:${uri}`)
      return new ArrayBuffer(4_000)
    },
    async requestUpload({ index, captureId }) {
      calls.push(`ticket:${index}:${captureId ?? 'new'}`)
      return { uploadId: `u${index}`, captureId: 'cap-1', path: `user/cap-1/00${index}.m4a`, token: 't', contentType: 'audio/mp4' }
    },
    async putObject(ticket) {
      calls.push(`put:${ticket.path}`)
    },
    async transcribe(uploadId) {
      calls.push(`transcribe:${uploadId}`)
      return { ok: true, text: `words ${uploadId}` }
    },
    async discard(captureId) {
      calls.push(`discard:${captureId}`)
    },
    ...overrides,
  }
  return { d, calls }
}

describe('segmented capture', () => {
  it('uploads each segment once, in order, reusing the capture', async () => {
    const { d, calls } = deps()
    const capture = new SegmentedCapture(d)
    capture.add('file:///a.m4a', 600)
    capture.add('file:///b.m4a', 600)
    capture.add('file:///c.m4a', 42)
    const result = await capture.finish()
    expect(result).toEqual({ ok: true, text: 'words u0\n\nwords u1\n\nwords u2' })
    expect(calls.filter((c) => c.startsWith('ticket'))).toEqual(['ticket:0:new', 'ticket:1:cap-1', 'ticket:2:cap-1'])
    expect(capture.segments).toBe(3)
  })

  it('retries a retryable failure, then succeeds', async () => {
    let attempts = 0
    const { d } = deps({
      async transcribe() {
        attempts++
        return attempts < 3 ? { ok: false, error: 'busy', retryable: true } : { ok: true, text: 'finally' }
      },
    })
    const capture = new SegmentedCapture(d)
    capture.add('file:///a.m4a', 600)
    expect(await capture.finish()).toEqual({ ok: true, text: 'finally' })
    expect(attempts).toBe(3)
  })

  it('stops at a failure that cannot be retried, and says what it was', async () => {
    const { d, calls } = deps({
      async transcribe() {
        return { ok: false, error: "That audio format isn't supported.", retryable: false }
      },
    })
    const capture = new SegmentedCapture(d)
    capture.add('file:///a.m4a', 600)
    capture.add('file:///b.m4a', 600)
    expect(await capture.finish()).toEqual({ ok: false, error: "That audio format isn't supported." })
    // The second segment is not sent once the recording has failed.
    expect(calls.filter((c) => c.startsWith('put')).length).toBe(1)
  })

  it('reports an upload failure rather than losing it', async () => {
    const { d } = deps({
      async putObject() {
        throw new Error('That part of the recording could not be uploaded.')
      },
    })
    const capture = new SegmentedCapture(d)
    capture.add('file:///a.m4a', 600)
    expect(await capture.finish()).toEqual({ ok: false, error: 'That part of the recording could not be uploaded.' })
  })

  it('a discarded recording is deleted on the server', async () => {
    const { d, calls } = deps()
    const capture = new SegmentedCapture(d)
    capture.add('file:///a.m4a', 600)
    await capture.cancel()
    expect(calls).toContain('discard:cap-1')
  })
})
