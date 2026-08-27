import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep as pathSep } from 'node:path'

/**
 * Ambient locale formatting in client components.
 *
 * A client component renders twice -- once on the server, once at hydration.
 * `toLocaleTimeString(undefined, ...)` means "whatever this runtime is", which
 * is en-US/UTC on the server and the browser's own settings on the client. The
 * two disagree, React discards the server HTML and re-renders, and #418 fires
 * in production where the message is minified and nobody is looking.
 *
 * It has now happened three times: person pages, the Capabilities calendar row,
 * and Today's upcoming meetings. Twice it reached production. A grep is a
 * blunter instrument than a unit test but it is the one that catches the fourth
 * occurrence, which will be written by someone who never read this file.
 *
 * The fix is always the same shape: pin the locale AND the time zone, or format
 * on the server and pass the string down.
 */

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('client components never format with an ambient locale', () => {
  it('finds no toLocale* call passing undefined as the locale', () => {
    const offenders: string[] = []

    for (const file of tsxFilesUnder(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8')
      if (!/^['"]use client['"]/m.test(source)) continue

      // toLocaleDateString(undefined, ...) / toLocaleTimeString(undefined, ...)
      if (/toLocale\w*\(\s*undefined\s*,/.test(source)) {
        offenders.push(file.slice(process.cwd().length).split(pathSep).join('/'))
      }
    }

    expect(offenders).toEqual([])
  })

  it('checked a meaningful number of client components, not zero', () => {
    // Guards the guard: a broken walk or a changed directive style would make
    // the assertion above pass by examining nothing.
    const clients = tsxFilesUnder(join(process.cwd(), 'src')).filter((file) =>
      /^['"]use client['"]/m.test(readFileSync(file, 'utf8')),
    )
    expect(clients.length).toBeGreaterThan(5)
  })
})
