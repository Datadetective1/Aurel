import { describe, expect, it } from 'vitest'
import { sampleFace } from './faces'

describe('sampleFace', () => {
  it('reads an old drawing path as the photo', () => {
    expect(sampleFace('/demo/faces/maya.svg')).toBe('/demo/faces/maya.webp')
  })

  it('leaves photos and other links alone', () => {
    expect(sampleFace('/demo/faces/maya.webp')).toBe('/demo/faces/maya.webp')
    expect(sampleFace('https://example.com/a.svg')).toBe('https://example.com/a.svg')
    expect(sampleFace('/people/elena-marsh.webp')).toBe('/people/elena-marsh.webp')
  })
})
