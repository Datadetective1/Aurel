import { absoluteUrl, brand } from '@/lib/brand'
import { fonts, palette } from './theme'

/**
 * EMAIL LAYOUT
 * =============================================================================
 * A table-based shell with fully inlined styles, because email clients are
 * roughly a 1999 browser: no flexbox in Outlook, no <style> block in Gmail's
 * mobile app, no CSS variables anywhere.
 *
 * The composition primitives below are the entire vocabulary templates get.
 * Keeping it small is what stops transactional mail drifting away from the
 * product's visual language one ad-hoc <div> at a time.
 * =============================================================================
 */

/** Escape text destined for an HTML context. Never interpolate raw strings. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The Aperture, drawn as a single outlined arch.
 *
 * An inline SVG would be cleaner but Outlook renders it as nothing and Gmail
 * strips it; a remote image is blocked by default and leaves a broken icon on
 * first open. A bordered table cell always paints.
 *
 * ONE arch, not the three-stroke form used in the app. At 20px in a mail header
 * three parallel strokes stop reading as architecture and start reading as a
 * barcode — the same failure that got the motif pulled from the marketing hero.
 * Outlook ignores border-radius and renders this as an open-bottomed rectangle,
 * which is a plainer version of the same shape rather than a broken one.
 */
function apertureMark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
    <td style="width:16px;height:19px;border:1.5px solid ${palette.accentGraphic};border-bottom:none;border-radius:9px 9px 0 0;font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`
}

/** Section eyebrow: small, letterspaced, uppercase. */
export function eyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-family:${fonts.body};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${palette.inkFaint};">${escapeHtml(text)}</p>`
}

/** Body paragraph. */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${fonts.body};font-size:15px;line-height:1.65;color:${palette.inkSecondary};">${html}</p>`
}

/** Display heading, serif. */
export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${fonts.display};font-size:26px;line-height:1.25;font-weight:400;color:${palette.ink};">${escapeHtml(text)}</h1>`
}

/**
 * Primary action.
 *
 * Ink-filled rather than brass: the accent is a marker in this system, and a
 * brass-flooded button would spend the one colour the brand has on a rectangle.
 */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="background:${palette.surfaceInverse};border-radius:8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;font-family:${fonts.body};font-size:14px;font-weight:500;color:${palette.inkInverse};text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`
}

/** Hairline rule, optionally terminated by the motif. */
export function rule(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:24px 0;"><tr><td style="height:1px;background:${palette.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
}

/** A bordered card, used for evidence and per-person blocks. */
export function card(innerHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:0 0 12px;background:${palette.surface};border:1px solid ${palette.line};border-radius:10px;">
    <tr><td style="padding:16px 18px;">${innerHtml}</td></tr>
  </table>`
}

/**
 * A labelled line of evidence.
 *
 * Email carries the same provenance discipline as the app: if a sentence came
 * from inference rather than a record, it says so here too. Guidance that is
 * honest in the product and confident in the inbox is not honest.
 */
export function evidenceLine(text: string, provenance: string): string {
  return `<p style="margin:0 0 10px;font-family:${fonts.body};font-size:14px;line-height:1.6;color:${palette.inkSecondary};">
    ${text}
    <span style="display:inline-block;margin-left:6px;padding:1px 7px;border:1px solid ${palette.line};border-radius:999px;font-size:11px;color:${palette.inkMuted};white-space:nowrap;">${escapeHtml(provenance)}</span>
  </p>`
}

export interface EmailShell {
  /** Preview text shown in the inbox list beside the subject. */
  preheader: string
  /** Composed body HTML, built from the primitives above. */
  body: string
  /** Optional footer note above the standard legal line. */
  footerNote?: string
  /** Where the unsubscribe link points. Omitted for security mail. */
  unsubscribeUrl?: string
}

/**
 * Wrap composed content in the branded shell.
 *
 * The preheader is a hidden span padded with zero-width spaces so the client
 * does not pull the first visible sentence in after it — the usual cause of
 * "Your brief is ready ‌ ‌ ‌ View in browser Unsubscribe" in the inbox list.
 */
export function renderEmail({ preheader, body, footerNote, unsubscribeUrl }: EmailShell): string {
  const padding = '&#8204;&nbsp;'.repeat(60)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(brand.name)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.bg};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}${padding}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${palette.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">

        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:10px;">${apertureMark()}</td>
              <td style="font-family:${fonts.display};font-size:19px;letter-spacing:0.01em;color:${palette.ink};">${escapeHtml(brand.name)}</td>
            </tr></table>
          </td>
        </tr>

        <tr>
          <td style="background:${palette.surface};border:1px solid ${palette.line};border-radius:14px;padding:32px 28px;">
            ${body}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 8px 0;">
            ${
              footerNote
                ? `<p style="margin:0 0 10px;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${palette.inkMuted};">${footerNote}</p>`
                : ''
            }
            <p style="margin:0 0 6px;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${palette.inkFaint};">
              ${escapeHtml(brand.legalEntity)} · <a href="${escapeHtml(absoluteUrl('/privacy'))}" style="color:${palette.inkMuted};text-decoration:underline;">Privacy</a> · <a href="${escapeHtml(absoluteUrl('/terms'))}" style="color:${palette.inkMuted};text-decoration:underline;">Terms</a>
            </p>
            ${
              unsubscribeUrl
                ? `<p style="margin:0;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${palette.inkFaint};">
                     <a href="${escapeHtml(unsubscribeUrl)}" style="color:${palette.inkFaint};text-decoration:underline;">Turn these emails off</a>
                   </p>`
                : `<p style="margin:0;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${palette.inkFaint};">You are receiving this because it concerns your account security.</p>`
            }
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/**
 * Strip a rendered email down to readable plain text.
 *
 * Every message ships both parts. A text/plain alternative is what keeps mail
 * out of spam filters and readable in clients that refuse HTML — writing it by
 * hand per template would guarantee the two drift apart, so it is derived.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    // Keep the destination of a link, since a text reader cannot click through.
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|h1|h2|tr|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8204;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    // Every line trimmed BEFORE blank runs are collapsed. Stripping a table
    // layout leaves lines holding a single space, and a line like that is not
    // empty - so `\\n{3,}` never matched and the plain-text part opened with a
    // dozen blank lines before the first word. It was a fallback that existed
    // and was not worth reading.
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
