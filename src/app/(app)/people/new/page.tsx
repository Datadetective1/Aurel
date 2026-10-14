import type { Metadata } from 'next'
import { PersonForm } from '@/components/app/person-form'
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

      {!limit.allowed ? (
        <p className="border-caution/25 bg-caution-wash text-ink-secondary mt-6 rounded-[var(--radius-md)] border px-4 py-3 text-sm">
          {limit.message}
        </p>
      ) : limit.limit !== null && limit.remaining !== null && limit.remaining <= 2 ? (
        <p className="text-ink-muted mt-6 text-xs">
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
