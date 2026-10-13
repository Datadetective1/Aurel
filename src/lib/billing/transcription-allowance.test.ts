import { describe, expect, it } from 'vitest'
import { transcriptionAllowance } from './transcription'

/** The launch allowances, in the words a person sees. */
const FREE = 60 * 60
const PRO = 600 * 60

describe('transcriptionAllowance', () => {
  it('allows a recording that fits, with no notice when far from the limit', () => {
    expect(
      transcriptionAllowance({
        limitSeconds: FREE,
        usedSeconds: 0,
        requestSeconds: 600,
        plan: 'free',
      }),
    ).toEqual({
      allowed: true,
      remainingSeconds: 3000,
      notice: null,
    })
  })

  it('says how much is left when a recording brings the account close', () => {
    const d = transcriptionAllowance({
      limitSeconds: FREE,
      usedSeconds: 2700,
      requestSeconds: 400,
      plan: 'free',
    })
    expect(d).toMatchObject({
      allowed: true,
      notice: '8 minutes of transcription left this month.',
    })
  })

  it('refuses when the month is used up, pointing Free at Pro and at typing', () => {
    const d = transcriptionAllowance({
      limitSeconds: FREE,
      usedSeconds: FREE,
      requestSeconds: 30,
      plan: 'free',
    })
    expect(d.allowed).toBe(false)
    if (d.allowed) return
    expect(d.reason).toBe('exhausted')
    expect(d.message).toMatch(/used this month's 60 minutes of transcription/)
    expect(d.message).toMatch(/type or paste/)
    expect(d.message).toMatch(/Pro includes 600 minutes a month/)
    expect(d.message).not.toMatch(/quota|meter|seconds|error|limit exceeded/i)
  })

  it('refuses a recording longer than what is left, and says both numbers', () => {
    const d = transcriptionAllowance({
      limitSeconds: FREE,
      usedSeconds: 3060,
      requestSeconds: 840,
      plan: 'free',
    })
    expect(d).toMatchObject({ allowed: false, reason: 'too_long', remainingSeconds: 540 })
    if (!d.allowed) expect(d.message).toMatch(/about 14 minutes, and you have 9 minutes/)
  })

  it('points Pro at support rather than at an upgrade', () => {
    const d = transcriptionAllowance({
      limitSeconds: PRO,
      usedSeconds: PRO,
      requestSeconds: 60,
      plan: 'pro',
    })
    if (!d.allowed) expect(d.message).toMatch(/600 minutes.*Contact support/)
  })

  it('never limits an unlimited account (owner, pilot)', () => {
    expect(
      transcriptionAllowance({
        limitSeconds: null,
        usedSeconds: 10 ** 7,
        requestSeconds: 7200,
        plan: 'free',
      }),
    ).toEqual({
      allowed: true,
      remainingSeconds: null,
      notice: null,
    })
  })
})
