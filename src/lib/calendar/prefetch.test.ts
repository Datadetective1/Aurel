import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep as pathSep } from 'node:path'

/**
 * next/link and endpoints that do something.
 *
 * Link prefetches its href. That is free for a page and actively harmful for a
 * route handler with a side effect: pointing one at the calendar connect
 * endpoint meant merely loading Today executed the OAuth start -- minting
 * state, firing calendar_connect_started, and redirecting to Microsoft --
 * before anyone clicked. Observed on production: the event landed at the
 * moment the page rendered, so every visit counted as a connection attempt and
 * the funnel showed connection almost never converting.
 *
 * Anything under /api does something. It gets a plain anchor.
 */

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (/[.]tsx$/.test(entry) && !/[.]test[.]tsx$/.test(entry)) out.push(full)
  }
  return out
}

describe('links to API routes', () => {
  const files = filesUnder(join(process.cwd(), 'src'))

  it('finds components to check, so an empty pass is impossible', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("never uses next/link for a route that isn't a page", () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // <Link href="/api/..."> or <Link href={`/api/...`}> or href={'/api/...'}
      if (/<Link\s[^>]*href=\{?[\`'"]\/api\//.test(source)) {
        offenders.push(file.slice(process.cwd().length).split(pathSep).join('/'))
      }
    }

    expect(offenders).toEqual([])
  })
})
