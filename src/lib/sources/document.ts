import 'server-only'
import { logger } from '@/lib/logger'
import { MAX_DOCUMENT_BYTES } from './document.client'

/**
 * DOCUMENT EXTRACTION
 * =============================================================================
 * Turns an uploaded file into plain text, so it can go down exactly the same
 * path as a pasted transcript: identity resolution, fact extraction, citation,
 * user confirmation. Nothing about a document is special once it is text.
 *
 * Three formats, chosen because they are what a professional actually has to
 * hand: a PDF one-pager or bio, a Word document, or plain text. Anything else
 * is refused by name rather than silently producing nothing.
 *
 * Everything here treats file content as UNTRUSTED. A PDF can carry text
 * designed to read as an instruction, so the extracted text is fenced before it
 * reaches a model, the same as a fetched web page.
 * =============================================================================
 */

export { MAX_DOCUMENT_BYTES } from './document.client'

/** Beyond this the document is truncated rather than refused. */
const MAX_EXTRACTED_CHARS = 200_000

/** Pages beyond this are ignored: a 400-page report is not meeting context. */
const MAX_PDF_PAGES = 80

export type DocumentKind = 'pdf' | 'docx' | 'text'

export type DocumentExtraction =
  | {
      ok: true
      kind: DocumentKind
      text: string
      title: string | null
      /** True when the document was longer than we are willing to read. */
      truncated: boolean
      pageCount: number | null
    }
  | {
      ok: false
      reason: 'too_large' | 'unsupported_type' | 'empty' | 'encrypted' | 'parse_failed'
      /** Shown to the user. Says what to do, not what went wrong internally. */
      message: string
    }

const PDF_TYPES = new Set(['application/pdf'])
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
])

/**
 * Classify by extension first, MIME second.
 *
 * Browsers disagree about the MIME type of a .md file and several send
 * `application/octet-stream` for anything they do not recognise, so the
 * filename is the more reliable signal in practice.
 */
export function classifyDocument(fileName: string, mimeType: string): DocumentKind | null {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

  if (extension === 'pdf' || PDF_TYPES.has(mimeType)) return 'pdf'
  if (extension === 'docx' || DOCX_TYPES.has(mimeType)) return 'docx'
  if (['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm'].includes(extension)) return 'text'
  if (TEXT_TYPES.has(mimeType)) return 'text'

  return null
}

/** A readable title from the filename, when the document declares none. */
function titleFromFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Document'
  )
}

export async function extractDocument(file: {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}): Promise<DocumentExtraction> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: `That file is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB. Paste the relevant section instead.`,
    }
  }

  const kind = classifyDocument(file.name, file.type)
  if (!kind) {
    return {
      ok: false,
      reason: 'unsupported_type',
      message:
        'That file type is not supported. PDF, Word (.docx) and plain text work — for anything else, paste the text.',
    }
  }

  try {
    const buffer = await file.arrayBuffer()

    if (kind === 'text') {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
      return finalise(kind, text, titleFromFileName(file.name), null)
    }

    if (kind === 'pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text, totalPages } = await extractText(pdf, { mergePages: true })
      const merged = Array.isArray(text) ? text.join('\n') : text

      // A PDF of scanned images extracts as nothing. Saying "no readable text"
      // is more useful than saving an empty source.
      if (merged.trim().length < 20) {
        return {
          ok: false,
          reason: 'empty',
          message:
            'That PDF has no readable text — it is probably a scan or images. Paste the text instead.',
        }
      }

      return finalise(kind, merged, titleFromFileName(file.name), totalPages ?? null)
    }

    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return finalise(kind, result.value, titleFromFileName(file.name), null)
  } catch (error) {
    // Never log the document body: it is exactly the private material this
    // product exists to protect.
    logger.warn('document.extract_failed', {
      kind,
      error: error instanceof Error ? error.name : 'unknown',
    })

    const encrypted = error instanceof Error && /password|encrypt/i.test(error.message)

    return encrypted
      ? {
          ok: false,
          reason: 'encrypted',
          message: 'That document is password protected, so it cannot be read.',
        }
      : {
          ok: false,
          reason: 'parse_failed',
          message: 'That document could not be read. Paste the relevant text instead.',
        }
  }
}

function finalise(
  kind: DocumentKind,
  raw: string,
  title: string,
  pageCount: number | null,
): DocumentExtraction {
  // Collapse the whitespace PDFs are famous for without destroying paragraphs.
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (cleaned.length < 20) {
    return {
      ok: false,
      reason: 'empty',
      message: 'There was not enough readable text in that file to work with.',
    }
  }

  const truncated = cleaned.length > MAX_EXTRACTED_CHARS
  const cappedPages = pageCount !== null ? Math.min(pageCount, MAX_PDF_PAGES) : null

  return {
    ok: true,
    kind,
    text: truncated ? cleaned.slice(0, MAX_EXTRACTED_CHARS) : cleaned,
    title,
    truncated,
    pageCount: cappedPages,
  }
}
