import { normalizeBodyInitAsync } from 'expo/src/winter/fetch/RequestUtils'
import {
  audioForm,
  directTranscriber,
  UPLOAD_ERRORS,
  type DirectUploadDeps,
} from '../lib/direct-upload'
import type { CapturePart } from '../lib/pending-capture'

/**
 * "UNDERSTAND IT" ON THE PHONE
 * Every TestFlight recording failed with "You are offline" while the phone was
 * online. Since SDK 57 the app's global fetch is Expo's, and its FormData
 * encoder throws on React Native's `{ uri, name, type }` file part -- the
 * shape the app sent -- so nothing ever left the phone, and the catch-all
 * called that offline.
 *
 * These tests run the body through Expo's own encoder (the code the phone
 * runs inside fetch), on React Native's FormData with the patch the Expo
 * runtime installs on it (jest-expo stubs both out; the real ones are used
 * here), so the shape that broke cannot come back unnoticed.
 */

const PhoneFormData = jest.requireActual('react-native/Libraries/Network/FormData')
  .default as typeof FormData
jest.requireActual('expo/src/winter/FormData').installFormDataPatch(PhoneFormData)
globalThis.FormData = PhoneFormData

const PART: CapturePart = {
  uri: 'file:///Documents/ExpoAudio/recording-1.m4a',
  seconds: 61.4,
  text: null,
}
const AUDIO = new Uint8Array(4_000).map((_, i) => i % 251)

/** What expo-file-system's File offers fetch: a name, a type and its bytes. */
function phoneFile(
  overrides: Partial<{ name: string; type: string; bytes: () => Promise<Uint8Array> }> = {},
) {
  return {
    name: 'recording-1.m4a',
    type: 'audio/mp4',
    size: AUDIO.length,
    bytes: async () => AUDIO,
    arrayBuffer: async () => AUDIO.buffer,
    ...overrides,
  } as unknown as Blob
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body instanceof Error) throw body
      return body
    },
  } as unknown as Response
}

/** A fetch that encodes the body exactly as Expo's does before anything is sent. */
function expoFetch(answer: (sent: string) => Response | Promise<Response>) {
  const sent: string[] = []
  const fn = async (_url: string, init: RequestInit) => {
    const { body, overriddenHeaders } = await normalizeBodyInitAsync(init.body as BodyInit)
    const text = Buffer.from(body ?? new Uint8Array()).toString('latin1')
    sent.push(`${overriddenHeaders?.[0]?.[1] ?? ''}\n${text}`)
    return answer(text)
  }
  return Object.assign(fn, { sent })
}

function deps(overrides: Partial<DirectUploadDeps> = {}): DirectUploadDeps {
  return {
    apiUrl: 'https://www.atturel.com',
    token: async () => 'access-token',
    openFile: () => phoneFile(),
    fetch: expoFetch(() => response(200, { text: 'We agreed to send the proposal on Friday.' })),
    ...overrides,
  }
}

describe('the recording leaves the phone', () => {
  it("the old file part is one Expo's fetch refuses before sending (the TestFlight failure)", async () => {
    const form = new FormData()
    form.append('audio', {
      uri: PART.uri,
      name: 'capture.m4a',
      type: 'audio/mp4',
    } as unknown as Blob)
    await expect(normalizeBodyInitAsync(form)).rejects.toThrow(
      'Unsupported FormDataPart implementation',
    )
  })

  it('sends the audio itself, named, typed, with its length and the people in it', async () => {
    const fetch = expoFetch(() => response(200, { text: 'words' }))
    const result = await directTranscriber(deps({ fetch }), ['p-1', 'p-2'])(PART, 0)
    expect(result).toEqual({ ok: true, text: 'words' })

    const [sent] = fetch.sent
    expect(sent).toMatch(/^multipart\/form-data; boundary=/)
    expect(sent).toContain(
      'content-disposition: form-data; name="audio"; filename="recording-1.m4a"',
    )
    expect(sent).toContain('content-type: audio/mp4')
    expect(sent).toContain(Buffer.from(AUDIO).toString('latin1'))
    expect(sent).toMatch(/name="durationSeconds"\r\n\r\n61\r\n/)
    expect(sent!.match(/name="participant"/g)).toHaveLength(2)
  })

  it('builds a form Expo can encode from any phone file', async () => {
    await expect(normalizeBodyInitAsync(audioForm(phoneFile(), PART))).resolves.toMatchObject({
      body: expect.any(Uint8Array),
    })
  })

  it('sends the token, and only to the transcription route', async () => {
    const seen: Array<{ url: string; auth: string }> = []
    const fetch = async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization! })
      return response(200, { text: 'x' })
    }
    await directTranscriber(deps({ fetch }))(PART, 0)
    expect(seen).toEqual([
      { url: 'https://www.atturel.com/api/conversations/transcribe', auth: 'Bearer access-token' },
    ])
  })
})

describe('a failure says what actually happened', () => {
  it('a request that got no answer is "could not be reached", worth retrying, not "offline"', async () => {
    const fetch = async () => {
      throw new Error('fetch failed: The network connection was lost.')
    }
    const result = await directTranscriber(deps({ fetch }))(PART, 0)
    expect(result).toEqual({
      ok: false,
      error: UPLOAD_ERRORS.unreachable,
      retryable: true,
      detail: 'fetch failed: The network connection was lost.',
    })
  })

  it('a file the phone cannot read or encode is not retried, and says so', async () => {
    const unreadable = phoneFile({
      bytes: async () => {
        throw new Error('File not found')
      },
    })
    const result = await directTranscriber(
      deps({ openFile: () => unreadable, fetch: expoFetch(() => response(200, {})) }),
    )(PART, 0)
    expect(result).toEqual({
      ok: false,
      error: UPLOAD_ERRORS.unreadable,
      retryable: false,
      detail: 'File not found',
    })
  })

  it('an answer that never comes is cut short and retried', async () => {
    const fetch = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('fetch failed: cancelled')))
      })
    const result = await directTranscriber(deps({ fetch, timeoutMs: 5 }))(PART, 0)
    expect(result).toMatchObject({ ok: false, error: UPLOAD_ERRORS.timeout, retryable: true })
  })

  it('signed out is "sign in again", not retried', async () => {
    const result = await directTranscriber(
      deps({ fetch: async () => response(401, { error: 'Unauthorized' }) }),
    )(PART, 0)
    expect(result).toEqual({ ok: false, error: UPLOAD_ERRORS.signIn, retryable: false })
    expect(await directTranscriber(deps({ token: async () => null }))(PART, 0)).toMatchObject({
      retryable: false,
    })
  })

  it("the server's own sentence, retried only when the server or provider was busy", async () => {
    const busy = await directTranscriber(
      deps({ fetch: async () => response(502, { error: 'The transcription service is busy.' }) }),
    )(PART, 0)
    expect(busy).toEqual({
      ok: false,
      error: 'The transcription service is busy.',
      retryable: true,
      detail: 'HTTP 502',
    })

    const allowance = await directTranscriber(
      deps({ fetch: async () => response(403, { error: "You've used this month's minutes." }) }),
    )(PART, 0)
    expect(allowance).toMatchObject({
      ok: false,
      error: "You've used this month's minutes.",
      retryable: false,
    })

    const platformTimeout = await directTranscriber(
      deps({ fetch: async () => response(504, new SyntaxError('Unexpected token <')) }),
    )(PART, 0)
    expect(platformTimeout).toMatchObject({
      ok: false,
      error: UPLOAD_ERRORS.timeout,
      retryable: true,
    })
  })

  it('a success whose body was cut off is asked for again', async () => {
    const result = await directTranscriber(
      deps({ fetch: async () => response(200, new Error('stream ended')) }),
    )(PART, 0)
    expect(result).toEqual({
      ok: false,
      error: UPLOAD_ERRORS.interrupted,
      retryable: true,
      detail: 'stream ended',
    })
  })

  it('no failure sentence claims the recording is safe -- the screen says that, once', () => {
    for (const sentence of Object.values(UPLOAD_ERRORS))
      expect(sentence).not.toMatch(/safe on this phone/)
  })
})
