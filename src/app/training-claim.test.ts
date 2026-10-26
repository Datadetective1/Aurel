import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ONE TRAINING STATEMENT, THE ONE THE PRIVACY POLICY SUPPORTS
 * =============================================================================
 * Atturel does not train models on your content, and OpenAI's API terms say it
 * does not either -- but Exa's terms let it use the search terms it receives
 * to improve its service. So no page may say, without qualification, that
 * content is never used to train a model. The homepage, Pricing and Settings
 * use the approved sentence and point to the Privacy policy for providers.
 * =============================================================================
 */

const SRC = join(__dirname, '..')
const STATEMENT =
  'does not use your content to train models. Our Privacy policy explains how our service providers process data.'

// Feedback on a generated brief is stored only in the user's own record.
const SCOPED = new Set(['components/app/artifact-feedback.tsx'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('training claims', () => {
  it('no page makes the blanket claim', () => {
    const offenders = sources(SRC)
      .filter((path) => !SCOPED.has(relative(SRC, path)))
      .filter((path) =>
        /never used to train|not used to train a shared model/i.test(readFileSync(path, 'utf8')),
      )
      .map((path) => relative(SRC, path))
    expect(offenders).toEqual([])
  })

  it.each([
    'app/(marketing)/page.tsx',
    'app/(marketing)/pricing/page.tsx',
    'app/(app)/settings/data/page.tsx',
  ])('%s uses the approved statement', (file) => {
    expect(readFileSync(join(SRC, file), 'utf8').replace(/\s+/g, ' ')).toContain(STATEMENT)
  })
})
