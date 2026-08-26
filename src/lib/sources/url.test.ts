import { describe, expect, it } from 'vitest'
import { canonicalUrl } from './url'
describe('canonicalUrl', () => {
  /**
   * Deduplication. Found in the first live Exa run: discovery returned both
   * the plain Wikipedia article and `?useskin=vector` for the same person, so
   * one document was fetched twice, identity-checked twice, sent to a model
   * twice and stored twice — and the footprint then counted its evidence
   * twice over. Content hashing does not catch it, because the two responses
   * differ in markup. The URL is the level the duplication lives at.
   */

  it('collapses the exact duplicate that shipped', () => {
    expect(canonicalUrl('https://en.wikipedia.org/wiki/Brendan_Eich?useskin=vector')).toBe(
      canonicalUrl('https://en.wikipedia.org/wiki/Brendan_Eich'),
    )
  })

  it('strips tracking parameters', () => {
    const clean = canonicalUrl('https://example.com/bio')
    expect(canonicalUrl('https://example.com/bio?utm_source=x&utm_campaign=y')).toBe(clean)
    expect(canonicalUrl('https://example.com/bio?fbclid=abc')).toBe(clean)
    expect(canonicalUrl('https://example.com/bio?utm_anything_new=z')).toBe(clean)
  })

  it('ignores host casing, www and fragments', () => {
    const clean = canonicalUrl('https://example.com/bio')
    expect(canonicalUrl('https://WWW.Example.com/bio')).toBe(clean)
    expect(canonicalUrl('https://example.com/bio#section')).toBe(clean)
    expect(canonicalUrl('https://example.com/bio/')).toBe(clean)
  })

  it('treats parameter order as irrelevant', () => {
    expect(canonicalUrl('https://example.com/x?b=2&a=1')).toBe(
      canonicalUrl('https://example.com/x?a=1&b=2'),
    )
  })

  it('keeps parameters that genuinely select a different page', () => {
    // The reason this is a deny list and not an allow list. Collapsing these
    // would silently discard a real second source.
    expect(canonicalUrl('https://github.com/BrendanEich?tab=projects')).not.toBe(
      canonicalUrl('https://github.com/BrendanEich'),
    )
    expect(canonicalUrl('https://youtube.com/watch?v=abc')).not.toBe(
      canonicalUrl('https://youtube.com/watch?v=xyz'),
    )
  })

  it('distinguishes genuinely different documents', () => {
    expect(canonicalUrl('https://example.com/a')).not.toBe(canonicalUrl('https://example.com/b'))
    expect(canonicalUrl('https://example.com/x')).not.toBe(canonicalUrl('https://other.com/x'))
  })

  it('cannot be used to canonicalise past the scheme check', () => {
    // It delegates to parseUrl, so a rejected scheme stays rejected rather
    // than being normalised into something fetchable.
    expect(canonicalUrl('file:///etc/passwd')).toBeNull()
    expect(canonicalUrl('javascript:alert(1)')).toBeNull()
    expect(canonicalUrl('not a url')).toBeNull()
  })

  it('keeps the root slash, which is conventional', () => {
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com/')
  })
})
