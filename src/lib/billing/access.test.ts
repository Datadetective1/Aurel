import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyAccessTier, hasFullAccess, parseAccessTier } from './access'
import { PLANS } from './plans'

/**
 * Access tiers.
 *
 * The property that matters most is the boring one: STANDARD must come out
 * identical to the plan it went in as. Everything here is a lift on top of the
 * existing model, and the moment an ordinary account resolves differently
 * because this feature exists, the feature has broken the product it was added
 * to.
 */

describe('tier parsing', () => {
  it('defaults to standard for anything unrecognised', () => {
    // A null grant, a typo, a future tier this build does not know: all
    // standard. Failing open to full access would be the expensive direction
    // to get wrong.
    for (const value of [null, undefined, '', 'admin', 'OWNER', 42, {}]) {
      expect(parseAccessTier(value)).toBe('standard')
    }
  })

  it('recognises the two real tiers', () => {
    expect(parseAccessTier('owner')).toBe('owner')
    expect(parseAccessTier('pilot')).toBe('pilot')
  })

  it('treats owner and pilot as equally entitled', () => {
    // They differ in who may assign them, not in what they reach.
    expect(hasFullAccess('owner')).toBe(true)
    expect(hasFullAccess('pilot')).toBe(true)
    expect(hasFullAccess('standard')).toBe(false)
  })
})

describe('standard is untouched', () => {
  it('returns the free plan exactly as defined', () => {
    const applied = applyAccessTier('standard', PLANS.free)
    expect(applied.capabilities).toEqual(PLANS.free.capabilities)
    expect(applied.quotas).toEqual(PLANS.free.quotas)
    expect(applied.limits).toEqual(PLANS.free.limits)
  })

  it('keeps every free quota a real number', () => {
    // If any of these became null, an ordinary account would silently stop
    // being metered against a ceiling.
    const applied = applyAccessTier('standard', PLANS.free)
    expect(applied.quotas.person_research).toBe(3)
    expect(applied.quotas.meeting_brief).toBe(3)
    expect(Object.values(applied.quotas).some((v) => typeof v === 'number')).toBe(true)
  })

  it('leaves capabilities the free plan does not include switched off', () => {
    const applied = applyAccessTier('standard', PLANS.free)
    expect(applied.capabilities.deepResearch).toBe(false)
    expect(applied.capabilities.teamWorkspace).toBe(false)
  })
})

describe('full access', () => {
  for (const tier of ['owner', 'pilot'] as const) {
    it(`${tier} reaches every capability`, () => {
      const applied = applyAccessTier(tier, PLANS.free)
      for (const [name, enabled] of Object.entries(applied.capabilities)) {
        expect(enabled, `${name} should be enabled for ${tier}`).toBe(true)
      }
    })

    it(`${tier} has no quota ceiling`, () => {
      const applied = applyAccessTier(tier, PLANS.free)
      for (const [meter, limit] of Object.entries(applied.quotas)) {
        // null, not a large number. A big number is still a cliff, and hitting
        // one mid-pilot at an unpredictable moment is the experience this
        // exists to prevent.
        expect(limit, `${meter} should be unlimited for ${tier}`).toBeNull()
      }
    })

    it(`${tier} is not limited on stored people`, () => {
      expect(applyAccessTier(tier, PLANS.free).limits.people).toBeNull()
    })
  }

  it('covers every meter the plan defines, not a hand-listed subset', () => {
    // A meter added to the plan later must be lifted too, without anybody
    // remembering to come back here.
    const applied = applyAccessTier('pilot', PLANS.free)
    expect(Object.keys(applied.quotas).sort()).toEqual(Object.keys(PLANS.free.quotas).sort())
  })

  it('lifts voice transcription along with everything else', () => {
    const applied = applyAccessTier('pilot', PLANS.free)
    expect(applied.capabilities.debrief).toBe(true)
    expect(applied.capabilities.calendarIntegration).toBe(true)
    expect(applied.capabilities.researchPerson).toBe(true)
  })
})

describe('metering is not part of this', () => {
  // Code only. Both files explain at length why metering must keep running for
  // pilot accounts, and a naive grep reads the explanation as the violation.
  const strip = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join(' ')

  const source = strip(
    readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'access.ts'), 'utf8'),
  )
  const entitlements = strip(
    readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'entitlements.ts'), 'utf8'),
  )

  it('the tier module knows nothing about recording usage', () => {
    // Pilot accounts must still be metered. If this file could reach
    // recordUsage it could also skip it.
    expect(source).not.toMatch(/recordUsage|usage_meters|costUnits/)
  })

  it('recordUsage does not consult the tier', () => {
    const record = entitlements.slice(entitlements.indexOf('export async function recordUsage'))
    expect(record).not.toMatch(/\btier\b|hasFullAccess|applyAccessTier/)
  })
})

describe('what a full-access account is shown', () => {
  const billing = readFileSync(
    join(process.cwd(), 'src', 'app', '(app)', 'settings', 'billing', 'page.tsx'),
    'utf8',
  )

  it('hides the quota-bearing plan highlights', () => {
    // "3 researched people and 3 meeting briefs a month" is not true of an
    // account those quotas do not apply to, and it sat directly above a line
    // saying no quotas apply.
    expect(billing).toMatch(/!fullAccess \? \([\s\S]{0,200}plan\.highlights/)
  })

  it('offers no upgrade prompt', () => {
    expect(billing).toMatch(/fullAccess \? 'hidden'/)
  })

  it('drops the usage bars by itself, without a special case', () => {
    // metered filters on a numeric limit, and full access sets every quota to
    // null -- so "This month" disappears because the data says so.
    expect(billing).toMatch(/typeof limit === 'number' && limit > 0/)
  })
})
