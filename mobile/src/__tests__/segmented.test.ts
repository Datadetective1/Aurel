import { discardRemote, storageTranscriber, type SegmentedDeps } from '../lib/segmented'
import { memoryStore, newPending, transcribeParts } from '../lib/pending-capture'

/**
 * Parts through private, temporary storage: each part is its own server-side
 * capture, so a part that failed can be sent again from the phone's copy;
 * whatever the server still holds for an abandoned part is discarded.
 */
function deps(overrides: Partial<SegmentedDeps> = {}) {
  const calls: string[] = []
  let n = 0
  const d: SegmentedDeps = {
    async readFile(uri) {
      calls.push(`read:${uri}`)
      return new ArrayBuffer(4_000)
    },
    async requestUpload({ index, captureId }) {
      n += 1
      calls.push(`ticket:${index}:${captureId ?? 'new'}`)
      return { uploadId: `u${n}`, captureId: `cap-${n}`, path: `user/cap-${n}/000.m4a`, token: 't', contentType: 'audio/mp4' }
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

function recording(uris: string[]) {
  const store = memoryStore(new Map(uris.map((u) => [u, 240_000])))
  const p = newPending({ id: 'x', now: new Date('2026-10-24T15:00:00Z'), mode: 'meeting_recording', consent: true })
  p.parts = uris.map((uri) => ({ uri, seconds: 600, text: null }))
  return { store, p }
}

describe('storage transport', () => {
  it('uploads each part once, in order, each as a new capture', async () => {
    const { d, calls } = deps()
    const { store, p } = recording(['file:///a.m4a', 'file:///b.m4a'])
    expect(await transcribeParts(p, storageTranscriber(d), store)).toEqual({ ok: true })
    expect(calls.filter((x) => x.startsWith('ticket'))).toEqual(['ticket:0:new', 'ticket:0:new'])
    expect(p.parts.map((x) => x.text)).toEqual(['words u1', 'words u2'])
    expect(p.parts.map((x) => x.captureId)).toEqual(['cap-1', 'cap-2'])
  })

  it('treats an upload that never reached the server as worth retrying', async () => {
    let failures = 1
    const { d } = deps({
      async putObject() {
        if (failures-- > 0) throw new Error('That part of the recording could not be uploaded.')
      },
    })
    const { store, p } = recording(['file:///a.m4a'])
    expect(await transcribeParts(p, storageTranscriber(d), store)).toEqual({ ok: true })
  })

  it('discards on the server only parts that never became words', async () => {
    const { d, calls } = deps()
    const { p } = recording(['file:///a.m4a', 'file:///b.m4a'])
    p.parts[0]!.text = 'done'
    p.parts[0]!.captureId = 'cap-done'
    p.parts[1]!.captureId = 'cap-stuck'
    await discardRemote(d, p)
    expect(calls).toEqual(['discard:cap-stuck'])
  })
})
