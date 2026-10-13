import type { NextRequest } from 'next/server'
import { getOptionalUser } from '@/lib/auth'
import { declaredIcons, normaliseDomain } from '@/lib/visual/logo'
import { safeFetch, safeFetchImage } from '@/lib/sources/fetch'

export const runtime = 'nodejs'

/**
 * COMPANY LOGO, FROM THE COMPANY'S OWN DOMAIN
 * =============================================================================
 * Why a route: the image has to come through Atturel's server so the browser
 * never tells a third party -- a logo service, or the company itself -- which
 * organisations the user is preparing to meet. See `lib/visual/logo`.
 *
 * Signed-in users only, so this is not an open image proxy. Only the domain
 * itself is ever contacted, through the same SSRF-hardened fetcher research
 * uses, and only raster images whose bytes match their type are returned:
 * SVG is refused, because served from this origin it is a document.
 *
 * Order tried: the site's declared touch icon or icon in its homepage markup,
 * then /apple-touch-icon.png, then /favicon.ico. A miss is a transparent
 * pixel, which the client turns into a monogram; it is cached too, so a company without a
 * usable icon costs one lookup a day rather than one per render.
 * =============================================================================
 */

type Entry = { bytes: Uint8Array; type: string } | null
const CACHE = new Map<string, { at: number; entry: Entry }>()
const EMPTY_PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
)
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 500

function remember(domain: string, entry: Entry) {
  if (CACHE.size >= MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value
    if (oldest) CACHE.delete(oldest)
  }
  CACHE.set(domain, { at: Date.now(), entry })
}

async function findLogo(domain: string): Promise<Entry> {
  const origin = `https://${domain}`
  // Every hop, redirects included, must stay on the organisation's own domain.
  const ownDomain = (host: string) => {
    const h = host.toLowerCase().replace(/^www\./, '')
    return h === domain || h.endsWith(`.${domain}`)
  }
  const candidates: string[] = []

  const home = await safeFetch(`${origin}/`, { allowHost: ownDomain })
  if (home.ok && home.contentType.includes('html')) {
    candidates.push(...declaredIcons(home.body.slice(0, 200_000), home.finalUrl).slice(0, 2))
  }
  candidates.push(`${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`)

  for (const url of [...new Set(candidates)]) {
    // Only the organisation's own domain (or its subdomains) is trusted.
    let host: string
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (host !== domain && !host.endsWith(`.${domain}`)) continue

    const image = await safeFetchImage(url, 512 * 1024, ownDomain)
    if (image.ok && image.bytes.byteLength > 100) {
      return { bytes: image.bytes, type: image.contentType }
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const user = await getOptionalUser()
  if (!user)
    return new Response(EMPTY_PIXEL as unknown as BodyInit, {
      status: 200,
      headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' },
    })

  const domain = normaliseDomain(request.nextUrl.searchParams.get('domain'))
  if (!domain) return new Response(null, { status: 400 })

  const cached = CACHE.get(domain)
  let entry: Entry
  if (cached && Date.now() - cached.at < TTL_MS) {
    entry = cached.entry
  } else {
    entry = await findLogo(domain).catch(() => null)
    remember(domain, entry)
  }

  const headers = {
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  }

  // No logo is an answer, not an error: a 1x1 transparent pixel the mark reads
  // as "use the monogram", so the console stays clean for every company
  // without a usable icon.
  if (!entry) {
    return new Response(EMPTY_PIXEL as unknown as BodyInit, {
      status: 200,
      headers: { ...headers, 'content-type': 'image/gif', 'x-atturel-logo': 'none' },
    })
  }
  return new Response(entry.bytes as unknown as BodyInit, {
    status: 200,
    headers: { ...headers, 'content-type': entry.type },
  })
}
