/**
 * Pure helpers for photo suggestions: which hosts are off limits, and which
 * images a page declares as its own. Kept apart from the server module so
 * they can be tested without a network.
 */

/**
 * Platforms Atturel never fetches a likeness from, whatever a page links to.
 * Their terms restrict automated access, and a profile photo there is a
 * person's choice for that platform, not for anyone's private record.
 */
const RESTRICTED = [
  'linkedin.com',
  'licdn.com',
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'cdninstagram.com',
  'x.com',
  'twitter.com',
  'twimg.com',
  'tiktok.com',
  'tiktokcdn.com',
  'threads.net',
  'snapchat.com',
  'pinterest.com',
  'pinimg.com',
  'reddit.com',
  'redditmedia.com',
  'vk.com',
  'weibo.com',
  'clearbit.com',
  'peoplefinders.com',
  'spokeo.com',
  'whitepages.com',
  'beenverified.com',
  'pimeyes.com',
]

export function isRestrictedPhotoHost(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return true
  }
  return RESTRICTED.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * The images a page declares about itself -- `og:image`, `twitter:image`, and
 * a schema.org `Person` image -- in that order, resolved against the page,
 * raster only. These are what the page's author chose to represent it; an
 * arbitrary <img> on the page is not considered, because the nearest
 * photograph on a team page is as likely to be a colleague's.
 */
export function pageImageCandidates(html: string, base: string): string[] {
  const found: string[] = []
  const metas = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const key of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image']) {
    for (const tag of metas) {
      const prop = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
      if (prop !== key) continue
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]
      if (content) found.push(content)
    }
  }

  // schema.org Person with an image, from JSON-LD.
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ??
    []) {
    const json = block.replace(/^<script[^>]*>|<\/script>$/gi, '')
    try {
      const data = JSON.parse(json) as unknown
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const n = node as Record<string, unknown>
        if (n['@type'] !== 'Person') continue
        const image = n.image
        if (typeof image === 'string') found.push(image)
        else if (
          image &&
          typeof image === 'object' &&
          typeof (image as { url?: unknown }).url === 'string'
        ) {
          found.push((image as { url: string }).url)
        }
      }
    } catch {
      // Malformed structured data is not a candidate.
    }
  }

  const resolved: string[] = []
  for (const raw of found) {
    try {
      const url = new URL(raw, base)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      if (/\.svg(\?|#|$)/i.test(url.pathname)) continue
      resolved.push(url.toString())
    } catch {
      // Unparseable.
    }
  }
  return [...new Set(resolved)].slice(0, 3)
}
