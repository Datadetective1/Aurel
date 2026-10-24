import {
  closePart,
  forget,
  memoryStore,
  newPending,
  recordedSeconds,
  recover,
  transcribeParts,
  transcriptOf,
  type PartTranscriber,
} from '../lib/pending-capture'

/**
 * A RECORDING CANNOT BE LOST QUIETLY
 * The rules the Capture screen relies on, without a phone: parts survive a
 * failed transcription and a closed app, words are never fetched twice, and
 * audio is deleted only after the conversation was kept or by the person.
 */

const NOW = new Date('2026-10-24T15:00:00Z')

function setup(files: Record<string, number> = {}) {
  const store = memoryStore(new Map(Object.entries(files)))
  const p = newPending({ id: 'c1', now: NOW, mode: 'voice_note', consent: false })
  store.save(p)
  return { store, p }
}

const words = (map: Record<string, string>): PartTranscriber & { calls: string[] } => {
  const calls: string[] = []
  const fn: PartTranscriber = async (part) => {
    calls.push(part.uri)
    return { ok: true, text: map[part.uri] ?? '' }
  }
  return Object.assign(fn, { calls })
}

describe('closing a part', () => {
  it('keeps a real part and writes it down at once', () => {
    const { store, p } = setup({ 'a.m4a': 240_000 })
    p.current = 'a.m4a'
    closePart(p, { uri: 'a.m4a', seconds: 61 }, store)
    expect(p.parts).toEqual([{ uri: 'a.m4a', seconds: 61, text: null }])
    expect(p.current).toBeNull()
    expect(store.saved?.parts).toHaveLength(1)
  })

  it('drops a part too short to hold speech, and its file', () => {
    const { store, p } = setup({ 'tiny.m4a': 300 })
    closePart(p, { uri: 'tiny.m4a', seconds: 0.4 }, store)
    expect(p.parts).toEqual([])
    expect(store.sizeOf('tiny.m4a')).toBeNull()
  })
})

describe('turning parts into words', () => {
  it('does each part once, in order, and saves after each', async () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'b.m4a': 1e5 })
    p.parts = [
      { uri: 'a.m4a', seconds: 600, text: null },
      { uri: 'b.m4a', seconds: 30, text: null },
    ]
    const t = words({ 'a.m4a': 'first', 'b.m4a': 'second' })
    expect(await transcribeParts(p, t, store)).toEqual({ ok: true })
    expect(transcriptOf(p)).toBe('first\n\nsecond')
    expect(store.saved?.parts.map((x) => x.text)).toEqual(['first', 'second'])

    // Sending again (say the conversation failed to save) fetches nothing twice.
    await transcribeParts(p, t, store)
    expect(t.calls).toEqual(['a.m4a', 'b.m4a'])
  })

  it('retries a busy provider, then reports and keeps the audio', async () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'b.m4a': 1e5 })
    p.parts = [
      { uri: 'a.m4a', seconds: 600, text: null },
      { uri: 'b.m4a', seconds: 600, text: null },
    ]
    let attempts = 0
    const t: PartTranscriber = async (part) => {
      if (part.uri === 'a.m4a') return { ok: true, text: 'kept' }
      attempts += 1
      return { ok: false, error: 'The provider is busy.', retryable: true }
    }
    expect(await transcribeParts(p, t, store)).toEqual({ ok: false, error: 'The provider is busy.' })
    expect(attempts).toBe(3)
    // The first part's words are kept; the second part's audio is still there.
    expect(store.saved?.parts.map((x) => x.text)).toEqual(['kept', null])
    expect(store.sizeOf('b.m4a')).not.toBeNull()
  })

  it('does not retry what retrying cannot fix', async () => {
    const { store, p } = setup({ 'a.m4a': 1e5 })
    p.parts = [{ uri: 'a.m4a', seconds: 600, text: null }]
    let attempts = 0
    const t: PartTranscriber = async () => {
      attempts += 1
      return { ok: false, error: "You've used this month's minutes.", retryable: false }
    }
    await transcribeParts(p, t, store)
    expect(attempts).toBe(1)
  })

  it('says so when a part has gone missing from the phone', async () => {
    const { store, p } = setup({})
    p.parts = [{ uri: 'gone.m4a', seconds: 60, text: null }]
    expect(await transcribeParts(p, words({}), store)).toEqual({
      ok: false,
      error: 'Part of this recording is missing from the phone.',
    })
  })

  it('picks up a part that finished while it was working', async () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'b.m4a': 1e5 })
    p.parts = [{ uri: 'a.m4a', seconds: 600, text: null }]
    const t: PartTranscriber = async (part) => {
      if (part.uri === 'a.m4a') p.parts.push({ uri: 'b.m4a', seconds: 12, text: null })
      return { ok: true, text: part.uri }
    }
    await transcribeParts(p, t, store)
    expect(p.parts.map((x) => x.text)).toEqual(['a.m4a', 'b.m4a'])
  })
})

describe('reopening the app', () => {
  it('offers back an unsent recording, words and all', () => {
    const { store, p } = setup({ 'a.m4a': 1e5 })
    p.parts = [{ uri: 'a.m4a', seconds: 90, text: 'already words' }]
    store.save(p)
    const found = recover(store)
    expect(found.kind).toBe('unsent')
    if (found.kind === 'unsent') {
      expect(found.lostCurrentPart).toBe(false)
      expect(recordedSeconds(found.pending)).toBe(90)
      expect(transcriptOf(found.pending)).toBe('already words')
    }
  })

  it('keeps finished parts when the app closed mid-part, and says the last part is gone', () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'open.m4a': 5e4 })
    p.parts = [{ uri: 'a.m4a', seconds: 300, text: null }]
    p.current = 'open.m4a'
    store.save(p)
    const found = recover(store)
    expect(found).toMatchObject({ kind: 'unsent', lostCurrentPart: true })
    expect(store.sizeOf('open.m4a')).toBeNull()
  })

  it('tells the person when nothing could be saved, rather than saying nothing', () => {
    const { store, p } = setup({ 'open.m4a': 5e4 })
    p.current = 'open.m4a'
    store.save(p)
    expect(recover(store)).toEqual({ kind: 'lost', lostCurrentPart: true })
    expect(store.saved).toBeNull()
  })

  it('finds nothing when nothing was pending', () => {
    expect(recover(memoryStore())).toEqual({ kind: 'none' })
  })
})

describe('discarding while a part is still being transcribed', () => {
  it('does not bring the recording back when the part returns', async () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'b.m4a': 1e5 })
    p.parts = [
      { uri: 'a.m4a', seconds: 600, text: null },
      { uri: 'b.m4a', seconds: 600, text: null },
    ]
    let release: () => void = () => {}
    const slow: PartTranscriber = (part) =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, text: part.uri })
      })
    const running = transcribeParts(p, slow, store)
    forget(p, store) // the person taps Discard
    release()
    expect(await running).toEqual({ ok: false, error: 'This recording was discarded.' })
    expect(store.saved).toBeNull()
    expect(recover(store)).toEqual({ kind: 'none' })
  })

  it('removes a part that finishes closing after the discard', () => {
    const { store, p } = setup({ 'late.m4a': 1e5 })
    forget(p, store)
    closePart(p, { uri: 'late.m4a', seconds: 30 }, store)
    expect(store.sizeOf('late.m4a')).toBeNull()
    expect(store.saved).toBeNull()
  })
})

describe('forgetting', () => {
  it('deletes the audio and the note together, only when asked', () => {
    const { store, p } = setup({ 'a.m4a': 1e5, 'b.m4a': 1e5 })
    p.parts = [
      { uri: 'a.m4a', seconds: 60, text: 'x' },
      { uri: 'b.m4a', seconds: 60, text: null },
    ]
    forget(p, store)
    expect(store.sizeOf('a.m4a')).toBeNull()
    expect(store.sizeOf('b.m4a')).toBeNull()
    expect(store.saved).toBeNull()
  })
})
