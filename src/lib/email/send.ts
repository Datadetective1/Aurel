import 'server-only'
import { brand, emailFrom } from '@/lib/brand'
import { serverEnv, features, emailFromOverride, emailReplyToOverride } from '@/lib/env'
import { logger } from '@/lib/logger'
import { toPlainText } from './layout'

/**
 * EMAIL DELIVERY
 * =============================================================================
 * One transport, one failure policy.
 *
 * Without a provider key the message is logged rather than sent, and the caller
 * is told which happened. That is not a stub: a deployment with no mail
 * configured is a supported state, and the product says so on the Capabilities
 * screen instead of pretending delivery succeeded.
 *
 * Sending NEVER throws. An email is a side effect of something the user already
 * accomplished — failing their action because a mail server was slow would
 * trade a real success for a cosmetic one.
 * =============================================================================
 */

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  /** Derived from the HTML when omitted. */
  text?: string
  replyTo?: string
  /** Categorises the send in logs and metrics. Never contains user content. */
  kind: string
}

export type SendResult =
  | { ok: true; delivered: true; id: string }
  | { ok: true; delivered: false; reason: 'not_configured' }
  | { ok: false; reason: 'rejected' | 'error' }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const text = message.text ?? toPlainText(message.html)

  if (!features.emailDelivery) {
    // Subject and recipient only. The body can contain a person's private
    // relationship record, and that must not end up in a log aggregator.
    logger.info('email.not_delivered', {
      kind: message.kind,
      to: redactAddress(message.to),
      subject: message.subject,
      reason: 'no_provider_configured',
    })
    return { ok: true, delivered: false, reason: 'not_configured' }
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderAddress(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text,
        reply_to: message.replyTo ?? replyToAddress(),
      }),
      // A hung mail API must not hold a server action open indefinitely.
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      // Status only. The provider echoes the payload back in error bodies,
      // which would put the message content into the log.
      logger.warn('email.rejected', {
        kind: message.kind,
        status: response.status,
        to: redactAddress(message.to),
      })
      return { ok: false, reason: 'rejected' }
    }

    const payload = (await response.json()) as { id?: string }
    logger.info('email.sent', { kind: message.kind, id: payload.id })
    return { ok: true, delivered: true, id: payload.id ?? 'unknown' }
  } catch (error) {
    logger.warn('email.failed', {
      kind: message.kind,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: 'error' }
  }
}

/**
 * The verified sender, overridable by env.
 *
 * The override exists because the registry's address is only sendable once its
 * domain is verified with the provider — a deployment on a different domain has
 * to be able to change it without editing the brand file. Getting this wrong is
 * silent: the provider rejects an unverified `from` with a 403 and the UI still
 * reports email as connected.
 */
export function senderAddress(): string {
  return withDisplayName(emailFromOverride, brand.email.fromName) ?? emailFrom
}

/** Where replies land. Falls back to the registry. */
export function replyToAddress(): string {
  return emailReplyToOverride?.trim() || brand.email.replyTo
}

/**
 * Accepts either a bare address or a full `Name <address>` string.
 *
 * Both are natural things to put in an env var, and wrapping an already-wrapped
 * value produces `Atturel <Atturel <hello@…>>`, which is not a valid RFC 5322
 * address and which the provider rejects.
 */
function withDisplayName(value: string | undefined, displayName: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.includes('<') ? trimmed : `${displayName} <${trimmed}>`
}

/** `a***@example.com` — enough to correlate a support ticket, not to identify. */
function redactAddress(address: string): string {
  const [local, domain] = address.split('@')
  if (!domain || !local) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}
