import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * TIMEZONE HYGIENE GUARD
 * =============================================================================
 * Fails the build if user-facing calendar-day logic reads the ambient clock.
 *
 * This is not hypothetical. At 21:22 on 27 August in Chicago, the Today page
 * announced "FRIDAY, AUGUST 28" — because `new Date().toISOString().slice(0,10)`
 * and `toLocaleDateString(undefined, …)` both answer with the runtime's
 * calendar, and on Vercel the runtime is UTC. The user's meetings for the rest
 * of their evening had already dropped off the page.
 *
 * The rule: a calendar day shown to a user, or used to decide what to show
 * them, must be computed in that user's zone. lib/tz holds the primitives;
 * everything else asks it. Instants stay UTC everywhere — this guard is about
 * days, not timestamps.
 *
 * Exemptions are narrow and each one is named below with its reason.
 * =============================================================================
 */

const ROOT = join(__dirname, '..', '..', 'src')

/**
 * Files allowed to touch the raw primitives.
 *
 * lib/tz is the implementation. lib/format delegates to it. The two client
 * components read the BROWSER's clock deliberately and only after mount, which
 * is the user's own zone by definition and cannot mismatch during hydration
 * because nothing is rendered on the server.
 */
const ALLOWED = new Set([
  join('lib', 'tz.ts'),
  join('lib', 'tz.test.ts'),
  join('lib', 'format.ts'),
  join('components', 'app', 'timezone-field.tsx'),
  join('components', 'app', 'interaction-form.tsx'),
  join('lib', 'timezones.ts'),
])

/**
 * Places where a UTC day is the correct answer, with the reason it is correct.
 *
 * Each of these is about something other than the reader's own day, so pinning
 * it to the reader's zone would be the bug rather than the fix.
 */
const JUSTIFIED: { file: string; reason: string }[] = [
  {
    file: join('lib', 'billing', 'entitlements.ts'),
    reason: 'Quota periods are calendar months anchored to UTC for every account alike.',
  },
  {
    file: join('app', '(app)', 'settings', 'billing', 'actions.ts'),
    reason: 'A Stripe idempotency key. Never rendered; only has to be stable.',
  },
  {
    file: join('components', 'app', 'data-controls.tsx'),
    reason: 'An export filename, not a date shown in the interface.',
  },
  {
    file: join('lib', 'demo', 'seed.ts'),
    reason: 'Fixture data for the seeded demo account, generated relative to seeding.',
  },
  {
    file: join('app', '(marketing)', 'layout.tsx'),
    reason: 'A copyright year. The same everywhere for eight hours a year at most.',
  },
  {
    file: join('app', 'api', 'stripe', 'webhook', 'route.ts'),
    reason: 'A billing anchor stored as an instant, never rendered as a day.',
  },
]

const JUSTIFIED_FILES = new Set(JUSTIFIED.map((j) => j.file))

/**
 * The patterns that produce a wrong calendar day.
 *
 * `String.raw` throughout: in an ordinary string literal `\b` is a backspace
 * rather than a word boundary, which would disarm the guard while still
 * appearing to pass.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  {
    pattern: new RegExp(String.raw`toISOString\(\)\s*\.\s*(slice|split|substring|substr)`),
    why: 'derives a calendar day from the UTC instant. Use todayIn(timeZone) or dayKeyIn(value, timeZone).',
  },
  {
    pattern: new RegExp(String.raw`\.setHours\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)`),
    why: 'is midnight in the RUNTIME zone, which is UTC on the server. Use startOfDayUtc(day, timeZone).',
  },
  {
    pattern: new RegExp(String.raw`new Date\(\)\s*\.\s*get(Hours|Date|Day|Month|FullYear)\b`),
    why: 'reads the runtime clock. Use hourIn(timeZone) or the lib/tz day helpers.',
  },
  {
    pattern: new RegExp(String.raw`getUTC(Date|Day|Hours|Month|FullYear)\b`),
    why: 'reckons a calendar day in UTC. Use the lib/tz helpers, which take a zone.',
  },
  {
    pattern: new RegExp(String.raw`toLocale(Date|Time)?String\(\s*undefined`),
    why: 'formats with the ambient locale AND zone, which differ between server and browser. Pin both.',
  },
  {
    pattern: new RegExp(String.raw`toLocale(Date|Time)?String\(\s*(['"][\w-]+['"])\s*,\s*\{(?![^}]*timeZone)[^}]*\}`),
    why: 'pins the locale but not the zone, so the day still follows the runtime. Pass timeZone.',
  },
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Strip comments and import lines before matching.
 *
 * Without this the guard flags its own explanatory prose, and every previous
 * guard in this suite has had exactly that false positive at least once.
 */
function stripCommentsAndImports(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')
}

describe('user-facing calendar days are never read from the ambient clock', () => {
  const files = sourceFiles(ROOT)

  it('finds source to check, so a broken walk cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it.each(FORBIDDEN)('no file computes a day via a pattern that $why', ({ pattern, why }) => {
    const offenders: string[] = []

    for (const file of files) {
      const rel = relative(ROOT, file)
      const key = rel.split('/').join(sep)
      if (ALLOWED.has(key) || JUSTIFIED_FILES.has(key)) continue

      const body = stripCommentsAndImports(readFileSync(file, 'utf8'))
      if (pattern.test(body)) offenders.push(rel)
    }

    expect(offenders, `${offenders.join(', ')} — ${why}`).toEqual([])
  })

  it('keeps every justified UTC exemption pointing at a file that still exists', () => {
    // An exemption for a deleted file is a hole waiting for a new one to be
    // dropped into it.
    const present = new Set(files.map((f) => relative(ROOT, f).split('/').join(sep)))
    for (const { file, reason } of JUSTIFIED) {
      expect(present.has(file), `${file} is exempted (${reason}) but no longer exists`).toBe(true)
    }
  })

  it('requires a zone wherever a calendar day reaches the user', () => {
    // formatDayLabel, relativeDay, formatTime and formatDate all take a zone as
    // a required parameter. A call with a single argument means a call site was
    // missed -- the type checker catches it, and this states the rule.
    const singleArg = new RegExp(
      String.raw`\b(formatDayLabel|relativeDay|formatTime|formatDate)\(\s*[^,()]*\s*\)`,
    )
    const offenders: string[] = []

    for (const file of files) {
      const rel = relative(ROOT, file)
      if (rel.split('/').join(sep) === join('lib', 'format.ts')) continue
      const body = stripCommentsAndImports(readFileSync(file, 'utf8'))
      if (singleArg.test(body)) offenders.push(rel)
    }

    expect(offenders, `${offenders.join(', ')} call a date formatter without a time zone`).toEqual(
      [],
    )
  })
})
