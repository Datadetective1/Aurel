import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Speech to text.
 *
 * Two properties matter more than the happy path: it produces words and
 * nothing else, and it never lets audio or a transcript reach a log. A
 * provider error body can echo the request back, and the request is somebody's
 * voice describing a meeting.
 */

const KEY = 'sk-test-key-not-real'

// `null` rather than `undefined` for "no key": passing undefined to an
// optional parameter re-applies its default, which silently gave the key back.
async function load(stub: typeof fetch, apiKey: string | null = KEY) {
  vi.resetModules()
  vi.stubEnv('OPENAI_API_KEY', apiKey ?? '')
  vi.stubGlobal('fetch', stub)
  return import('./transcribe')
}

function reply(body: unknown, status = 200) {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch
}

function audio(bytes = 4096, type = 'audio/webm') {
  return new Blob([new Uint8Array(bytes)], { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('transcribeAudio', () => {
  it('returns the words the provider heard', async () => {
    const { transcribeAudio } = await load(reply({ text: '  The meeting went well.  ' }))
    const result = await transcribeAudio({ audio: audio(), extension: 'webm' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toBe('The meeting went well.')
  })

  it('sends a filename we constructed, never one from the browser', async () => {
    // The browser supplies a name and it is not to be trusted with one.
    let sentName: string | null = null
    const { transcribeAudio } = await load((async (_url, init) => {
      const form = (init as RequestInit).body as FormData
      const file = form.get('file')
      sentName = file instanceof File ? file.name : null
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    }) as typeof fetch)

    await transcribeAudio({ audio: audio(), extension: 'mp4' })
    expect(sentName).toBe('debrief.mp4')
  })

  it('asks for a current transcription model', async () => {
    let model: string | null = null
    const { transcribeAudio } = await load((async (_url, init) => {
      const form = (init as RequestInit).body as FormData
      model = String(form.get('model'))
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    }) as typeof fetch)

    await transcribeAudio({ audio: audio(), extension: 'webm' })
    expect(model).toBe('gpt-transcribe')
  })

  it('falls back to the previous model rather than failing the pilot', async () => {
    // If the account cannot reach the newer model, a debrief should still
    // transcribe. Same API shape, one generation back.
    const models: string[] = []
    const { transcribeAudio } = await load((async (_url, init) => {
      const form = (init as RequestInit).body as FormData
      const model = String(form.get('model'))
      models.push(model)
      if (model === 'gpt-transcribe') {
        return new Response(JSON.stringify({ error: { message: 'model not found' } }), {
          status: 404,
        })
      }
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    }) as typeof fetch)

    const result = await transcribeAudio({ audio: audio(), extension: 'webm' })
    expect(models).toEqual(['gpt-transcribe', 'gpt-4o-transcribe'])
    expect(result.ok).toBe(true)
  })

  it('treats an empty transcript as a failure, not a success', async () => {
    // Silence is not a debrief, and reporting success would put an empty
    // string into the field and call it done.
    const { transcribeAudio } = await load(reply({ text: '   ' }))
    const result = await transcribeAudio({ audio: audio(), extension: 'webm' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('empty_result')
  })

  it('refuses to run without a key rather than calling out', async () => {
    let called = false
    const { transcribeAudio } = await load((async () => {
      called = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch, null)

    const result = await transcribeAudio({ audio: audio(), extension: 'webm' })
    expect(called).toBe(false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not_configured')
  })

  it('separates the provider failures that mean different things', async () => {
    for (const [status, reason] of [
      [401, 'unauthorized'],
      [429, 'rate_limited'],
      [413, 'too_large'],
      [503, 'unavailable'],
    ] as const) {
      const { transcribeAudio } = await load(reply({ error: 'x' }, status))
      const result = await transcribeAudio({ audio: audio(), extension: 'webm' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe(reason)
    }
  })

  it('resolves rather than throwing when the provider is unreachable', async () => {
    const { transcribeAudio } = await load((async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch)
    const result = await transcribeAudio({ audio: audio(), extension: 'webm' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unavailable')
  })

  it('never asks the transcription call to analyse anything', async () => {
    // Its whole job is speech to text. Commitments, observations and memory
    // proposals belong to the existing debrief pipeline, and a second path
    // that also produced them would be the thing this feature must not become.
    let fields: string[] = []
    const { transcribeAudio } = await load((async (_url, init) => {
      fields = [...((init as RequestInit).body as FormData).keys()]
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    }) as typeof fetch)

    await transcribeAudio({ audio: audio(), extension: 'webm', keywords: ['Jordan'] })
    expect(fields.sort()).toEqual(['file', 'keywords', 'model', 'response_format'])
  })
})

describe('what transcription is allowed to log', () => {
  it('never passes audio or transcript to the logger', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'ai', 'transcribe.ts'), 'utf8')

    const logged = [...source.matchAll(/logger\.[a-z]+\(\s*'[a-z_.]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )

    expect(logged.length).toBeGreaterThan(0)
    for (const call of logged) {
      expect(call).not.toMatch(/text|transcript|audio|blob|body|keywords/)
    }
  })

  it('does not log the provider error body', async () => {
    // The body can echo the request, and the request is the recording.
    const source = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(process.cwd(), 'src', 'lib', 'ai', 'transcribe.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/logger\.[a-z]+\([^)]*\bbody\b/)
  })
})
