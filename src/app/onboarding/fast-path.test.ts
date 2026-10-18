import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENRICHMENT_STEPS,
  REQUIRED_STEPS,
  isEnrichmentStep,
  nextEnrichmentStep,
} from '@/lib/onboarding'

/**
 * FAST-PATH ONBOARDING
 * =============================================================================
 * A fresh-user walkthrough counted seven screens and six questions between
 * confirming an email and reaching Today. A new user who wants speed must now
 * reach Today after saying who they are -- without past assessments, coaching
 * history or the Interaction Profile -- and the deeper steps must remain
 * reachable, and keep what was answered, for anyone who wants them.
 * =============================================================================
 */

const updates: Record<string, unknown>[] = []
let completedAt: string | null = null

class Redirect extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT ${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/auth', () => ({
  requireUser: async () => ({ id: 'user-1' }),
  getProfile: async () => ({ id: 'user-1', onboarding_completed_at: completedAt }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        updates.push(row)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

const { saveAbout, finishOnboardingLater, saveIntent } = await import('./actions')

async function run(fn: () => Promise<unknown>) {
  try {
    await fn()
    return null
  } catch (error) {
    if (error instanceof Redirect) return error.to
    throw error
  }
}

/** Every field the identity form submits; the optional ones arrive empty. */
function identity(fields: Record<string, string>) {
  const form = new FormData()
  const all = {
    fullName: '',
    preferredName: '',
    jobTitle: '',
    company: '',
    jobFunction: '',
    seniority: '',
    pronouns: '',
    timezone: '',
    ...fields,
  }
  for (const [key, value] of Object.entries(all)) form.set(key, value)
  return form
}

beforeEach(() => {
  updates.length = 0
  completedAt = null
})

describe('the required path is one screen', () => {
  it('asks only for identity before the product', () => {
    expect(REQUIRED_STEPS).toEqual(['welcome'])
  })

  it('keeps goals, past assessments, coaching and the profile as optional tailoring', () => {
    expect(ENRICHMENT_STEPS).toEqual(['intent', 'frameworks', 'coaching', 'assessment'])
    for (const step of ENRICHMENT_STEPS) {
      expect(REQUIRED_STEPS as readonly string[]).not.toContain(step)
      expect(isEnrichmentStep(step)).toBe(true)
    }
  })

  it('walks the tailoring steps in order and then ends', () => {
    expect(nextEnrichmentStep('intent')).toBe('frameworks')
    expect(nextEnrichmentStep('frameworks')).toBe('coaching')
    expect(nextEnrichmentStep('coaching')).toBe('assessment')
    expect(nextEnrichmentStep('assessment')).toBeNull()
  })
})

describe('saveAbout: name and time zone open the product', () => {
  it('completes onboarding and lands on Today', async () => {
    const to = await run(() =>
      saveAbout({}, identity({ fullName: 'Ada Example', timezone: 'America/Chicago' })),
    )
    expect(to).toBe('/today?welcome=1')
    expect(updates[0]).toMatchObject({
      full_name: 'Ada Example',
      timezone: 'America/Chicago',
      onboarding_stage: 'done',
    })
    expect(updates[0]!.onboarding_completed_at).toEqual(expect.any(String))
  })

  it('needs nothing but a name: role, company and the rest are optional', async () => {
    const to = await run(() => saveAbout({}, identity({ fullName: 'Ada Example' })))
    expect(to).toBe('/today?welcome=1')
  })

  it('still refuses an empty name', async () => {
    let result: unknown
    const to = await run(async () => {
      result = await saveAbout({}, identity({ fullName: '' }))
    })
    expect(to).toBeNull()
    expect(result).toMatchObject({ fieldErrors: { fullName: expect.any(Array) } })
    expect(updates).toHaveLength(0)
  })

  it('never overwrites the completion time of an account that already finished', async () => {
    completedAt = '2026-09-01T00:00:00.000Z'
    await run(() => saveAbout({}, identity({ fullName: 'Ada Example' })))
    expect(updates[0]).not.toHaveProperty('onboarding_completed_at')
  })
})

describe('the tailoring steps can be left as a group', () => {
  it('"Finish later" goes to Today and completes an account parked in the old flow', async () => {
    const to = await run(() => finishOnboardingLater())
    expect(to).toBe('/today')
    expect(updates[0]).toMatchObject({ onboarding_stage: 'done' })
  })

  it('"Finish later" writes nothing for an account already onboarded', async () => {
    completedAt = '2026-09-01T00:00:00.000Z'
    const to = await run(() => finishOnboardingLater())
    expect(to).toBe('/today')
    expect(updates).toHaveLength(0)
  })

  it('saving a tailoring step keeps its answers and moves to the next one', async () => {
    completedAt = '2026-09-01T00:00:00.000Z'
    const form = new FormData()
    form.append('intents', 'prepare_meetings')
    const to = await run(() => saveIntent({}, form))
    expect(to).toBe('/onboarding/frameworks')
    expect(updates[0]).toEqual({ intents: ['prepare_meetings'] })
  })
})

describe('the gates themselves', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')

  it('the product checks only that onboarding is complete, not the profile', () => {
    const auth = read('lib', 'auth.ts')
    const gate = auth.slice(auth.indexOf('export async function requireOnboardedUser'))
    expect(gate.slice(0, gate.indexOf('\n}'))).not.toMatch(/assessment|intents|coaching/)
  })

  it('the onboarding layout no longer bounces finished accounts away from the tailoring steps', () => {
    expect(read('app', 'onboarding', 'layout.tsx')).not.toMatch(/redirect\('\/today'\)/)
  })
})
