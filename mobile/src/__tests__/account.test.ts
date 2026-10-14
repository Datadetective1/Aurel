/**
 * Delete Account from inside the app: the request the screen sends, and
 * that every refusal comes back as something the screen can say.
 */
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) } },
}))
jest.mock('../lib/config', () => ({ config: { apiUrl: 'https://app.example', previewData: false } }))

import { api } from '../lib/api'

describe('deleteAccount', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  function respond(status: number, body: unknown) {
    const fetchMock = jest.fn(async () => ({ status, ok: status < 400, json: async () => body }))
    global.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
  }

  it('sends DELETE to the account route with the typed confirmation and the token', async () => {
    const fetchMock = respond(200, { deleted: true })
    const result = await api.deleteAccount({ confirmation: 'DELETE' })
    expect(result).toEqual({ deleted: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.example/api/mobile/account')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(String(init.body))).toEqual({ confirmation: 'DELETE' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1')
  })

  it('returns a billing refusal as data, so nothing is deleted silently', async () => {
    respond(502, { deleted: false, stage: 'billing', error: 'We could not stop your subscription, so nothing was deleted.' })
    expect(await api.deleteAccount({ confirmation: 'DELETE' })).toMatchObject({ deleted: false, stage: 'billing' })
  })

  it('passes the Apple acknowledgement through when the person confirms it', async () => {
    const fetchMock = respond(200, { deleted: true })
    await api.deleteAccount({ confirmation: 'DELETE', appleAcknowledged: true })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).appleAcknowledged).toBe(true)
  })

  it('treats a network failure as offline, not as deleted', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('Network request failed')
    }) as unknown as typeof fetch
    await expect(api.deleteAccount({ confirmation: 'DELETE' })).rejects.toMatchObject({ failure: { kind: 'offline' } })
  })
})
