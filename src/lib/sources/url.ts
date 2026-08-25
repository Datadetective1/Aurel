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
