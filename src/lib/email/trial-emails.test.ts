import { describe, expect, it } from 'vitest'
import {
  proActivatedEmail,
  proFirstChargeSoonEmail,
  proCancellationScheduledEmail,
  proTrialEndedEmail,
  proTrialEndingEmail,
  proTrialStartedEmail,
} from './templates'

/**
 * The trial's emails, and the two subscription emails a trial changes. Each
 * says what happens next, when money moves (or that it does not), and that
 * nothing is deleted.
 */

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the trial’s own notices', () => {
  it('started: the end date, no card, and what happens after', () => {
    const e = proTrialStartedEmail({ firstName: 'Ada', endsOn: '8 Nov 2026', price: '$29' })
    expect(e.subject).toBe('Your 14-day Pro trial has started')
    const body = text(e.html)
    expect(body).toContain('Pro is on until 8 Nov 2026')
    expect(body).toContain('nothing will be charged')
    expect(body).toContain('returns to Free, unless you choose Subscribe to Pro ($29 a month)')
    expect(body).toContain('Nothing you add is deleted')
  })

  it('ending: a clear reminder with the date, the choice and the terms', () => {
    const e = proTrialEndingEmail({ firstName: 'Ada', endsOn: '8 Nov 2026', price: '$29' })
    expect(e.subject).toBe('Your Pro trial ends on 8 Nov 2026')
    const body = text(e.html)
    expect(body).toContain('Nothing is charged unless you do')
    expect(body).toContain(
      'the first charge of $29 is when it ends, then $29 every month until you cancel',
    )
    expect(body).toContain('Subscribe to Pro')
    expect(body).toContain('read, edit and export everyone and everything')
  })

  it('ended: Free, nothing charged, nothing deleted', () => {
    const e = proTrialEndedEmail({ firstName: 'Ada' })
    expect(e.subject).toBe('Your Pro trial has ended')
    const body = text(e.html)
    expect(body).toContain('Nothing was charged')
    expect(body).toContain('Nothing you add is deleted')
  })
})

describe('subscribing during the trial', () => {
  it('reminds of the first charge before it is taken, and how not to be charged', () => {
    const e = proFirstChargeSoonEmail({ firstName: 'Ada', chargeOn: '8 Nov 2026', price: '$29' })
    expect(e.subject).toBe('Your first Pro charge is on 8 Nov 2026')
    const body = text(e.html)
    expect(body).toContain(
      'your first charge of $29 is taken, then $29 every month until you cancel',
    )
    expect(body).toContain('cancel from Settings before 8 Nov 2026')
  })

  it('confirms the first charge date and the monthly terms', () => {
    const e = proActivatedEmail({
      firstName: 'Ada',
      planLabel: 'Pro',
      firstChargeOn: '8 Nov 2026',
      price: '$29',
    })
    expect(e.subject).toBe('You are subscribed to Pro')
    const body = text(e.html)
    expect(body).toContain(
      'Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel',
    )
    expect(body).toContain('Cancel from Settings before 8 Nov 2026 and you will not be charged')
  })

  it('without a trial, the activation email is unchanged', () => {
    expect(proActivatedEmail({ firstName: 'Ada', planLabel: 'Pro' }).subject).toBe('Pro is on')
  })

  it('canceling before the first charge does not say "charged again"', () => {
    const inTrial = text(
      proCancellationScheduledEmail({ firstName: 'Ada', endsOn: '8 Nov 2026', inTrial: true }).html,
    )
    expect(inTrial).toContain('You will not be charged.')
    expect(inTrial).not.toContain('again')
    const paid = text(
      proCancellationScheduledEmail({ firstName: 'Ada', endsOn: '8 Nov 2026' }).html,
    )
    expect(paid).toContain('You will not be charged again.')
  })
})
