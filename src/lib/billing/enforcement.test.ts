import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLANS, type Capability } from './plans'
import { CAPABILITY_LABELS } from './entitlements'

/**
 * A PAYWALL YOU DO NOT ENFORCE IS A PROMISE YOU DO NOT KEEP
 * =============================================================================
 * plans.ts can declare any capability Pro-only. Whether anything CHECKS that is
 * a separate question, and the two drifted: the pricing page sold "Calendar
 * integration and the Relationship Atlas" while both were reachable on Free,
 * and "Weekly relationship intelligence", which is an email template with no
 * job that sends it.
 *
 * This file is the thing that notices. It reads the actual call sites, works
 * out which capabilities are gated, and holds the difference between "declared"
 * and "enforced" to a list somebody had to write down on purpose.
 * =============================================================================
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      found.push(path)
    }
  }
  return found
}

const ALL_CAPABILITIES = Object.keys(PLANS.pro.capabilities) as Capability[]

/**
 * Every capability passed to checkCapability anywhere in the app.
 *
 * Scans the whole argument list rather than the first quoted token, because one
 * real call site picks its capability with a ternary:
 *
 *   checkCapability(
 *     kind === 'transcript' ? 'transcriptAnalysis' : 'researchPerson', ...
 *
 * where the first string in the parentheses is 'transcript', which is not a
 * capability at all.
 */
const enforced = new Set<Capability>()
for (const file of sourceFiles(SRC)) {
  const source = readFileSync(file, 'utf8')
  for (const call of source.matchAll(/checkCapability\(([\s\S]{0,300}?)\)/g)) {
    const args = call[1] ?? ''
    for (const capability of ALL_CAPABILITIES) {
      if (args.includes(`'${capability}'`)) enforced.add(capability)
    }
  }
}

/**
 * Declared Pro-only, and nothing checks it.
 *
 * Every entry is a decision, not an oversight:
 *
 *   deepResearch        No implementation at all. A meter kind, a label, and no
 *                       call site — there is nothing to gate yet.
 *   weeklyIntelligence  weeklySummaryEmail exists and is referenced only by the
 *                       dev preview route. Nothing sends it on a schedule.
 *   relationshipAtlas   Built and reachable at /atlas on any plan.
 *   calendarIntegration Built and reachable from Settings on any plan.
 *   advancedMemory      Not a distinct feature — memory is the product.
 *
 * The last three are the interesting ones: gating them would take capability
 * away from accounts that have it today, which is a commercial decision for the
 * owner rather than a bug to fix in passing. Until then they must not be sold —
 * which is what the second test below enforces.
 *
 * Adding to this list should feel uncomfortable. Removing from it means a gate
 * was written.
 */
const DECLARED_BUT_NOT_ENFORCED = new Set<Capability>([
  'deepResearch',
  'weeklyIntelligence',
  'relationshipAtlas',
  'calendarIntegration',
  'advancedMemory',
])

/** Capabilities Free does not have and Pro does — the ones being sold. */
const soldAsPro = (Object.keys(PLANS.pro.capabilities) as Capability[]).filter(
  (capability) => PLANS.pro.capabilities[capability] && !PLANS.free.capabilities[capability],
)

describe('the gap between what is sold and what is gated', () => {
  it('finds the real call sites, so the rest of this file means something', () => {
    // A guard on the guard: if the regex stops matching, every assertion below
    // passes vacuously.
    expect(enforced.size).toBeGreaterThan(3)
    expect(enforced).toContain('meetingBrief')
    expect(enforced).toContain('researchPerson')
  })

  it('gates every Pro-only capability that is not on the known list', () => {
    const unaccounted = soldAsPro.filter(
      (capability) => !enforced.has(capability) && !DECLARED_BUT_NOT_ENFORCED.has(capability),
    )
    expect(
      unaccounted,
      'These are Pro-only in plans.ts and nothing checks them. Either add a ' +
        'checkCapability call at the entry point, or add them to ' +
        'DECLARED_BUT_NOT_ENFORCED above with a reason.',
    ).toEqual([])
  })

  it('never advertises a capability that is not enforced', () => {
    // The actual failure this file exists for. A bullet on the pricing page is
    // a claim about what paying changes; if nothing changes, it is not true.
    const offenders: string[] = []

    for (const capability of DECLARED_BUT_NOT_ENFORCED) {
      // "The Relationship Atlas" -> "relationship atlas", so a highlight that
      // phrases it differently is still caught.
      const label = CAPABILITY_LABELS[capability].replace(/^The\s+/i, '').toLowerCase()

      for (const plan of Object.values(PLANS)) {
        for (const highlight of plan.highlights) {
          if (highlight.toLowerCase().includes(label)) {
            offenders.push(`${plan.name}: "${highlight}" sells ${capability}, which nothing gates`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the list honest — nothing on it is secretly enforced', () => {
    const stale = [...DECLARED_BUT_NOT_ENFORCED].filter((capability) => enforced.has(capability))
    expect(
      stale,
      'A gate was written for these. Remove them from DECLARED_BUT_NOT_ENFORCED ' +
        'so the pricing page is allowed to mention them again.',
    ).toEqual([])
  })
})

describe('what Free and Pro genuinely differ on', () => {
  it('sells transcript analysis, which is a real enforced difference', () => {
    expect(PLANS.free.capabilities.transcriptAnalysis).toBe(false)
    expect(PLANS.pro.capabilities.transcriptAnalysis).toBe(true)
    expect(enforced).toContain('transcriptAnalysis')
  })

  it('sells unlimited people, which checkPersonLimit enforces', () => {
    expect(PLANS.free.limits.people).toBe(5)
    expect(PLANS.pro.limits.people).toBeNull()

    const gate = readFileSync(join(SRC, 'lib', 'billing', 'entitlements.ts'), 'utf8')
    expect(gate).toContain('export async function checkPersonLimit')
  })

  it('raises every shared quota rather than merely keeping it', () => {
    // The bulk of what Pro buys is headroom, so a Pro quota that failed to
    // exceed the Free one would be a silently empty upgrade.
    for (const meter of Object.keys(PLANS.free.quotas) as Array<keyof typeof PLANS.free.quotas>) {
      const free = PLANS.free.quotas[meter]
      const pro = PLANS.pro.quotas[meter]
      if (typeof free !== 'number' || free === 0) continue
      if (pro === undefined) continue
      // null is unlimited.
      if (pro === null) continue
      expect(pro, `Pro's ${meter} quota is not above Free's`).toBeGreaterThan(free)
    }
  })

  it('states a number in the Pro highlights that matches the configured quota', () => {
    // The bullets quote figures. If somebody retunes a quota and forgets the
    // copy, the page starts advertising a limit the product does not give.
    const text = PLANS.pro.highlights.join(' ')
    expect(text).toContain(String(PLANS.pro.quotas.person_research))
    expect(text).toContain(String(PLANS.pro.quotas.meeting_brief))
    expect(text).toContain(String(PLANS.pro.quotas.ai_coach_message))
    expect(text).toContain(String(PLANS.pro.quotas.document_analysis))
  })

  it('states Free numbers that match its configured quotas too', () => {
    const text = PLANS.free.highlights.join(' ')
    expect(text).toContain(String(PLANS.free.limits.people))
    expect(text).toContain(String(PLANS.free.quotas.person_research))
    expect(text).toContain(String(PLANS.free.quotas.meeting_brief))
  })
})
