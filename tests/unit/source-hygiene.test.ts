import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SOURCE HYGIENE
 * =============================================================================
 * Fails the build if a source file contains a raw control character.
 *
 * This exists because of a specific, repeated bug. A regex written as `\b` —
 * a word boundary — becomes U+0008, an actual backspace, if it passes through
 * a layer that resolves the escape one time too many. The file still parses.
 * TypeScript is happy. The regex compiles. It just silently matches nothing.
 *
 * It has happened three times in this codebase: it disarmed the brand guard so
 * the guard passed while matching nothing, it broke the objective-grammar
 * detection, and it corrupted sixteen regexes in the debrief extractor at once
 * — which is how a commitment cue stopped firing without a single test failing.
 *
 * Every one of those was invisible in review and took a live behaviour to find.
 * A cheap mechanical check is worth more than remembering.
 * =============================================================================
 */

const ROOTS = ['src', 'tests', 'supabase']

/** Tab, newline and carriage return are the only control characters allowed. */
const ALLOWED = new Set([9, 10, 13])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|sql|css|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

describe('source hygiene', () => {
  const root = join(__dirname, '..', '..')
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(join(root, r))
    } catch {
      return []
    }
  })

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('contains no raw control characters', () => {
    const offenders: string[] = []

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (let i = 0; i < content.length; i += 1) {
        const code = content.charCodeAt(i)
        if (code < 32 && !ALLOWED.has(code)) {
          const line = content.slice(0, i).split('\n').length
          const context = content.slice(Math.max(0, i - 40), i + 10).replace(/\n/g, '⏎')
          offenders.push(
            `${relative(root, file).split(sep).join('/')}:${line} — U+${code
              .toString(16)
              .padStart(4, '0')
              .toUpperCase()} in: …${context}…`,
          )
          break
        }
      }
    }

    expect(
      offenders,
      `Raw control characters found. These are almost always a regex escape that ` +
        `was resolved one time too many — \\b becoming a backspace, for instance, ` +
        `which compiles fine and then matches nothing:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
