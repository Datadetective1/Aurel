import { describe, expect, it } from 'vitest'
import { escapeHtml, renderEmail, toPlainText } from '@/lib/email/layout'
import {
  meetingReminderEmail,
  weeklySummaryEmail,
  welcomeEmail,
  passwordChangedEmail,
} from '@/lib/email/templates'
import { brand } from '@/lib/brand'

describe('email layout', () => {
  it('escapes user content so a name cannot inject markup', () => {
    const hostile = '<script>alert(1)</script>'
    expect(escapeHtml(hostile)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('never emits an unescaped script tag from a hostile display name', () => {
    const email = welcomeEmail({ firstName: '</h1><script>alert(1)</script>' })
    expect(email.html).not.toMatch(/<script/i)
  })

  it('derives readable plain text that keeps link destinations', () => {
    const html = renderEmail({
      preheader: 'Preview',
      body: '<p>Hello <a href="https://example.com/x">here</a></p>',
    })
    const text = toPlainText(html)

    expect(text).toContain('Hello')
    expect(text).toContain('https://example.com/x')
    expect(text).not.toContain('<p>')
    // The hidden preheader padding must not survive into the text part.
    expect(text).not.toContain('&#8204;')
  })

  it('produces a complete HTML document', () => {
    const html = renderEmail({ preheader: 'p', body: '<p>x</p>' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
  })

  it('uses no remote assets, which default-blocked images would break', () => {
    const html = welcomeEmail({ firstName: 'Alex' }).html
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/@font-face/i)
  })
})

describe('transactional templates', () => {
  it('says the useful thing in the subject rather than naming the product', () => {
    const unprepared = meetingReminderEmail({
      firstName: 'Alex',
      meetingId: 'm1',
      title: 'Budget review',
      whenLabel: 'tomorrow at 9:00 AM',
      attendees: ['Maya Chen'],
      objective: 'Leave with approval for the extra headcount',
      unknowns: ['No notes from your last conversation'],
      unprepared: true,
    })

    expect(unprepared.subject).toBe('Budget review — nothing recorded yet')
    expect(unprepared.html).toContain('Budget review')
    expect(unprepared.html).toContain('Maya Chen')
  })

  it('keeps private notes out of the preheader, which shows on a lock screen', () => {
    const email = meetingReminderEmail({
      firstName: 'Alex',
      meetingId: 'm1',
      title: 'One to one',
      whenLabel: 'today at 4:00 PM',
      attendees: ['Daniel Brooks'],
      objective: 'Raise the missed deadline without damaging trust',
      unknowns: [],
      unprepared: false,
    })

    // The preheader is the hidden span before the first table.
    const preheader = email.html.slice(0, email.html.indexOf('<table'))
    expect(preheader).toContain('Daniel Brooks')
    expect(preheader).not.toContain('missed deadline')
  })

  it('labels an unknown as unknown in the inbox, exactly as in the app', () => {
    const email = meetingReminderEmail({
      firstName: 'Alex',
      meetingId: 'm1',
      title: 'Intro call',
      whenLabel: 'Thursday at 11:00 AM',
      attendees: ['Priya Shah'],
      objective: null,
      unknowns: ['You have never spoken directly'],
      unprepared: false,
    })

    expect(email.html).toContain(`What ${brand.name} does not know`)
    expect(email.html).toContain('You have never spoken directly')
    expect(email.html).toContain('unknown')
  })

  it('leads the weekly summary with a broken promise when there is one', () => {
    const email = weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 4,
      peopleMet: 3,
      overdueCommitments: [
        { description: 'Send the revised timeline', person: 'Maya Chen', dueLabel: 'Friday' },
      ],
      quietRelationships: [],
      pendingMemoryCount: 0,
    })

    expect(email.subject).toBe('1 promise past due')
    expect(email.html).toContain('Send the revised timeline')
  })

  it('pluralises counts rather than printing "1 promises"', () => {
    const many = weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 1,
      peopleMet: 1,
      overdueCommitments: [
        { description: 'a', person: 'b', dueLabel: 'c' },
        { description: 'd', person: 'e', dueLabel: 'f' },
      ],
      quietRelationships: [],
      pendingMemoryCount: 0,
    })
    expect(many.subject).toBe('2 promises past due')

    const none = weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 1,
      peopleMet: 1,
      overdueCommitments: [],
      quietRelationships: [],
      pendingMemoryCount: 0,
    })
    expect(none.subject).toBe('Your week: 1 conversation')
    expect(toPlainText(none.html)).toContain('1 person')
  })

  it('frames a silence as a fact rather than a failure', () => {
    const email = weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 2,
      peopleMet: 2,
      overdueCommitments: [],
      quietRelationships: [{ name: 'Elena Torres', lastContactLabel: '3 months ago' }],
      pendingMemoryCount: 2,
    })

    expect(email.html).toContain('Elena Torres')
    expect(email.html).toContain('A gap is a fact, not a verdict')
  })

  it('gives security mail no unsubscribe link', () => {
    const security = passwordChangedEmail({ firstName: 'Alex' })
    expect(security.html).not.toContain('Turn these emails off')
    expect(security.html).toContain('concerns your account security')

    // Everything else must have one.
    const marketingish = welcomeEmail({ firstName: 'Alex' })
    expect(marketingish.html).toContain('Turn these emails off')
  })

  it('falls back to a greeting when no name is stored', () => {
    expect(welcomeEmail({ firstName: '   ' }).html).toContain('there, one meeting is enough')
  })
})
