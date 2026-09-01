import type { Metadata } from 'next'
import Link from 'next/link'
import { PersonForm } from '@/components/app/person-form'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { researchCapability } from '@/lib/research/providers'
import { checkPersonLimit } from '@/lib/billing/entitlements'
import { Badge } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Add a person', robots: { index: false, follow: false } }

export default async function NewPersonPage() {
  await requireOnboardedUser()
  const capability = researchCapability()
  const limit = await checkPersonLimit()

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="New relationship"
        title="Add a person"
        description={`Start with who they are. ${brand.name} will help you build the rest.`}
      />

      {/* The moment a free account is actually stopped by its plan is the one
          moment upgrading is obviously worth it, and this screen used to state
          the limit and then leave the reader to find Settings on their own. */}
      {!limit.allowed ? (
        <div className="mt-6 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-secondary">{limit.message}</p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/settings/billing">See plans</Link>
          </Button>
        </div>
      ) : limit.limit !== null && limit.remaining !== null && limit.remaining <= 2 ? (
        <p className="mt-6 text-xs text-ink-muted">
          <Badge tone="outline">{limit.remaining} left on your plan</Badge>
        </p>
      ) : null}

      <div className="mt-8">
        <PersonForm
          canResearch={capability.canAnalyseUrls}
          discoveryHint={capability.discoveryHint}
        />
      </div>
    </Container>
  )
}
