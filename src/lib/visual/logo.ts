/**
 * COMPANY LOGOS
 * =============================================================================
 * A logo is shown only where the organisation's own domain is on record --
 * `organizations.domain`, which the user or research wrote. The image is read
 * from that domain and nowhere else, through Atturel's own server, so:
 *
 *   - the browser never tells a third-party logo service which companies the
 *     user is preparing for, and never pings the company itself;
 *   - fetching goes through the SSRF-hardened fetcher like every other outbound
 *     read;
 *   - a missing, broken or refused logo is a monogram, never a guess.
 *
 * No domain, no logo. A company name alone is not identity enough to put a
 * mark beside it -- two companies share most names.
 * =============================================================================
 */

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * The bare registrable host from whatever was stored -- "https://www.bell.ca/",
 * "Bell.ca", "www.bell.ca" -- or null when it is not a public hostname.
 * IP literals, localhost and single-label names are refused outright.
 */
export function normaliseDomain(value: string | null | undefined): string | null {
  if (!value) return null
  let host = value.trim().toLowerCase()
  if (!host) return null
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  host = host.split(/[/?#]/)[0] ?? ''
  host = host.replace(/:\d+$/, '').replace(/\.$/, '')
  if (host.includes('@')) return null
  host = host.replace(/^www\./, '')
  if (!HOSTNAME.test(host)) return null
  if (/^\d+(\.\d+){3}$/.test(host)) return null
  return host
}

/** The app-relative URL the logo is served from, or null when there is no trusted domain. */
export function logoPath(domain: string | null | undefined): string | null {
  const host = normaliseDomain(domain)
  return host ? `/api/logo?domain=${encodeURIComponent(host)}` : null
}

/** One or two letters for the monogram fallback: "Bell" -> "B", "Acme Corp" -> "AC". */
export function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(inc|llc|ltd|corp|co|the|plc|gmbh|sa)$/i.test(w))
  if (words.length === 0) return name.trim().slice(0, 1).toUpperCase() || '?'
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase()
  return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase()
}

/** Icon hrefs declared in a page's markup, touch icons first, SVG excluded. */
export function declaredIcons(html: string, base: string): string[] {
  const links = html.match(/<link\b[^>]*>/gi) ?? []
  const found: { href: string; weight: number }[] = []
  for (const tag of links) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? ''
    if (!/\bicon\b|apple-touch-icon/.test(rel)) continue
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!href || /\.svg(\?|#|$)/i.test(href) || /^data:/i.test(href)) continue
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    if (/svg/i.test(type)) continue
    const size = Number(tag.match(/\bsizes\s*=\s*["'](\d+)x\d+["']/i)?.[1] ?? 0)
    const weight = (rel.includes('apple-touch-icon') ? 1000 : 0) + Math.min(size, 512)
    try {
      found.push({ href: new URL(href, base).toString(), weight })
    } catch {
      // An unparseable href is simply not a candidate.
    }
  }
  return found.sort((a, b) => b.weight - a.weight).map((f) => f.href)
}
