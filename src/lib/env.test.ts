import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAI } from './env'

/**
 * Provider resolution.
 *
 * This exists because of a real failure: OPENAI_API_KEY was set in production
 * and nothing happened. AI_PROVIDER still said 'grounded' and AI_MODEL still
 * named a Claude model, so the key sat there doing nothing while the UI
 * reported AI as unconfigured — the worst kind of bug, one where every visible
 * signal agrees and all of them are wrong.
 */

describe('resolveAI', () => {
  it('activates OpenAI from the key alone', () => {
    // The whole point. No AI_PROVIDER, no AI_MODEL — just a key.
    expect(resolveAI({ openaiKey: 'sk-test' })).toEqual({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
  })

  it('activates Anthropic from the key alone', () => {
    expect(resolveAI({ anthropicKey: 'sk-ant-test' })).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
    })
  })

  it('never hands one provider the other provider a model id', () => {
    // A Claude id sent to OpenAI is a 404, which the retry loop would swallow
    // as a fallback to the composer. The default has to be per provider.
    expect(resolveAI({ openaiKey: 'sk-test' }).model).not.toMatch(/claude/)
    expect(resolveAI({ anthropicKey: 'sk-ant-test' }).model).not.toMatch(/gpt/)
  })

  it('falls back to the composer with no key at all', () => {
    expect(resolveAI({})).toEqual({ provider: 'grounded', model: 'evidence-composer' })
  })

  it("keeps 'grounded' as a real off switch even when keys are present", () => {
    // Turning generation off must not require deleting credentials.
    expect(resolveAI({ provider: 'grounded', openaiKey: 'sk-test' }).provider).toBe('grounded')
    expect(resolveAI({ provider: 'grounded', anthropicKey: 'sk-ant' }).provider).toBe('grounded')
  })

  it('lets an explicit provider break a tie when both keys exist', () => {
    expect(
      resolveAI({ provider: 'openai', anthropicKey: 'sk-ant', openaiKey: 'sk-test' }).provider,
    ).toBe('openai')
    expect(
      resolveAI({ provider: 'anthropic', anthropicKey: 'sk-ant', openaiKey: 'sk-test' }).provider,
    ).toBe('anthropic')
  })

  it('prefers Anthropic when both keys are set and neither is named', () => {
    expect(resolveAI({ anthropicKey: 'sk-ant', openaiKey: 'sk-test' }).provider).toBe('anthropic')
  })

  it('degrades rather than booting into certain failure on a keyless provider', () => {
    // AI_PROVIDER=openai with no OpenAI key cannot work. Falling back to the
    // composer keeps the product usable; trusting the label would make every
    // generation throw.
    expect(resolveAI({ provider: 'openai' }).provider).toBe('grounded')
    expect(resolveAI({ provider: 'anthropic', openaiKey: 'sk-test' }).provider).toBe('grounded')
  })

  it('honours an explicit model override', () => {
    expect(resolveAI({ openaiKey: 'sk-test', model: 'gpt-5' }).model).toBe('gpt-5')
  })

  it('reports the composer as the model when nothing is active, never a real id', () => {
    // Settings shows this string. Naming a model that is not being called
    // would be a false claim about what produced the user's output.
    expect(resolveAI({ model: 'gpt-4.1-mini' }).model).toBe('evidence-composer')
  })
})

describe('the 14-day trial offer is opt-in', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const offer = async (value: string | undefined) => {
    vi.resetModules()
    if (value === undefined) vi.stubEnv('PRO_TRIAL_OFFER', '')
    else vi.stubEnv('PRO_TRIAL_OFFER', value)
    return (await import('./env')).features.proTrialOffer
  }

  it('is closed unless PRO_TRIAL_OFFER is exactly "on"', async () => {
    expect(await offer(undefined)).toBe(false)
    expect(await offer('off')).toBe(false)
    expect(await offer('true')).toBe(false)
    expect(await offer('on')).toBe(true)
  })
})
