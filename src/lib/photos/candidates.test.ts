import { describe, expect, it } from 'vitest'
import { isRestrictedPhotoHost, pageImageCandidates } from './candidates'

describe('photo candidates', () => {
  it('never treats a restricted platform as a source', () => {
    for (const url of [
      'https://www.linkedin.com/in/someone',
      'https://media.licdn.com/dms/image/x.jpg',
      'https://scontent.fbcdn.net/x.jpg',
      'https://www.instagram.com/p/x',
      'https://pbs.twimg.com/profile_images/x.jpg',
      'https://x.com/someone',
      'not a url',
    ]) {
      expect(isRestrictedPhotoHost(url)).toBe(true)
    }
    expect(isRestrictedPhotoHost('https://bell.ca/leadership/columbus')).toBe(false)
  })

  it('reads only what a page declares about itself, raster only', () => {
    const html = `
      <meta property="og:image" content="/people/columbus.jpg">
      <meta name="twitter:image" content="https://cdn.bell.ca/columbus-card.png">
      <meta property="og:image" content="/logo.svg">
      <img src="/colleague.jpg">
      <script type="application/ld+json">{"@type":"Person","image":{"url":"https://bell.ca/p/c.webp"}}</script>`
    expect(pageImageCandidates(html, 'https://bell.ca/leadership/columbus')).toEqual([
      'https://bell.ca/people/columbus.jpg',
      'https://cdn.bell.ca/columbus-card.png',
      'https://bell.ca/p/c.webp',
    ])
  })

  it('ignores malformed structured data and non-person nodes', () => {
    const html = `<script type="application/ld+json">{oops</script>
      <script type="application/ld+json">{"@type":"Organization","image":"https://bell.ca/o.png"}</script>`
    expect(pageImageCandidates(html, 'https://bell.ca/')).toEqual([])
  })
})
