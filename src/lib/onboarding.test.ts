import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS, nextStep, stepPath, type OnboardingStep } from './onboarding'

/**
 * THE PATH TO FIRST VALUE
 * =============================================================================
 * Onboarding is setup, not work. Every step between signing up and using the
 * product has to earn its place, and a step the user cannot get past has to
 * earn it twice.
 * =============================================================================
 */

describe('only what is needed before the product is asked before the product', () => {
  it('does not ask for appearance', () => {
    // It asked for a theme and a coaching style before the user had seen a
    // single screen to have an opinion about — and it was the one step in the
    // flow with no way past it. Both fields default in the database and both
    // are owned by Settings.
    expect(ONBOARDING_STEPS).not.toContain('appearance')
  })

  it('still collects the things nothing else collects', () => {
    // intent / frameworks / coaching each already offer Skip, and no other
    // surface in the product gathers them. Removing them would strand the
    // configuration rather than defer it.
    expect(ONBOARDING_STEPS).toContain('about')
    expect(ONBOARDING_STEPS).toContain('intent')
    expect(ONBOARDING_STEPS).toContain('frameworks')
    expect(ONBOARDING_STEPS).toContain('coaching')
  })

  it('ends on the assessment', () => {
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe('assessment')
  })

  it('is six steps, and a seventh needs a reason', () => {
    // Not an arbitrary ceiling: a regression that reinstates a pre-product
    // question should have to change this number deliberately.
    expect(ONBOARDING_STEPS).toHaveLength(6)
  })
})

describe('a retired stage never sends anyone back to the start', () => {
  it('advances an unknown stage to the last step', () => {
    // `onboarding_stage` is a text column, so it can hold a stage this build no
    // longer knows about. indexOf returns -1, and the old arithmetic turned
    // that into index 0 — the welcome screen. Somebody parked on `appearance`
    // when it was retired would have been made to walk the whole flow again.
    expect(nextStep('appearance' as OnboardingStep)).toBe('assessment')
    expect(nextStep('some-future-rename' as OnboardingStep)).toBe('assessment')
  })

  it('still walks the known sequence in order', () => {
    expect(nextStep('welcome')).toBe('about')
    expect(nextStep('about')).toBe('intent')
    expect(nextStep('intent')).toBe('frameworks')
    expect(nextStep('frameworks')).toBe('coaching')
    expect(nextStep('coaching')).toBe('assessment')
  })

  it('does not run off the end', () => {
    expect(nextStep('assessment')).toBe('assessment')
  })
})

describe('every step resolves to a route', () => {
  it('maps welcome to the root and the rest to their own path', () => {
    expect(stepPath('welcome')).toBe('/onboarding')
    for (const step of ONBOARDING_STEPS.filter((s) => s !== 'welcome')) {
      expect(stepPath(step)).toBe(`/onboarding/${step}`)
    }
  })
})
