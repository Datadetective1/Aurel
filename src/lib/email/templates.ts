import { absoluteUrl, brand } from '@/lib/brand'
import {
  button,
  card,
  escapeHtml,
  evidenceLine,
  eyebrow,
  heading,
  paragraph,
  renderEmail,
  rule,
} from './layout'
import { fonts, palette } from './theme'

/**
 * TRANSACTIONAL TEMPLATES
 * =============================================================================
 * Three rules, applied to every message here:
 *
 *   1. Say the useful thing in the subject line. "Your Monday" is not a
 *      subject; "Three meetings, one unprepared" is.
 *   2. Carry the same evidence discipline as the app. If a line is inference,
 *      it is labelled inference in the inbox too.
 *   3. Never put a person's private notes in a preheader — that text is visible
 *      in a notification on a locked phone screen.
 *
 * Each builder returns a subject plus HTML, ready for `sendEmail`.
 * =============================================================================
 */

export interface BuiltEmail {
  subject: string
  html: string
}

const preferencesUrl = absoluteUrl('/settings/appearance')

/** Plural helper: `count(1, 'meeting')` → "1 meeting". */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

// =============================================================================
// WELCOME
// =============================================================================

export function welcomeEmail({ firstName }: { firstName: string }): BuiltEmail {
  const name = firstName.trim() || 'there'

  return {
    subject: `${brand.name}: start with the meeting that matters most`,
    html: renderEmail({
      preheader: 'Add one person, then prepare for one conversation.',
      unsubscribeUrl: preferencesUrl,
      body: [
        eyebrow('Welcome'),
        heading(`${name}, one meeting is enough to start`),
        paragraph(
          `${escapeHtml(brand.name)} is not a CRM and it will not ask you to fill in a database. It becomes useful the moment there is one real conversation to prepare for.`,
        ),
        paragraph('The fastest path is three steps, and none of them take long:'),
        card(
          [
            step(1, 'Add the person you are meeting next', 'A name, a company and a role.'),
            // Step two used to be "paste one public link", which was the right
            // first action until automatic research shipped and made it the
            // fallback. The first email a new user gets should not send them
            // hunting for a URL the product will find on its own.
            step(2, 'Press Research', 'It finds and checks the public sources itself.'),
            step(
              3,
              'Open the brief before the meeting',
              'Every line cites where it came from, and says what is still unknown.',
            ),
          ].join(''),
        ),
        button('Prepare for a meeting', absoluteUrl('/prepare')),
        rule(),
        paragraph(
          `<strong style="color:${palette.ink};font-weight:500;">What ${escapeHtml(brand.name)} will never do:</strong> guess at anyone's personal characteristics, score people for hiring or promotion, or present an inference as a fact. Anything it is unsure about is labeled, every time.`,
        ),
      ].join(''),
      footerNote: `You are receiving this because you created an ${escapeHtml(brand.name)} account.`,
    }),
  }
}

function step(index: number, title: string, detail: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;"><tr>
    <td width="26" valign="top" style="font-family:${fonts.display};font-size:15px;color:${palette.accent};padding-top:1px;">${index}</td>
    <td>
      <p style="margin:0;font-family:${fonts.body};font-size:14px;font-weight:500;color:${palette.ink};">${escapeHtml(title)}</p>
      <p style="margin:2px 0 0;font-family:${fonts.body};font-size:13px;line-height:1.5;color:${palette.inkMuted};">${escapeHtml(detail)}</p>
    </td>
  </tr></table>`
}

// =============================================================================
// MEETING REMINDER
// =============================================================================

export interface MeetingReminderInput {
  firstName: string
  meetingId: string
  title: string
  /** Already formatted in the recipient's timezone by the caller. */
  whenLabel: string
  attendees: string[]
  objective?: string | null
  /** Concrete gaps, e.g. "No notes from your last conversation". */
  unknowns: string[]
  /** True when nothing has been recorded about the attendees yet. */
  unprepared: boolean
}

export function meetingReminderEmail(input: MeetingReminderInput): BuiltEmail {
  const who = input.attendees.length > 0 ? input.attendees.join(', ') : 'your meeting'

  return {
    subject: input.unprepared
      ? `${input.title} — nothing recorded yet`
      : `${input.title} — ${input.whenLabel}`,
    html: renderEmail({
      // Names of attendees, no notes: this line shows on a lock screen.
      preheader: `${input.whenLabel} with ${who}.`,
      unsubscribeUrl: preferencesUrl,
      body: [
        eyebrow('Coming up'),
        heading(input.title),
        paragraph(
          `<strong style="color:${palette.ink};font-weight:500;">${escapeHtml(input.whenLabel)}</strong> · ${escapeHtml(who)}`,
        ),
        input.objective
          ? card(
              `${eyebrow('Your objective')}<p style="margin:0;font-family:${fonts.body};font-size:15px;line-height:1.6;color:${palette.ink};">${escapeHtml(input.objective)}</p>`,
            )
          : '',
        input.unknowns.length > 0
          ? card(
              `${eyebrow(`What ${brand.name} does not know`)}${input.unknowns
                .map((gap) => evidenceLine(escapeHtml(gap), 'unknown'))
                .join('')}`,
            )
          : '',
        button('Open the brief', absoluteUrl(`/meetings/${input.meetingId}/brief`)),
        input.unprepared
          ? paragraph(
              `Nothing is recorded about ${escapeHtml(who)} yet, so there is no brief worth reading — only what you supply. Two minutes of context now is the difference.`,
            )
          : '',
      ].join(''),
    }),
  }
}

// =============================================================================
// WEEKLY RELATIONSHIP SUMMARY
// =============================================================================

export interface WeeklySummaryInput {
  firstName: string
  weekLabel: string
  meetingsHeld: number
  peopleMet: number
  /** Promises the user made that are past due. The most useful thing here. */
  overdueCommitments: Array<{ description: string; person: string; dueLabel: string }>
  /** People with a long silence and a real reason to matter. */
  quietRelationships: Array<{ name: string; lastContactLabel: string }>
  /** Observations awaiting confirmation, so memory stays user-owned. */
  pendingMemoryCount: number
}

export function weeklySummaryEmail(input: WeeklySummaryInput): BuiltEmail {
  const overdue = input.overdueCommitments
  const subject =
    overdue.length > 0
      ? `${count(overdue.length, 'promise')} past due`
      : `Your week: ${count(input.meetingsHeld, 'conversation')}`

  return {
    subject,
    html: renderEmail({
      preheader:
        overdue.length > 0
          ? `Something you said you would do has slipped.`
          : `A short read on the week's relationships.`,
      unsubscribeUrl: preferencesUrl,
      body: [
        eyebrow(input.weekLabel),
        heading(
          overdue.length > 0 ? 'You owe someone something' : 'A quiet week, and what to notice',
        ),

        overdue.length > 0
          ? card(
              `${eyebrow('Past due')}${overdue
                .map((item) =>
                  evidenceLine(
                    `${escapeHtml(item.description)} — <span style="color:${palette.ink};">${escapeHtml(item.person)}</span>, due ${escapeHtml(item.dueLabel)}`,
                    'from your records',
                  ),
                )
                .join('')}`,
            )
          : paragraph('Nothing you promised is past due. That is worth noticing.'),

        input.quietRelationships.length > 0
          ? card(
              `${eyebrow('Gone quiet')}${input.quietRelationships
                .map((person) =>
                  evidenceLine(
                    `<span style="color:${palette.ink};">${escapeHtml(person.name)}</span> — last spoke ${escapeHtml(person.lastContactLabel)}`,
                    'from your records',
                  ),
                )
                .join('')}
               <p style="margin:6px 0 0;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${palette.inkFaint};">A gap is a fact, not a verdict. Some relationships are meant to be occasional.</p>`,
            )
          : '',

        rule(),
        paragraph(
          `${escapeHtml(count(input.meetingsHeld, 'conversation'))} with ${escapeHtml(count(input.peopleMet, 'person', 'people'))} this week.`,
        ),

        input.pendingMemoryCount > 0
          ? paragraph(
              `${escapeHtml(count(input.pendingMemoryCount, 'observation'))} waiting for you to confirm or reject. Nothing enters your relationship record until you say so.`,
            )
          : '',

        button('Open Today', absoluteUrl('/today')),
      ].join(''),
    }),
  }
}

// =============================================================================
// SECURITY
// =============================================================================

/**
 * Password change confirmation.
 *
 * No unsubscribe link and no marketing: a security notice a user can turn off
 * is not a security notice.
 */
export function passwordChangedEmail({ firstName }: { firstName: string }): BuiltEmail {
  const name = firstName.trim() || 'there'

  return {
    subject: `Your ${brand.name} password was changed`,
    html: renderEmail({
      preheader: 'If this was not you, act now.',
      body: [
        eyebrow('Security'),
        heading('Your password was changed'),
        paragraph(`${escapeHtml(name)}, the password on your account was changed just now.`),
        paragraph(
          `If that was you, nothing else is needed. If it was not, reset your password immediately and then contact <a href="mailto:${escapeHtml(brand.email.support)}" style="color:${palette.accent};">${escapeHtml(brand.email.support)}</a>.`,
        ),
        button('Reset your password', absoluteUrl('/forgot-password')),
      ].join(''),
    }),
  }
}
