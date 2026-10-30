import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../tests/stubs/fake-supabase'

/**
 * USING A PAGE'S PICTURE AS THEIR PHOTO
 * =============================================================================
 * Only a picture still offered is fetched and saved: a bio or speaker page
 * the user said is them, for someone with no photo. The fetch goes through
 * research's hardened fetcher and the save through the same photo rules as an
 * upload.
 * =============================================================================
 */

vi.mock('server-only', () => ({}))
const fetchImage = vi.fn()
vi.mock('@/lib/sources/fetch', () => ({ safeFetchImage: (...a: unknown[]) => fetchImage(...a) }))
const save = vi.fn()
vi.mock('@/lib/people/photos.server', () => ({ savePersonPhoto: (...a: unknown[]) => save(...a) }))

const { saveSourcePhoto, sourceThumbnail } = await import('./source-images.server')

const JPEG = {
  ok: true,
  finalUrl: 'x',
  contentType: 'image/jpeg',
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
}
const person: Row = {
  id: 'p-1',
  user_id: 'u-1',
  archived_at: null,
  avatar_path: null,
  avatar_url: null,
}
const linkTo = (source: Row, over: Row = {}): Row => ({
  user_id: 'u-1',
  person_id: 'p-1',
  source_id: source.id,
  identity_match_status: 'confirmed',
  reviewed_by_user: true,
  sources: source,
  ...over,
})
const bio: Row = {
  id: 's-1',
  source_type: 'company_bio',
  access_status: 'analyzed',
  metadata: { image: 'https://northwind.example/dana.jpg' },
}

beforeEach(() => {
  fetchImage.mockReset().mockResolvedValue(JPEG)
  save.mockReset().mockResolvedValue({ ok: true, path: 'u-1/people/p-1.jpg' })
})

describe('use as photo', () => {
  it('copies the confirmed bio page’s picture into their photo', async () => {
    const { client } = fakeClient({ people: [person], source_person_links: [linkTo(bio)] })
    expect(await saveSourcePhoto(client, 'u-1', 'p-1', 's-1')).toEqual({
      ok: true,
      path: 'u-1/people/p-1.jpg',
    })
    expect(fetchImage.mock.calls[0]![0]).toBe('https://northwind.example/dana.jpg')
    const file = save.mock.calls[0]![3] as Blob
    expect(file.type).toBe('image/jpeg')
  })

  it('refuses a page research only guessed was them, or an article', async () => {
    for (const link of [
      linkTo(bio, { identity_match_status: 'probable', reviewed_by_user: false }),
      linkTo({ ...bio, source_type: 'article' }),
    ]) {
      const { client } = fakeClient({ people: [person], source_person_links: [link] })
      expect(await saveSourcePhoto(client, 'u-1', 'p-1', 's-1')).toMatchObject({ ok: false })
    }
    expect(fetchImage).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('says so when the picture will not load, and saves nothing', async () => {
    fetchImage.mockResolvedValue({ ok: false, reason: 'http_error', status: 404 })
    const { client } = fakeClient({ people: [person], source_person_links: [linkTo(bio)] })
    expect(await saveSourcePhoto(client, 'u-1', 'p-1', 's-1')).toEqual({
      ok: false,
      error: 'That picture could not be loaded. Upload one instead.',
    })
    expect(save).not.toHaveBeenCalled()
  })
})

describe('thumbnails', () => {
  it('serves a page found for this person, and nothing for a page with no picture', async () => {
    const { client } = fakeClient({
      source_person_links: [
        linkTo({ ...bio, id: 's-2', metadata: { image: 'https://cdn.example/t.jpg' } }),
      ],
    })
    expect(await sourceThumbnail(client, 'u-1', 'p-1', 's-2')).toMatchObject({ type: 'image/jpeg' })
    const none = fakeClient({ source_person_links: [linkTo({ ...bio, id: 's-3', metadata: {} })] })
    expect(await sourceThumbnail(none.client, 'u-1', 'p-1', 's-3')).toBeNull()
  })
})
