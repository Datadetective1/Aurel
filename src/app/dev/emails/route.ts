import { notFound } from 'next/navigation'
import type { NextRequest } from 'next/server'
import {
  meetingReminderEmail,
  passwordChangedEmail,
  weeklySummaryEmail,
  welcomeEmail,
  type BuiltEmail,
} from '@/lib/email/templates'
import { toPlainText } from '@/lib/email/layout'

/**
 * EMAIL PREVIEW — development only.
 *
 * Transactional mail is the one surface that never appears while building the
 * product, so it is the one that silently rots. This renders each template
 * against representative fixtures at `/dev/emails?t=<name>`, and `&text=1`
 * shows the plain-text alternative that ships alongside it.
 *
 * Hard 404 outside development: the fixtures are invented, but a preview
 * endpoint on a production domain is a phishing template generator.
 */
const TEMPLATES: Record<string, () => BuiltEmail> = {
  welcome: () => welcomeEmail({ firstName: 'Alex' }),

  'meeting-reminder': () =>
    meetingReminderEmail({
      firstName: 'Alex',
      meetingId: '00000000-0000-0000-0000-000000000000',
      title: 'Budget review with Maya',
      whenLabel: 'Tomorrow at 9:00 AM',
      attendees: ['Maya Chen'],
      objective: 'Leave with approval for the extra headcount',
      unknowns: [
        'No notes from your last conversation',
        'You have not confirmed her current title',
      ],
      unprepared: false,
    }),

  'meeting-unprepared': () =>
    meetingReminderEmail({
      firstName: 'Alex',
      meetingId: '00000000-0000-0000-0000-000000000000',
      title: 'Intro call with Priya Shah',
      whenLabel: 'Thursday at 11:00 AM',
      attendees: ['Priya Shah'],
      objective: null,
      unknowns: ['You have never spoken directly', 'Nothing is recorded about her priorities'],
      unprepared: true,
    }),

  'weekly-summary': () =>
    weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 4,
      peopleMet: 3,
      overdueCommitments: [
        { description: 'Send the revised timeline', person: 'Maya Chen', dueLabel: 'Friday' },
      ],
      quietRelationships: [{ name: 'Elena Torres', lastContactLabel: '3 months ago' }],
      pendingMemoryCount: 2,
    }),

  'weekly-quiet': () =>
    weeklySummaryEmail({
      firstName: 'Alex',
      weekLabel: 'Week of 18 August',
      meetingsHeld: 1,
      peopleMet: 1,
      overdueCommitments: [],
      quietRelationships: [],
      pendingMemoryCount: 0,
    }),

  'password-changed': () => passwordChangedEmail({ firstName: 'Alex' }),
}

export function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') notFound()

  const params = request.nextUrl.searchParams
  const name = params.get('t')

  if (!name) return html(index())

  const build = TEMPLATES[name]
  if (!build) return html(index(`No template named "${escapeAttribute(name)}".`), 404)

  const email = build()

  if (params.get('text') === '1') {
    return new Response(`Subject: ${email.subject}\n\n${toPlainText(email.html)}`, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return html(email.html)
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function escapeAttribute(value: string): string {
  return value.replace(/[<>"'&]/g, '')
}

function index(error?: string): string {
  const items = Object.keys(TEMPLATES)
    .map(
      (name) =>
        `<li style="margin:0 0 10px;">
          <a href="?t=${name}" style="color:#1a1815;">${name}</a>
          <a href="?t=${name}&text=1" style="margin-left:10px;font-size:13px;color:#6b6862;">plain text</a>
        </li>`,
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Email preview</title></head>
  <body style="margin:0;padding:48px;background:#fbf9f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a867e;">Development only</p>
    <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-weight:400;font-size:28px;color:#1a1815;">Email preview</h1>
    ${error ? `<p style="color:#9b2c25;">${error}</p>` : ''}
    <ul style="list-style:none;padding:0;margin:0;font-size:15px;">${items}</ul>
  </body></html>`
}
