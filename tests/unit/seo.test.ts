import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { seoTitle, siteUrl } from '@/lib/brand'
import { NOINDEX_PATHS, PRIVATE_PATHS, PUBLIC_PATHS } from '@/lib/seo/routes'

/**
 * INDEXING SAFETY
 * =============================================================================
 * Three failures this locks down, all of which had actually shipped:
 *
 *   1. robots.txt advertised a Sitemap on a domain the site does not serve, so
 *      the single line whose job is to point Google at the sitemap pointed it
 *      at nothing.
 *   2. /sitemap.xml did not exist at all.
 *   3. Every unknown URL answered 307 -> /sign-in -> 200 rather than 404, so a
 *      crawler asking for a page that does not exist was told one does.
 *
 * The expensive failure is not any of those, though — it is a private route
 * reaching the sitemap. These pages contain notes about named colleagues, and
 * a URL published to Google cannot be recalled. Hence the assertions below run
 * from the same registry the real routes are built from.
 * =============================================================================
 */

describe('sitemap', () => {
  const entries = sitemap()
  const urls = entries.map((e) => e.url)

  it('lists every public marketing page', () => {
    expect(urls).toEqual(PUBLIC_PATHS.map((p) => `${siteUrl}${p === '/' ? '/' : p}`))
  })

  it('uses absolute URLs on the canonical host', () => {
    for (const url of urls) {
      expect(url.startsWith(`${siteUrl}/`)).toBe(true)
    }
  })

  it('never exposes a private application route', () => {
    for (const url of urls) {
      const path = url.slice(siteUrl.length)
      for (const priv of PRIVATE_PATHS) {
        expect(path === priv || path.startsWith(`${priv}/`)).toBe(false)
      }
    }
  })

  it('never exposes an auth screen', () => {
    for (const noindex of NOINDEX_PATHS) {
      expect(urls).not.toContain(`${siteUrl}${noindex}`)
    }
  })

  it('contains no dynamic person or meeting URLs', () => {
    for (const url of urls) {
      expect(url).not.toMatch(/\/(people|meetings)\//)
    }
  })
})

describe('robots', () => {
  const result = robots()
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules

  it('points at a sitemap on the canonical host', () => {
    expect(result.sitemap).toBe(`${siteUrl}/sitemap.xml`)
  })

  it('does not block the whole site', () => {
    const disallow = [rules?.disallow ?? []].flat()
    expect(disallow).not.toContain('/')
    expect(rules?.allow).toBe('/')
  })

  it('disallows every private application root', () => {
    const disallow = [rules?.disallow ?? []].flat()
    for (const priv of PRIVATE_PATHS) {
      expect(disallow).toContain(priv)
    }
  })
})

describe('metadata', () => {
  it('gives the homepage a title that names the category, not just the tagline', () => {
    const t = seoTitle()
    expect(t).toMatch(/relationship intelligence/i)
    // Google truncates around 60 characters; a title that names the product
    // and then gets cut off has spent its budget on nothing.
    expect(t.length).toBeLessThanOrEqual(60)
  })
})

describe('middleware', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'middleware.ts'), 'utf8')

  it('gates on a private denylist so unknown paths can reach the 404', () => {
    // The inverse (an allowlist of public paths) turns every mistyped URL into
    // a soft 404. If this assertion is failing because the list was inverted
    // back, read the comment in middleware.ts before changing the test.
    expect(source).toContain('PRIVATE_PREFIXES')
    expect(source).not.toContain('PUBLIC_PREFIXES')
  })

  it('guards the same roots robots.txt disallows', () => {
    const listed = source.slice(
      source.indexOf('const PRIVATE_PREFIXES'),
      source.indexOf('function isPrivate'),
    )
    // /api and /auth are route handlers, not pages: robots keeps crawlers out
    // of them but middleware has no session redirect to apply.
    for (const priv of PRIVATE_PATHS.filter((p) => p !== '/api' && p !== '/auth')) {
      expect(listed).toContain(`'${priv}'`)
    }
  })
})
