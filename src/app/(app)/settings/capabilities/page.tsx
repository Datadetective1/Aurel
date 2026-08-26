import Link from 'next/link'
import type { Metadata } from 'next'
import {
  BookOpenText,
  CalendarDays,
  CircleCheck,
  CreditCard,
  FileText,
  Link2,
  Mail,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { Badge, Eyebrow, Panel } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { requireOnboardedUser } from '@/lib/auth'
import { aiStatus } from '@/lib/ai/provider'
import { researchCapability } from '@/lib/research/providers'
import { getEntitlements } from '@/lib/billing/entitlements'
import { features } from '@/lib/env'
import { senderAddress } from '@/lib/email/send'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Capabilities', robots: { index: false, follow: false } }

/**
 * CAPABILITIES
 * =============================================================================
 * An inventory of what this deployment can actually do, and — where something
 * is off — what would turn it on and who can do that.
 *
 * Five states, defined below. The one that matters most is what "available"
 * is NOT allowed to mean: anything needing a credential, or absent from this
 * deployment entirely, must never be shown as available.
 *
 * "Needs setup" is split further by WHO can act. Most integrations here are
 * server credentials: showing an account holder a button they cannot use is
 * worse than telling them plainly that it is a deployment setting. Actions the
 * user really can take are rendered as buttons; the rest name the environment
 * variable an operator sets, which is the actual next step.
 * =============================================================================
 */

type Status = 'configured' | 'available' | 'not_connected' | 'setup' | 'unavailable'

interface Capability {
  id: string
  label: string
  icon: typeof Sparkles
  status: Status
  /** What it does, or what is missing. One sentence. */
  detail: string
  /** Something the signed-in person can do right now. */
  userAction?: { label: string; href: string }
  /** Server-side configuration, named so an operator knows exactly what to set. */
  deploymentAction?: { summary: string; env: string[] }
}

/**
 * Five states, deliberately distinct.
 *
 * "Available" is reserved for things that genuinely work right now with no
 * setup. Anything requiring a credential is CONFIGURATION REQUIRED, and
 * anything simply absent from this deployment is UNAVAILABLE — labelling either
 * of those "available" would be the misleading state worth avoiding most.
 */
const STATUS_META: Record<
  Status,
  { label: string; tone: 'positive' | 'accent' | 'caution' | 'outline' }
> = {
  configured: { label: 'Connected', tone: 'positive' },
  available: { label: 'Available', tone: 'accent' },
  not_connected: { label: 'Not connected', tone: 'caution' },
  setup: { label: 'Configuration required', tone: 'caution' },
  unavailable: { label: 'Unavailable', tone: 'outline' },
}

export default async function CapabilitiesSettingsPage() {
  await requireOnboardedUser()
  const ai = aiStatus()
  const research = researchCapability()
  const entitlements = await getEntitlements()

  const capabilities: Capability[] = [
    {
      id: 'ai',
      label: 'AI reasoning',
      icon: Sparkles,
      status: ai.generative ? 'configured' : 'setup',
      detail: ai.generative
        ? `${ai.provider} · ${ai.model}. Briefs combine your records, retrieved evidence and relationship memory.`
        : 'No language model is configured, so briefs are composed deterministically from your records. Everything is still evidence-backed — it simply reasons less.',
      deploymentAction: ai.generative
        ? undefined
        : {
            summary: 'Add a model provider key and redeploy.',
            env: ['AI_PROVIDER', 'ANTHROPIC_API_KEY'],
          },
    },
    {
      id: 'read-url',
      label: 'Reading a link you provide',
      icon: Link2,
      status: 'available',
      detail:
        'Fetches the page, checks it is genuinely about the person, and cites the passage it used. Needs no credentials.',
      userAction: { label: 'Add context to someone', href: '/people' },
    },
    {
      id: 'discovery',
      label: 'Finding sources automatically',
      icon: Search,
      status: research.canDiscover ? 'configured' : 'setup',
      detail: research.canDiscover
        ? `Searches for a person's public professional footprint using ${research.searchProvider}.`
        : 'Discovery from a name alone needs a search API key. Until then, paste a link and it is analyzed the same way.',
      deploymentAction: research.canDiscover
        ? undefined
        : {
            // The key alone is enough — SEARCH_PROVIDER is inferred from
            // whichever one is present, so naming it here would suggest a
            // second step that does not exist.
            summary: 'Add a search provider key and redeploy.',
            env: ['EXA_API_KEY'],
          },
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: CalendarDays,
      status: features.googleCalendar || features.microsoftCalendar ? 'setup' : 'unavailable',
      detail:
        features.googleCalendar || features.microsoftCalendar
          ? 'Meetings can be imported so preparation follows your real day. Read-only, and you choose which calendar.'
          : 'No calendar provider is configured on this deployment, so meetings are added by hand.',
      deploymentAction:
        features.googleCalendar || features.microsoftCalendar
          ? undefined
          : {
              summary: 'Register an OAuth client with Google or Microsoft.',
              env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
            },
    },
    {
      id: 'documents',
      label: 'Document and transcript analysis',
      icon: FileText,
      status: 'available',
      detail:
        'Attach a PDF, a Word document or plain text, or paste a transcript — either way it is analyzed the same as a fetched page, with the same citations. A scanned PDF with no text layer is refused rather than saved empty.',
      userAction: { label: 'Add context to someone', href: '/people' },
    },
    {
      id: 'enrichment',
      label: 'Licensed enrichment',
      icon: BookOpenText,
      status: research.enrichmentProvider === 'none' ? 'unavailable' : 'configured',
      detail:
        research.enrichmentProvider === 'none'
          ? `Optional vendor data. None is configured, and ${brand.name} does not require any — every claim comes from a source you can open.`
          : `Vendor data from ${research.enrichmentProvider}, cited like any other source.`,
    },
    {
      id: 'email',
      label: 'Email',
      icon: Mail,
      status: features.emailDelivery ? 'configured' : 'not_connected',
      detail: features.emailDelivery
        ? `Sent from ${senderAddress()}. Meeting reminders and your weekly summary only.`
        : 'Transactional email is written to the server log rather than delivered. Nothing else is affected.',
      userAction: features.emailDelivery
        ? { label: 'Email preferences', href: '/settings/appearance' }
        : undefined,
      deploymentAction: features.emailDelivery
        ? undefined
        : { summary: 'Add a delivery provider key and redeploy.', env: ['RESEND_API_KEY'] },
    },
    {
      id: 'billing',
      label: 'Payments',
      icon: CreditCard,
      status: features.billing ? 'configured' : 'not_connected',
      detail: features.billing
        ? `Checkout and subscription management are live. You are on ${entitlements.plan === 'free' ? 'the free plan' : `the ${entitlements.plan} plan`}.`
        : 'Payments are not connected, so upgrading is unavailable. Every non-metered feature works normally.',
      userAction: features.billing ? { label: 'Compare plans', href: '/pricing' } : undefined,
      deploymentAction: features.billing
        ? undefined
        : {
            summary: 'Add Stripe keys and a webhook secret, then redeploy.',
            env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
          },
    },
  ]

  const ready = capabilities.filter((c) => c.status === 'configured' || c.status === 'available')
  const pending = capabilities.filter((c) => c.status !== 'configured' && c.status !== 'available')

  return (
    <div>
      <Eyebrow>Capabilities</Eyebrow>
      <p className="text-ink-secondary mt-2 max-w-lg text-sm leading-relaxed">
        What this deployment can actually do. {brand.name} tells you which parts are running, and
        what would turn on the rest, rather than degrading quietly.
      </p>

      {ready.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <CircleCheck className="text-positive size-3.5" aria-hidden="true" />
            <h2 className="label">Working now</h2>
          </div>
          <ul className="mt-3 grid gap-2.5">
            {ready.map((capability) => (
              <CapabilityCard key={capability.id} capability={capability} />
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="mt-9">
          <h2 className="label">Not set up</h2>
          <p className="text-ink-muted mt-2 max-w-lg text-xs leading-relaxed">
            None of these stop you working. Each one names exactly what is missing. Where a setting
            is shown as code, it is a server credential — it needs whoever runs this install rather
            than your account.
          </p>
          <ul className="mt-3 grid gap-2.5">
            {pending.map((capability) => (
              <CapabilityCard key={capability.id} capability={capability} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function CapabilityCard({ capability }: { capability: Capability }) {
  const meta = STATUS_META[capability.status]
  const Icon = capability.icon

  return (
    <li>
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="text-ink-faint size-4 shrink-0" aria-hidden="true" />
            <span className="text-ink text-sm font-medium">{capability.label}</span>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <p className="text-ink-muted mt-2 max-w-prose text-xs leading-relaxed">
          {capability.detail}
        </p>

        {capability.userAction ? (
          <div className="mt-3">
            <Button asChild variant="secondary" size="sm">
              <Link href={capability.userAction.href}>{capability.userAction.label}</Link>
            </Button>
          </div>
        ) : null}

        {capability.deploymentAction ? (
          <div className="border-line bg-bg-sunken mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5">
            <Terminal className="text-ink-faint mt-px size-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-ink-secondary text-xs leading-relaxed">
                {capability.deploymentAction.summary}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {capability.deploymentAction.env.map((key) => (
                  <code
                    key={key}
                    className="border-line bg-surface text-ink-muted rounded-[3px] border px-1.5 py-0.5 font-mono text-[0.6875rem]"
                  >
                    {key}
                  </code>
                ))}
              </p>
            </div>
          </div>
        ) : null}
      </Panel>
    </li>
  )
}
