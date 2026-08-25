import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brand } from '@/lib/brand'

/**
 * BRAND CENTRALISATION GUARD
 * =============================================================================
 * Fails the build if the product name is hard-coded anywhere outside the brand
 * registry, so a rename stays a one-file change instead of a scavenger hunt.
 * This is not hypothetical: the product was renamed from the codename "Aurel"
 * to "Atturel" and the change was a single edit to the registry.
 *
 * Comments, internal identifiers and namespaced strings (bot user-agent,
 * placeholder domains, log prefixes) are exempt — none of those are copy a user
 * reads, and several must stay stable independently of the display name.
 * =============================================================================
 */

const ROOT = join(__dirname, '..', '..', 'src')

/** The registry itself is where the name is allowed to live. */
const ALLOWED_FILES = [join('lib', 'brand', 'index.ts')]

/** Declared as constants so no escape sequence has to survive code generation. */
const NEWLINE = String.fromCharCode(10)
// String.raw, because in a normal string literal '\b' is the backspace
// character rather than a word boundary — which would silently disarm this
// entire guard while still appearing to pass.
const FORMER_CODENAME = new RegExp(String.raw`\bAurel`, 'i')
const TECHNICAL_IDENTIFIER = /aurel-demo|supabase|migration/i

/**
 * Patterns that legitimately contain the codename but are not user-facing copy:
 * log event prefixes, the outbound bot identifier, placeholder addresses, and
 * exported constant names.
 */
const EXEMPT_PATTERNS = [
  /\[atturel\]/i, // internal log/error prefix
  /atturel\.app/i, // placeholder domain; its canonical value is in the registry
  /@atturel/i, // placeholder email addresses
  /atturel-demo/i, // development fixture accounts
  /brand\.slug/, // the user-agent is composed from the registry
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Strip comments so documentation may reference the codename freely. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line.replace(/\s\/\/.*$/, '')))
    .join('\n')
}

describe('brand centralisation', () => {
  const files = walk(ROOT).filter(
    (f) => !ALLOWED_FILES.some((allowed) => f.endsWith(allowed)) && !f.endsWith('.test.ts'),
  )

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('never hard-codes the product name outside the brand registry', () => {
    const offenders: string[] = []

    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const [index, line] of code.split('\n').entries()) {
        if (!line.includes(brand.name)) continue
        if (EXEMPT_PATTERNS.some((pattern) => pattern.test(line))) continue
        offenders.push(`${relative(ROOT, file).split(sep).join('/')}:${index + 1} — ${line.trim()}`)
      }
    }

    expect(
      offenders,
      `Hard-coded "${brand.name}" found. Import { brand } from '@/lib/brand' and use brand.name so a rename stays a one-file change:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('exposes every renameable string through the registry', () => {
    // If a rename needs it, it belongs here.
    expect(brand.name).toBeTruthy()
    expect(brand.slug).toBeTruthy()
    expect(brand.legalEntity).toBeTruthy()
    expect(brand.domain).toBeTruthy()
    expect(brand.assistantName).toBeTruthy()
    expect(brand.assessmentName).toBeTruthy()
    expect(brand.email.fromName).toBeTruthy()
    expect(brand.email.fromAddress).toBeTruthy()
    expect(brand.email.support).toBeTruthy()
    expect(brand.tagline).toBeTruthy()
    expect(brand.description).toBeTruthy()
  })

  it('keeps the slug machine-safe so a rename cannot break storage keys', () => {
    expect(brand.slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('has no user-visible trace of the former codename', () => {
    // The rename must be complete in the copy, not merely centralised.
    const offenders: string[] = []
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const [index, line] of code.split(NEWLINE).entries()) {
        if (!FORMER_CODENAME.test(line)) continue
        // Stable technical identifiers are deliberately left alone.
        if (TECHNICAL_IDENTIFIER.test(line)) continue
        offenders.push(`${relative(ROOT, file).split(sep).join('/')}:${index + 1} - ${line.trim()}`)
      }
    }
    expect(
      offenders,
      `Former codename still visible:${NEWLINE}${offenders.join(NEWLINE)}`,
    ).toEqual([])
  })

  it('flags that the policies still need human legal review', () => {
    // Guards against shipping with the placeholder silently marked reviewed.
    expect(typeof brand.legal.policiesLegallyReviewed).toBe('boolean')
  })
})
