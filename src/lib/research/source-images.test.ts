import { describe, expect, it } from 'vitest'
import { offersPhoto, photoSkippedFor, sourceImageUrl, withPhotoSkipped } from './source-images'

/**
 * A PAGE'S PICTURE
 * =============================================================================
 * Shown small beside the page, and offered as a photo only for a bio or
 * speaker page the user said is them. Who is in a picture is never decided by
 * looking at it.
 * =============================================================================
 */

const offer = (over: Partial<Parameters<typeof offersPhoto>[0]> = {}) =>
  offersPhoto({
    state: 'kept',
    reviewed: true,
    sourceType: 'company_bio',
    metadata: { image: 'https://northwind.example/team/dana.jpg' },
    personId: 'p-1',
    personHasPhoto: false,
    ...over,
  })

describe('the lead image a page declares', () => {
  it('takes a plain web address', () => {
    expect(sourceImageUrl({ image: 'https://cdn.example/a.jpg' })).toBe('https://cdn.example/a.jpg')
  })

  it('refuses vector images, other schemes, restricted platforms and junk', () => {
    expect(sourceImageUrl({ image: 'https://cdn.example/a.svg' })).toBeNull()
    expect(sourceImageUrl({ image: 'data:image/png;base64,AAAA' })).toBeNull()
    expect(sourceImageUrl({ image: 'javascript:alert(1)' })).toBeNull()
    expect(sourceImageUrl({ image: 'https://media.licdn.com/p.jpg' })).toBeNull()
    expect(sourceImageUrl({ image: 'https://user:pw@cdn.example/a.jpg' })).toBeNull()
    expect(sourceImageUrl({ image: 42 })).toBeNull()
    expect(sourceImageUrl(null)).toBeNull()
  })
})

describe('offering the picture as their photo', () => {
  it('offers a bio or speaker page the user said is them', () => {
    expect(offer()).toBe(true)
    expect(offer({ sourceType: 'conference' })).toBe(true)
  })

  it('never offers an article’s picture, which is as likely to be someone else', () => {
    expect(offer({ sourceType: 'article' })).toBe(false)
    expect(offer({ sourceType: 'public_web' })).toBe(false)
  })

  it('needs the user’s own "This is them", not research’s guess', () => {
    expect(offer({ reviewed: false })).toBe(false)
    expect(offer({ state: 'waiting', reviewed: false })).toBe(false)
    expect(offer({ state: 'rejected' })).toBe(false)
  })

  it('does not offer over a photo they have, or one they skipped', () => {
    expect(offer({ personHasPhoto: true })).toBe(false)
    const skipped = withPhotoSkipped({ image: 'https://northwind.example/team/dana.jpg' }, 'p-1')
    expect(offer({ metadata: skipped })).toBe(false)
    // Skipped for one person, still offered for another the page is about.
    expect(offer({ metadata: skipped, personId: 'p-2' })).toBe(true)
  })

  it('keeps the rest of the page’s metadata when recording a skip', () => {
    const next = withPhotoSkipped({ wordCount: 300, photoSkippedFor: ['p-2'] }, 'p-1')
    expect(next.wordCount).toBe(300)
    expect(photoSkippedFor(next).sort()).toEqual(['p-1', 'p-2'])
    expect(photoSkippedFor(withPhotoSkipped(next, 'p-1'))).toHaveLength(2)
  })
})
