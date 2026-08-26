import { describe, expect, it } from 'vitest'
import { resolveSearchProviderId } from '@/lib/env'

/**
 * Which search provider runs.
 *
 * The same failure this guards against has already happened once with the AI
 * provider: a key was configured in production and nothing activated, because
 * the code also required a separate variable to name that provider. Every
 * visible signal agreed the feature was unconfigured, and all of them were
 * describing the configuration rather than the key.
 */

describe('resolveSearchProviderId', () => {
  it('activates Exa from the key alone', () => {
    // The whole point: paste EXA_API_KEY, redeploy, discovery works.
    expect(resolveSearchProviderId({ exaKey: 'exa-test' })).toBe('exa')
  })

  it('activates the other providers from their keys alone', () => {
    expect(resolveSearchProviderId({ braveKey: 'BSA-test' })).toBe('brave')
    expect(resolveSearchProviderId({ serperKey: 'serper-test' })).toBe('serper')
  })

  it('reports none when no key is present', () => {
    // Not a failure state. Pasting a URL still works, and the UI says so.
    expect(resolveSearchProviderId({})).toBe('none')
  })

  it("keeps 'none' as a real off switch even when a key is present", () => {
    // Turning discovery off must not require deleting credentials.
    expect(resolveSearchProviderId({ provider: 'none', exaKey: 'exa-test' })).toBe('none')
  })

  it('prefers Exa when several keys are set and none is named', () => {
    expect(
      resolveSearchProviderId({ exaKey: 'exa-test', braveKey: 'BSA', serperKey: 'serper' }),
    ).toBe('exa')
  })

  it('lets an explicit provider break a tie', () => {
    expect(resolveSearchProviderId({ provider: 'brave', exaKey: 'exa', braveKey: 'BSA' })).toBe(
      'brave',
    )
  })

  it('degrades rather than booting into certain failure on a keyless provider', () => {
    // SEARCH_PROVIDER=exa with no key cannot work. Falling back to no discovery
    // keeps manual URL research available; trusting the label would make every
    // run throw.
    expect(resolveSearchProviderId({ provider: 'exa' })).toBe('none')
    expect(resolveSearchProviderId({ provider: 'brave', exaKey: 'exa-test' })).toBe('none')
  })

  it('allows the deterministic development provider without a key', () => {
    // It refuses to run in production on its own account, so it can never
    // fabricate evidence for a real user.
    expect(resolveSearchProviderId({ provider: 'mock' })).toBe('mock')
  })
})
