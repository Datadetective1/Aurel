import 'server-only'
import { createHash } from 'node:crypto'

/**
 * CONTENT EXTRACTION
 * =============================================================================
 * Turns fetched markup into plain text plus whatever metadata the page declared
 * about itself. Deliberately dependency-free and conservative:
 *
 *   - script, style, nav, header, footer and form content is dropped entirely,
 *     both because it is noise and because <script> is the most likely place to
 *     find an injection payload
 *   - entities are decoded AFTER tag stripping, so a decoded "<" can never
 *     reintroduce markup
 *   - output is plain text only; nothing downstream ever renders it as HTML
 * =============================================================================
 */

export interface ExtractedContent {
  title: string | null
  /** Cleaned plain text, whitespace-normalised. */
  text: string
  /** Author from meta tags or JSON-LD, when the page declares one. */
  author: string | null
  publisher: string | null
  publishedAt: string | null
  description: string | null
  /** sha256 of the normalised text, for dedupe and change detection. */
  contentHash: string
  wordCount: number
}

/** Blocks whose contents are never useful and often hostile. */
const STRIP_BLOCKS =
  /<(script|style|noscript|template|svg|canvas|iframe|object|embed|form|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi

/** Self-closing / void elements that carry no text. */
const STRIP_VOID = /<(?:link|meta|input|br|hr|img|source|track)\b[^>]*\/?>/gi

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ccedil: 'ç',
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match)
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const value = decodeEntities(match[1]).trim()
      if (value) return value.slice(0, 300)
    }
  }
  return null
}

/** Extract readable text and declared metadata from an HTML document. */
export function extractFromHtml(html: string, url?: string): ExtractedContent {
  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]) ?? null

  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ])

  const author = metaContent(html, [
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i,
    /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
  ])

  const publisher =
    metaContent(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /"publisher"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
    ]) ?? (url ? safeHostname(url) : null)

  // Only accept an EXPLICIT publication declaration.
  //
  // A bare <time datetime> was previously used as a fallback, but that matches
  // any date in the body — an infobox birth date, a cited article, a footnote.
  // The value drives the "as of" freshness label on facts, so a wrong one is
  // worse than none: it presents today's finding as years out of date.
  const publishedAt = metaContent(html, [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:date|pubdate|publish[-_]?date)["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+(?:pubdate|itemprop=["']datePublished["'])[^>]*datetime=["']([^"']+)["']/i,
  ])

  // Strip hostile/noisy blocks first, then remaining tags, then decode.
  const withoutBlocks = html.replace(STRIP_BLOCKS, ' ').replace(STRIP_VOID, ' ')
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
  const stripped = stripTags(withBreaks)
  const text = normaliseWhitespace(decodeEntities(stripped))

  return {
    title: title ? title.slice(0, 300) : null,
    text,
    author,
    publisher,
    publishedAt: normaliseDate(publishedAt),
    description,
    contentHash: hashContent(text),
    wordCount: text ? text.split(/\s+/).length : 0,
  }
}

/** Extraction for plain-text and markdown sources. */
export function extractFromText(raw: string, title?: string | null): ExtractedContent {
  const text = normaliseWhitespace(raw)
  return {
    title: title?.slice(0, 300) ?? null,
    text,
    author: null,
    publisher: null,
    publishedAt: null,
    description: null,
    contentHash: hashContent(text),
    wordCount: text ? text.split(/\s+/).length : 0,
  }
}

/**
 * Remove tags, respecting quoted attribute values.
 *
 * The obvious `/<[^>]+>/g` is wrong: an attribute value may itself contain ">".
 * Real pages do this constantly — Wikipedia embeds JSON in data attributes — and
 * a naive stripper terminates the tag early, spilling raw markup and JSON into
 * the extracted text. That garbage then gets extracted as "facts" about a
 * person, which is far worse than missing the content entirely.
 */
function stripTags(input: string): string {
  let out = ''
  let i = 0
  const n = input.length

  while (i < n) {
    const lt = input.indexOf('<', i)
    if (lt === -1) {
      out += input.slice(i)
      break
    }
    out += input.slice(i, lt)

    // Walk the tag, tracking quote state so a ">" inside an attribute value
    // does not end it prematurely.
    let j = lt + 1
    let quote: string | null = null
    while (j < n) {
      const ch = input[j]!
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      j++
    }

    out += ' '
    i = j + 1
  }

  return out
}

function normaliseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Classify a URL into a source type from its shape alone. Cheap, and good enough
 * to pick the right adapter and to label the source before it is fetched.
 */
export function classifyUrl(url: string): {
  sourceType:
    | 'github'
    | 'video'
    | 'podcast'
    | 'article'
    | 'conference'
    | 'company_bio'
    | 'social_public'
    | 'public_web'
  hint: string | null
} {
  let host = ''
  let path = ''
  try {
    const parsed = new URL(url)
    host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    path = parsed.pathname.toLowerCase()
  } catch {
    return { sourceType: 'public_web', hint: null }
  }

  if (host === 'github.com' || host.endsWith('.github.io')) {
    return { sourceType: 'github', hint: 'Code and open-source activity' }
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'vimeo.com') {
    return { sourceType: 'video', hint: 'Video appearance' }
  }
  if (/podcast|anchor\.fm|buzzsprout|simplecast|transistor\.fm/.test(host) || path.includes('/podcast')) {
    return { sourceType: 'podcast', hint: 'Podcast appearance' }
  }
  if (host === 'x.com' || host === 'twitter.com' || host === 'mastodon.social') {
    return { sourceType: 'social_public', hint: 'Public social post' }
  }
  if (/\/(leadership|team|about|our-people|people|management|board|staff|bio)\b/.test(path)) {
    return { sourceType: 'company_bio', hint: 'Official company biography' }
  }
  if (/\/(speakers?|agenda|sessions?|programme|program|conference|summit|event)\b/.test(path)) {
    return { sourceType: 'conference', hint: 'Conference or event page' }
  }
  if (/\/(blog|news|article|press|insights|posts?|\d{4}\/\d{2})\b/.test(path)) {
    return { sourceType: 'article', hint: 'Article or press item' }
  }
  return { sourceType: 'public_web', hint: null }
}
