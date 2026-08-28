import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/brand'
import { PUBLIC_PATHS } from '@/lib/seo/routes'

/**
 * The public marketing surface, and nothing else.
 *
 * There was no sitemap at all — /sitemap.xml answered 404 while robots.txt
 * advertised one on another domain. Only the four marketing pages belong here:
 * every other route is either signed-in, or an auth screen carrying noindex.
 *
 * No dynamic person or meeting URLs will ever be appropriate here. Those paths
 * contain private relationship information and are gated at the layout.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency: path === '/' ? ('weekly' as const) : ('monthly' as const),
    priority: path === '/' ? 1 : 0.7,
  }))
}
