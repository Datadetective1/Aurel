import { describe, expect, it } from 'vitest'
import { classifyDocument, extractDocument, MAX_DOCUMENT_BYTES } from './document'

/**
 * Document extraction.
 *
 * The refusals matter as much as the successes: a scanned PDF that extracts to
 * nothing must say so, not save an empty source that then appears in a brief
 * as though it were evidence.
 */

/** A minimal File-like object; extractDocument only needs these four members. */
function fakeFile(name: string, type: string, contents: string | Uint8Array, size?: number) {
  const bytes = typeof contents === 'string' ? new TextEncoder().encode(contents) : contents
  return {
    name,
    type,
    size: size ?? bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }
}

describe('classifyDocument', () => {
  it('trusts the extension over a vague MIME type', () => {
    // Browsers routinely send application/octet-stream for .md and .docx.
    expect(classifyDocument('bio.pdf', 'application/octet-stream')).toBe('pdf')
    expect(classifyDocument('notes.md', 'application/octet-stream')).toBe('text')
    expect(
      classifyDocument(
        'onepager.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('docx')
  })

  it('falls back to the MIME type when there is no useful extension', () => {
    expect(classifyDocument('transcript', 'text/plain')).toBe('text')
  })

  it('refuses what it cannot read rather than guessing', () => {
    expect(classifyDocument('deck.pptx', 'application/vnd.ms-powerpoint')).toBeNull()
    expect(classifyDocument('photo.png', 'image/png')).toBeNull()
    expect(classifyDocument('archive.zip', 'application/zip')).toBeNull()
  })
})

describe('extractDocument', () => {
  it('reads plain text', async () => {
    const result = await extractDocument(
      fakeFile(
        'maya-notes.txt',
        'text/plain',
        'Maya asked for the utilisation numbers before agreeing to the headcount change.',
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.kind).toBe('text')
    expect(result.text).toContain('utilisation numbers')
    // The filename becomes a readable title.
    expect(result.title).toBe('maya notes')
    expect(result.truncated).toBe(false)
  })

  it('refuses a file over the size cap before parsing it', async () => {
    const result = await extractDocument(
      fakeFile('huge.pdf', 'application/pdf', 'x', MAX_DOCUMENT_BYTES + 1),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('too_large')
    expect(result.message).toMatch(/paste the relevant section/i)
  })

  it('names the unsupported type instead of failing silently', async () => {
    const result = await extractDocument(
      fakeFile('deck.pptx', 'application/vnd.ms-powerpoint', 'x'),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unsupported_type')
    expect(result.message).toMatch(/PDF, Word/)
  })

  it('refuses a file with too little text to be worth anything', async () => {
    const result = await extractDocument(fakeFile('empty.txt', 'text/plain', 'hi'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('empty')
  })

  it('reports a corrupt PDF as unreadable rather than throwing', async () => {
    const result = await extractDocument(
      fakeFile('broken.pdf', 'application/pdf', 'not actually a pdf at all, just text'),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(['parse_failed', 'empty', 'encrypted']).toContain(result.reason)
    // Whatever went wrong, the user is told what to do instead.
    expect(result.message).toMatch(/paste/i)
  })

  it('normalises the whitespace PDFs are famous for', async () => {
    const result = await extractDocument(
      fakeFile('spaced.txt', 'text/plain', 'Line one\r\n\r\n\r\n\r\nLine    two   with   gaps'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).not.toMatch(/\n{3,}/)
    expect(result.text).not.toMatch(/ {2,}/)
    expect(result.text).toContain('Line two with gaps')
  })

  it('truncates a very long document rather than refusing it', async () => {
    const long = 'Relevant professional context. '.repeat(20_000)
    const result = await extractDocument(fakeFile('long.txt', 'text/plain', long))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(200_000)
  })
})
