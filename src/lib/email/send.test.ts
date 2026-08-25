import { describe, expect, it, vi } from 'vitest'
import { sendEmail } from './send'

/**
 * Delivery contract.
 *
 * Two guarantees the callers depend on:
 *
 *   1. sendEmail NEVER throws. A welcome email is a side effect of a signup
 *      that already succeeded; a mail outage must not fail the account
 *      creation that triggered it.
 *   2. With no provider configured it reports that honestly rather than
 *      pretending to have sent, and writes only the subject and a redacted
 *      recipient — never the body, which carries private relationship content.
 *
 * The test environment has no RESEND_API_KEY, so this exercises the
 * unconfigured path, which is the one production is currently running.
 */

describe('sendEmail', () => {
  it('reports not-configured instead of pretending to deliver', async () => {
    const result = await sendEmail({
      to: 'someone@example.invalid',
      subject: 'Welcome',
      html: '<p>hello</p>',
      kind: 'welcome',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.delivered).toBe(false)
    if (result.delivered) return
    expect(result.reason).toBe('not_configured')
  })

  it('never throws, even on a hostile recipient', async () => {
    await expect(
      sendEmail({ to: '', subject: '', html: '', kind: 'welcome' }),
    ).resolves.toBeDefined()
  })

  it('does not put the message body in the log', async () => {
    const secret = 'Maya objected to the timeline in March'
    const logged: unknown[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logged.push(args)
    })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation((...args) => {
      logged.push(args)
    })

    await sendEmail({
      to: 'alex@example.invalid',
      subject: 'Your week',
      html: `<p>${secret}</p>`,
      kind: 'weekly_summary',
    })

    spy.mockRestore()
    infoSpy.mockRestore()

    const serialised = JSON.stringify(logged)
    expect(serialised).not.toContain(secret)
    // The recipient is redacted to a single leading character.
    expect(serialised).not.toContain('alex@example.invalid')
  })
})
