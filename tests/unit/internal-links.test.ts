import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY INTERNAL LINK POINTS AT A ROUTE THAT EXISTS
 * =============================================================================
 * This exists because the same defect shipped twice.
 *
 * `/people/[id]/log` and `/people/[id]/edit` were both linked from the person
 * page — the primary action row and the header gear — and neither route had
 * ever been written. In both cases the server action behind the page was
 * complete and simply had no caller, so nothing failed at build time and
 * nothing failed in a test.
 *
 * They also failed quietly in use: Next prefetches links, so the 404 landed in
 * the browser console rather than under anyone's cursor. You had to be reading
 * console output from a live page to notice, which is exactly the kind of
 * checking that does not happen reliably.
 *
 * A dead link to a route that does not exist is a broken feature, so this fails
 * the build instead.
 * =============================================================================
 */

const APP = join(process.cwd(), 'src', 'app')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** Route paths Next will actually serve, with group segments removed. */
function routes(): Set<string> {
  const found = new Set<string>()
  for (const file of walk(APP)) {
    // Pages and route handlers both. An API route is a real destination -- a
    // link to a missing one is exactly as broken as a link to a missing page --
    // and leaving them out made the test report a working endpoint as dead.
    //
    // basename, not a regex: the separator differs by platform and a regex that
    // only matched '/' silently found no routes at all on Windows.
    const name = basename(file)
    if (name !== 'page.tsx' && name !== 'route.ts') continue
    const path = relative(APP, file)
      .split(sep)
      .slice(0, -1)
      .filter((segment) => !segment.startsWith('(')) // (app), (auth), (marketing)
      .join('/')
    found.add('/' + path)
  }
  found.delete('//')
  return found
}

/**
 * Internal targets, from both `href="..."` in JSX and `href: '...'` in the nav
 * config objects. Template holes become `[id]` so they compare against the
 * dynamic segment rather than against a runtime value.
 */
function linkTargets(): Map<string, string[]> {
  const targets = new Map<string, string[]>()
  const sources = [
    ...walk(join(process.cwd(), 'src', 'app')),
    ...walk(join(process.cwd(), 'src', 'components')),
  ].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

  const patterns = [/href=\{?[`'"]([^`'"]+)[`'"]/g, /href:\s*[`'"]([^`'"]+)[`'"]/g]

  for (const file of sources) {
    const contents = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of contents.matchAll(pattern)) {
        const raw = match[1]
        if (!raw?.startsWith('/')) continue // external, mailto:, tel:, #anchor

        const normalised = raw
          // Any template hole is a dynamic segment. Which one it is called in
          // the file tree -- [id], [provider] -- is not knowable from the call
          // site, so both sides are reduced to the same placeholder below.
          .replace(/\$\{[^}]+\}/g, '[dynamic]')
          .replace(/[?#].*$/, '')
          .replace(/\/$/, '')

        if (normalised === '') continue // the landing page
        const where = targets.get(normalised) ?? []
        where.push(relative(process.cwd(), file))
        targets.set(normalised, where)
      }
    }
  }
  return targets
}

describe('internal links', () => {
  const known = routes()

  it('finds the route tree, so an empty pass is impossible', () => {
    // Without this, a broken walk would make every assertion below vacuous.
    expect(known.size).toBeGreaterThan(20)
    expect(known.has('/today')).toBe(true)
    expect(known.has('/people/[id]')).toBe(true)
  })

  it('finds links to check, so an empty pass is impossible', () => {
    expect(linkTargets().size).toBeGreaterThan(15)
  })

  it('never points at a route that does not exist', () => {
    const dead: string[] = []
    for (const [target, files] of linkTargets()) {
      // A dynamic segment in the route matches whatever stands in that
      // position in the link -- a template hole, or a literal like `microsoft`
      // for [provider]. Reducing both sides to a token only handled the first,
      // so a perfectly good link written out in full was reported dead.
      const matches = (route: string) => {
        const a = route.split('/')
        const b = target.split('/')
        if (a.length !== b.length) return false
        return a.every((segment, i) => segment.startsWith('[') || segment === b[i])
      }
      if (![...known].some(matches)) {
        dead.push(`${target}  <-  ${[...new Set(files)].join(', ')}`)
      }
    }

    expect(dead, `Links with no route behind them:\n${dead.join('\n')}`).toEqual([])
  })
})
