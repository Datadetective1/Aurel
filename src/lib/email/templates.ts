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

  // The same three steps, in the same words, as Getting Started on Today. The
  // email used to teach its own sequence -- add a person, press Research, open
  // the brief -- while the product taught another, and a new user cannot tell
  // which one is right. Research is part of step two here as it is there.
  return {
    subject: `${brand.name}: prepare for one real conversation`,
    html: renderEmail({
      preheader: 'Find the meeting, choose who it is with, prepare it.',
      unsubscribeUrl: preferencesUrl,
      body: [
        eyebrow('Welcome'),
        heading(`${name}, start with one meeting`),
        paragraph(
          `${escapeHtml(brand.name)} becomes useful the moment there is one real conversation to prepare for. Three steps:`,
        ),
        card(
          [
            step(1, 'Find the meeting', 'Connect your calendar (read-only), or create it by hand.'),
            step(
              2,
              'Choose who it’s with',
              'A name, a company and a role. It checks public professional sources to confirm who they are.',
            ),
            step(
              3,
              'Prepare the meeting',
              'Say what you need from it. Every line of the brief shows where it came from.',
            ),
          ].join(''),
        ),
        // Sent at sign-up, before the address is confirmed: say so, or the
        // button lands on a sign-in that refuses with "confirm your email".
        paragraph(
          'First, confirm your email address using the separate confirmation message we just sent.',
        ),
        button('Open Today', absoluteUrl('/today')),
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
              `${escapeHtml(count(input.pendingMemoryCount, 'observation'))} waiting for you to confirm or reject. None of them is kept until you say so.`,
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

// =============================================================================
// FOLLOW-THROUGH
// =============================================================================

export interface FollowThroughItem {
  /** "You said you'd send the proposal." Already worded for who owes it. */
  phrase: string
  timing: { label: string; tone: 'overdue' | 'today' | 'soon' | 'waiting' | 'open' }
  /** "Promised in Budget sync, 24 Aug", or null. */
  source: string | null
  person: { name: string; initials: string; photoUrl: string | null } | null
  /** Where the loop lives. Never a generic dashboard. */
  href: string
  personHref: string | null
  sourceHref: string | null
}

export interface FollowThroughInput {
  firstName: string
  headline: string
  subject: string
  items: FollowThroughItem[]
  /** Qualifying loops that did not fit. */
  more: number
  /** Where the whole list lives. */
  loopsUrl: string
}

const TIMING_COLOUR: Record<FollowThroughItem['timing']['tone'], string> = {
  overdue: palette.critical,
  today: palette.accent,
  soon: palette.inkSecondary,
  waiting: palette.inkMuted,
  open: palette.inkMuted,
}

/**
 * A face for the inbox. A 36px circle with initials, and the photo on top
 * when there is one. The initials are the fallback and the alt text, so a
 * client that blocks images still shows who this is about.
 */
function faceCell(person: FollowThroughItem['person']): string {
  if (!person) {
    return `<td width="36" valign="top" style="padding:2px 12px 0 0;">
      <div style="width:36px;height:36px;border-radius:18px;background:${palette.line};"></div>
    </td>`
  }
  const initials = escapeHtml(person.initials)
  const circle = `width:36px;height:36px;border-radius:18px;background:${palette.accentWash};color:${palette.accent};font-family:${fonts.body};font-size:12px;font-weight:600;letter-spacing:0.02em;text-align:center;line-height:36px;`
  return `<td width="36" valign="top" style="padding:2px 12px 0 0;">
    ${
      person.photoUrl
        ? `<img src="${escapeHtml(person.photoUrl)}" alt="${initials}" width="36" height="36" style="display:block;${circle}object-fit:cover;border:1px solid ${palette.line};">`
        : `<div style="${circle}">${initials}</div>`
    }
  </td>`
}

/**
 * The daily follow-through. Short enough to read in seconds: a headline, one
 * row per loop with a face, what is owed and by whom, when, and where it came
 * from. Each row links to its own loop.
 */
export function followThroughEmail(input: FollowThroughInput): BuiltEmail {
  const rows = input.items
    .map((item) => {
      const person = item.person
      const name = person
        ? item.personHref
          ? `<a href="${escapeHtml(item.personHref)}" style="color:${palette.ink};text-decoration:none;font-weight:500;">${escapeHtml(person.name)}</a>`
          : `<span style="color:${palette.ink};font-weight:500;">${escapeHtml(person.name)}</span>`
        : ''
      const source = item.source
        ? `<div style="margin-top:4px;font-family:${fonts.body};font-size:12px;line-height:1.5;color:${palette.inkFaint};">${
            item.sourceHref
              ? `<a href="${escapeHtml(item.sourceHref)}" style="color:${palette.inkFaint};text-decoration:underline;">${escapeHtml(item.source)}</a>`
              : escapeHtml(item.source)
          }</div>`
        : ''
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:0 0 10px;background:${palette.surface};border:1px solid ${palette.line};border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            ${faceCell(person)}
            <td valign="top">
              ${name ? `<div style="font-family:${fonts.body};font-size:13px;line-height:1.4;margin-bottom:2px;">${name}</div>` : ''}
              <div style="font-family:${fonts.body};font-size:15px;line-height:1.5;color:${palette.ink};">
                <a href="${escapeHtml(item.href)}" style="color:${palette.ink};text-decoration:none;">${escapeHtml(item.phrase)}</a>
              </div>
              <div style="margin-top:5px;font-family:${fonts.body};font-size:12px;line-height:1.5;font-weight:500;color:${TIMING_COLOUR[item.timing.tone]};">${escapeHtml(item.timing.label)}</div>
              ${source}
            </td>
          </tr></table>
        </td></tr>
      </table>`
    })
    .join('')

  const name = input.firstName.trim() || 'there'

  return {
    subject: input.subject,
    html: renderEmail({
      // Counts only. A promise's wording can name a colleague and a deal, and
      // this line shows on a locked phone.
      preheader: input.headline,
      unsubscribeUrl: preferencesUrl,
      body: [
        eyebrow('Follow through'),
        heading(input.headline),
        paragraph(
          `${escapeHtml(name)}, these are the open loops that matter today. Everything here is something you confirmed.`,
        ),
        rows,
        input.more > 0
          ? paragraph(
              `${escapeHtml(count(input.more, 'more loop'))} ${input.more === 1 ? 'is' : 'are'} open beyond these.`,
            )
          : '',
        button('Open your loops', input.loopsUrl),
      ].join(''),
      footerNote: `${escapeHtml(brand.name)} sends this once a day, only on days something is open. Done, Later and Cancel are one tap in the app.`,
    }),
  }
}

// =============================================================================
// BILLING
// =============================================================================
//
// Product messages about the plan, not receipts: Stripe sends the receipt and
// the invoice, and a second copy from us would be noise. These say what the
// change means inside the product -- what is now available, what happens to
// the record -- which Stripe cannot.

const billingUrl = absoluteUrl('/settings/billing')

export function proActivatedEmail({
  firstName,
  planLabel,
}: {
  firstName: string
  planLabel: string
}): BuiltEmail {
  const name = firstName.trim() || 'there'
  return {
    subject: `${planLabel} is on`,
    html: renderEmail({
      preheader: 'Unlimited people, the Atlas, and more of everything each month.',
      body: [
        eyebrow('Your plan'),
        heading(`${escapeHtml(name)}, ${escapeHtml(planLabel)} is on`),
        paragraph(
          'Unlimited people, the Relationship Atlas, 600 minutes of transcription, and more briefs, research and conversations each month are now part of your account.',
        ),
        paragraph(
          'Your receipt comes separately from our payment processor. You can change or cancel the plan any time from Settings.',
        ),
        button('See your plan', billingUrl),
      ].join(''),
      footerNote: `A notice about your ${escapeHtml(brand.name)} plan.`,
    }),
  }
}

export function proCancellationScheduledEmail({
  firstName,
  endsOn,
}: {
  firstName: string
  /** Already formatted for the reader, or null when unknown. */
  endsOn: string | null
}): BuiltEmail {
  const name = firstName.trim() || 'there'
  return {
    subject: endsOn ? `Your Pro plan ends on ${endsOn}` : 'Your Pro plan is set to end',
    html: renderEmail({
      preheader: 'Your record stays exactly as it is.',
      body: [
        eyebrow('Your plan'),
        heading('Your Pro plan is set to end'),
        paragraph(
          `${escapeHtml(name)}, you will keep Pro${endsOn ? ` until ${escapeHtml(endsOn)}` : ' until the end of the period you paid for'}. You will not be charged again.`,
        ),
        paragraph(
          'After that the account moves to Free. Nothing is deleted: every person, conversation and commitment stays readable, and you can export it any time.',
        ),
        button('Keep Pro', billingUrl),
      ].join(''),
      footerNote: `A notice about your ${escapeHtml(brand.name)} plan.`,
    }),
  }
}

export function proEndedEmail({
  firstName,
  reason,
}: {
  firstName: string
  reason: 'canceled' | 'payment'
}): BuiltEmail {
  const name = firstName.trim() || 'there'
  return {
    subject:
      reason === 'payment'
        ? 'Your Pro plan ended: payment not received'
        : 'Your Pro plan has ended',
    html: renderEmail({
      preheader: 'Your record stays exactly as it is.',
      body: [
        eyebrow('Your plan'),
        heading('Your account is now on Free'),
        paragraph(
          reason === 'payment'
            ? `${escapeHtml(name)}, we could not collect the payment for Pro, so the plan has ended.`
            : `${escapeHtml(name)}, your Pro plan has ended.`,
        ),
        paragraph(
          'Nothing is deleted. Every person, conversation and commitment stays readable, and you can export it any time. Free limits now apply to new work.',
        ),
        button(reason === 'payment' ? 'Restart Pro' : 'See plans', billingUrl),
      ].join(''),
      footerNote: `A notice about your ${escapeHtml(brand.name)} plan.`,
    }),
  }
}
