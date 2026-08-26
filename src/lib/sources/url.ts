/**
 * URL parsing and input classification.
 *
 * Deliberately free of `server-only` and of any Node built-ins: the Universal
 * Add Context field classifies what the user is typing as they type, so this
 * has to run in the browser as well as on the server. The network-touching
 * parts (DNS checks, fetching) stay in fetch.ts, which is server-only.
 */

/**
 * Parse and scheme-check a user-supplied URL.
 *
 * Returns null for anything that is not plain http/https. Note the scheme check
 * happens BEFORE the bare-domain convenience: prepending `https://` to input
 * that already carries a scheme would silently rewrite `file:///etc/passwd`
 * into the fetchable `https://file///etc/passwd`, turning a rejected scheme
 * into an accepted request.
 */
export function parseUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') return null
  }

  try {
    const withScheme = schemeMatch ? trimmed : `https://${trimmed}`
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    // A hostname with no dot is not a real public host.
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url
  } catch {
    return null
  }
}

/**
 * Query parameters that never identify a different page.
 *
 * Everything here is tracking or presentation. Deliberately a deny list rather
 * than an allow list: `?tab=projects` on GitHub and `?v=` on YouTube are
 * genuinely different pages, and stripping all parameters would collapse them
 * into one.
 */
const NOISE_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'referrer',
  's_cid',
  'spm',
  // Wikipedia skin selection. This one is not hypothetical: discovery returned
  // both the plain article and `?useskin=vector`, so the same page was fetched
  // twice, identity-checked twice, sent to a model twice, and stored twice --
  // and the footprint then counted its own evidence twice over.
  'useskin',
]

/**
 * The canonical form of a URL, for deduplication.
 *
 * Two discovery results that differ only in tracking parameters, host casing,
 * a fragment or a trailing slash are the same document, and paying to fetch and
 * extract it twice is worse than wasteful: the footprint double-counts what is
 * really one source.
 *
 * Content hashing does not catch this. The two Wikipedia responses differed in
 * markup because the skin differed, so their hashes differed too. The URL is
 * the level the duplication actually lives at.
 *
 * Returns null for anything `parseUrl` rejects, so callers cannot accidentally
 * canonicalise their way past the scheme check.
 */
export function canonicalUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null

  url.hash = ''
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')

  for (const param of NOISE_PARAMS) url.searchParams.delete(param)
  // Anything beginning utm_ that is not in the list above.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
  }
  // Sorted so ?a=1&b=2 and ?b=2&a=1 agree.
  url.searchParams.sort()

  // A trailing slash on a path is not a different document. On the root it is
  // conventional, so it stays.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}

/** What kind of thing did the user paste into Add Context? */
export type InputKind = 'url' | 'transcript' | 'note'

/**
 * Classify pasted input so the user never has to choose an import type.
 * Runs on every keystroke in the browser, so it stays cheap and allocation-light.
 */
export function detectInputKind(raw: string): InputKind {
  const trimmed = raw.trim()

  // A single token that parses as a URL is a link, not prose.
  if (!/\s/.test(trimmed) && parseUrl(trimmed)) return 'url'

  const lines = trimmed.split('\n')
  // Transcript markers: repeated "Speaker:" line starts, or leading timestamps.
  const speakerLines = lines.filter((l) => /^\s*[A-Z][A-Za-z .'-]{1,40}\s*:\s+\S/.test(l)).length
  const timestampLines = lines.filter((l) => /^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?/.test(l)).length
  if (lines.length >= 6 && (speakerLines >= 3 || timestampLines >= 3)) return 'transcript'

  return 'note'
}
