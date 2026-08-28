import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/brand'
import { PRIVATE_PATHS } from '@/lib/seo/routes'

/**
 * robots.txt, generated rather than static.
 *
 * The file this replaces (public/robots.txt) hard-coded a Sitemap pointing at
 * a domain the site does not serve, so the one line whose whole job is to tell
 * Google where the sitemap lives sent it nowhere. Deriving the URL from the
 * brand registry means the canonical host is stated once, in the place that
 * already owns it.
 *
 * Disallow is crawl guidance, not access control. Every path below already
 * redirects an anonymous request to /sign-in; this exists so crawlers do not
 * spend budget discovering that for themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...PRIVATE_PATHS],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
