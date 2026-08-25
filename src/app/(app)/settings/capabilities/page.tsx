import Link from 'next/link'
import type { Metadata } from 'next'
import {
  BookOpenText,
  CalendarDays,
  CircleCheck,
  CreditCard,
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
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Capabilities', robots: { index: false, follow: false } }

/**
 * CAPABILITIES
 * =============================================================================
 * An inventory of what this deployment can actually do, and — where something
 * is off — what would turn it on and who can do that.
 *
 * Four states, deliberately distinct:
 *   RUNNING      configured and in use right now
 *   AVAILABLE    works today, nothing to set up
 *   NEEDS SETUP  possible here, with a concrete next step
 *   UNAVAILABLE  not offered on this deployment or plan
 *
 * "Needs setup" is split further by WHO can act. Most integrations here are
 * server credentials: showing an account holder a button they cannot use is
 * worse than telling them plainly that it is a deployment setting. Actions the
 * user really can take are rendered as buttons; the rest name the environment
 * variable an operator sets, which is the actual next step.
 * =============================================================================
 */

type Status = 'running' | 'available' | 'setup' | 'unavailable'

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

const STATUS_META: Record<Status, { label: string; tone: 'positive' | 'accent' | 'caution' | 'outline' }> = {
  running: { label: 'Running', tone: 'positive' },
  available: { label: 'Available', tone: 'accent' },
  setup: { label: 'Needs setup', tone: 'caution' },
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
      status: ai.generative ? 'running' : 'setup',
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
      status: research.canDiscover ? 'running' : 'setup',
      detail: research.canDiscover
        ? `Searches for a person's public professional footprint using ${research.searchProvider}.`
        : 'Discovery from a name alone needs a search API key. Until then, paste a link and it is analysed the same way.',
      deploymentAction: research.canDiscover
        ? undefined
        : {
            summary: 'Add a search provider key and redeploy.',
            env: ['SEARCH_PROVIDER', 'BRAVE_SEARCH_API_KEY'],
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
      id: 'enrichment',
      label: 'Licensed enrichment',
      icon: BookOpenText,
      status: research.enrichmentProvider === 'none' ? 'unavailable' : 'running',
      detail:
        research.enrichmentProvider === 'none'
          ? `Optional vendor data. None is configured, and ${brand.name} does not require any — every claim comes from a source you can open.`
          : `Vendor data from ${research.enrichmentProvider}, cited like any other source.`,
    },
    {
      id: 'email',
      label: 'Email',
      icon: Mail,
      status: features.emailDelivery ? 'running' : 'setup',
      detail: features.emailDelivery
        ? `Sent from ${brand.email.fromAddress}. Meeting reminders and your weekly summary only.`
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
      status: features.billing ? 'running' : 'setup',
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

  const ready = capabilities.filter((c) => c.status === 'running' || c.status === 'available')
  const pending = capabilities.filter((c) => c.status === 'setup' || c.status === 'unavailable')

  return (
    <div>
      <Eyebrow>Capabilities</Eyebrow>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
        What this deployment can actually do. {brand.name} tells you which parts are running, and
        what would turn on the rest, rather than degrading quietly.
      </p>

      {ready.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <CircleCheck className="size-3.5 text-positive" aria-hidden="true" />
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
          <p className="mt-2 max-w-lg text-xs leading-relaxed text-ink-muted">
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
            <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">{capability.label}</span>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">
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
          <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-3 py-2.5">
            <Terminal className="mt-px size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs leading-relaxed text-ink-secondary">
                {capability.deploymentAction.summary}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {capability.deploymentAction.env.map((key) => (
                  <code
                    key={key}
                    className="rounded-[3px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-muted"
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
