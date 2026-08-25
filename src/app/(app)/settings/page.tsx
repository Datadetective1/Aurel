import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleAlert, Database, Lock, Palette, Sparkles, UserRound } from 'lucide-react'
import { SettingsForms } from '@/components/app/settings-forms'
import { DataControls } from '@/components/app/data-controls'
import { SignOutButton } from '@/components/app/sign-out-button'
import { Badge, Container, Eyebrow, Panel, Rule, SectionHeader } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getEntitlements } from '@/lib/billing/entitlements'
import { PLANS, formatPrice } from '@/lib/billing/plans'
import { aiStatus } from '@/lib/ai/provider'
import { researchCapability } from '@/lib/research/providers'
import { features } from '@/lib/env'
import { formatDate } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } }

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const supabase = await createClient()

  const [entitlements, { data: assessment }, counts] = await Promise.all([
    getEntitlements(),
    supabase
      .from('assessments')
      .select('id, archetype, completed_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    Promise.all([
      supabase.from('people').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('observations').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('sources').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]),
  ])

  // Destructuring a mapped array widens each element to `number | undefined`;
  // read by index so the counts stay typed.
  const [peopleCount, observationCount, sourceCount, interactionCount] = [
    counts[0].count ?? 0,
    counts[1].count ?? 0,
    counts[2].count ?? 0,
    counts[3].count ?? 0,
  ]
  const ai = aiStatus()
  const research = researchCapability()
  const plan = PLANS[entitlements.plan]

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <SectionHeader as="h1" eyebrow="Account" title="Settings" />

      {/* --- profile ---------------------------------------------------------- */}
      <section className="mt-10">
        <Eyebrow className="flex items-center gap-1.5">
          <UserRound className="size-3 text-accent" aria-hidden="true" />
          Profile
        </Eyebrow>
        <div className="mt-5">
          <SettingsForms
            profile={{
              fullName: profile.full_name ?? '',
              preferredName: profile.preferred_name ?? '',
              jobTitle: profile.job_title ?? '',
              company: profile.company ?? '',
              pronouns: profile.pronouns ?? '',
              timezone: profile.timezone ?? 'UTC',
            }}
            preferences={{
              theme: profile.theme,
              coachingStyle: profile.coaching_style,
              emailNotifications: profile.email_notifications,
            }}
            email={user.email ?? ''}
          />
        </div>
      </section>

      <Rule />

      {/* --- interaction profile ------------------------------------------------ */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-accent" aria-hidden="true" />
          {brand.assessmentName}
        </Eyebrow>
        {assessment ? (
          <div className="mt-4">
            <p className="text-sm text-ink">
              <span className="font-display text-lg">{assessment.archetype}</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Completed {formatDate(assessment.completed_at)}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/onboarding/reveal">View my profile</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/onboarding/assessment">Retake the assessment</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-ink-secondary">
              You have not completed your {brand.assessmentName.toLowerCase()} yet.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/onboarding/assessment">Take it now</Link>
            </Button>
          </div>
        )}
      </section>

      <Rule />

      {/* --- plan ---------------------------------------------------------------- */}
      <section>
        <Eyebrow>Plan</Eyebrow>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge tone={entitlements.plan === 'free' ? 'neutral' : 'accent'}>{plan.name}</Badge>
          {entitlements.isFounding ? <Badge tone="accent">Founding</Badge> : null}
          {/* The badge already says "Free"; repeating the price there reads as
              a duplicate, so the price only appears when there is one. */}
          {plan.monthlyPriceCents ? (
            <span className="text-sm text-ink-secondary">
              {formatPrice(plan.monthlyPriceCents)} per month
            </span>
          ) : null}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">{plan.tagline}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </div>

        {!features.billing ? (
          <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            Payments are not connected on this deployment, so upgrading is unavailable. Everything
            else works normally.
          </p>
        ) : null}
      </section>

      <Rule />

      {/* --- capability transparency --------------------------------------------- */}
      <section>
        <Eyebrow>How {brand.name} is running</Eyebrow>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Stated plainly, because the product&rsquo;s claims depend on you knowing which is which.
        </p>

        <dl className="mt-4 grid gap-3">
          <CapabilityRow
            label="Guidance"
            value={ai.label}
            detail={ai.generative ? `${ai.provider} · ${ai.model}` : 'No language model configured'}
          />
          <CapabilityRow
            label="Reading a link you provide"
            value="Available"
            detail="Fetches the page, checks it is really about the person, and cites what it used."
          />
          <CapabilityRow
            label="Finding sources automatically"
            value={research.canDiscover ? 'Available' : 'Not configured'}
            detail={
              research.canDiscover
                ? `Search provider: ${research.searchProvider}`
                : 'Paste a link instead and it will be analysed.'
            }
          />
          <CapabilityRow
            label="Email"
            value={features.emailDelivery ? 'Connected' : 'Not connected'}
            detail={
              features.emailDelivery
                ? 'Transactional email is delivered.'
                : 'Emails are logged rather than sent on this deployment.'
            }
          />
        </dl>
      </section>

      <Rule />

      {/* --- privacy and data ----------------------------------------------------- */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Lock className="size-3 text-accent" aria-hidden="true" />
          Privacy and data
        </Eyebrow>

        <Panel className="mt-4 p-5">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-ink-faint" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">What you have stored</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="People" value={peopleCount} />
            <Stat label="Observations" value={observationCount} />
            <Stat label="Interactions" value={interactionCount} />
            <Stat label="Sources" value={sourceCount} />
          </dl>
        </Panel>

        <p className="mt-5 max-w-xl text-xs leading-relaxed text-ink-muted">
          Everything above is scoped to your account at the database level. It is not shared with
          anyone, it is not used to train a shared model, and you can export or destroy it below at
          any time.
        </p>

        <div className="mt-6">
          <DataControls hasDemoData={Boolean(profile.demo_seeded_at)} />
        </div>
      </section>

      <Rule />

      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Palette className="size-3 text-accent" aria-hidden="true" />
          Session
        </Eyebrow>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>

      <p className="mt-12 text-xs text-ink-faint">
        <Link href="/privacy" className="hover:text-ink-muted">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="hover:text-ink-muted">
          Terms
        </Link>{' '}
        ·{' '}
        <a href={`mailto:${brand.email.support}`} className="hover:text-ink-muted">
          {brand.email.support}
        </a>
      </p>
    </Container>
  )
}

function CapabilityRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="grid gap-1 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd>
        <span className="text-sm text-ink">{value}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{detail}</span>
      </dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-ink tabular-nums">{value}</dd>
    </div>
  )
}
