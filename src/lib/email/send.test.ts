import { describe, expect, it, vi } from 'vitest'
import { replyToAddress, sendEmail, senderAddress } from './send'

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

describe('sender resolution', () => {
  // These exist because of a real production failure. The deployment set
  // ATTUREL_EMAIL_FROM on the verified domain; the code read only
  // EMAIL_FROM_ADDRESS and fell back to a hardcoded address on a domain that
  // was never registered. Resend rejects an unverified `from` with a 403, so
  // every send would have failed while Settings reported Email as Connected
  // and named the address that could not send.
  //
  // The suite runs with no overrides set, so this is the registry fallback.

  it('falls back to the brand sender with no override configured', () => {
    expect(senderAddress()).toMatch(/^Atturel <[^<>]+@[^<>]+>$/)
  })

  it('sends from the domain the product is actually served on', () => {
    // A from-address on a domain nobody registered cannot be verified, so it
    // cannot send. This is the check that would have caught it.
    expect(senderAddress()).toContain('@atturel.com')
    expect(senderAddress()).not.toContain('atturel.app')
  })

  it('produces exactly one set of angle brackets', () => {
    // `Name <address>` is a natural thing to put in an env var, and wrapping an
    // already-wrapped value yields `Atturel <Atturel <hello@…>>`, which is not
    // a valid address and which the provider rejects.
    expect(senderAddress().match(/</g)).toHaveLength(1)
    expect(senderAddress().match(/>/g)).toHaveLength(1)
  })

  it('resolves a reply-to on the same live domain', () => {
    expect(replyToAddress()).toContain('@atturel.com')
    expect(replyToAddress()).not.toContain('atturel.app')
  })
})

describe('plain-text fallback', () => {
  it('opens on words, not on a screenful of blank lines', async () => {
    const { welcomeEmail } = await import('./templates')
    const { toPlainText } = await import('./layout')

    const text = toPlainText(welcomeEmail({ firstName: 'Amary' }).html)

    // Stripping the table layout leaves lines holding a single space. A line
    // like that is not empty, so the blank-run collapse never matched it and
    // the plain-text part began with a dozen blank lines. A fallback nobody can
    // read is not a fallback.
    // A single blank line between paragraphs is wanted. What is not wanted is a
    // line that looks blank but holds whitespace, and runs of them.
    expect(text).not.toMatch(/\n[ \t]+\n/)
    const firstLine = text.split('\n')[0] ?? ''
    expect(firstLine.trim()).toBe(firstLine)
    expect(text).not.toMatch(/\n{3,}/)
    expect(text.slice(0, 40).trim().length).toBeGreaterThan(10)
  })

  it('keeps link destinations, which a text reader cannot click', async () => {
    const { welcomeEmail } = await import('./templates')
    const { toPlainText } = await import('./layout')
    expect(toPlainText(welcomeEmail({ firstName: 'Amary' }).html)).toMatch(/https?:\/\//)
  })
})
