import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PersonForm } from '@/components/app/person-form'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { researchCapability } from '@/lib/research/providers'
import { checkPersonLimit } from '@/lib/billing/entitlements'
import { Badge } from '@/components/ui/primitives'

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
        description="Start with who they are. Add depth over time."
      />

      {!limit.allowed ? (
        <div className="border-caution/25 bg-caution-wash text-ink-secondary mt-6 rounded-[var(--radius-md)] border px-4 py-3 text-sm">
          <p>{limit.message}</p>
          <p className="mt-2 text-xs">Everyone you already track is kept as it is.</p>
          <Button asChild size="sm" className="mt-3 h-11">
            <Link href="/settings/billing">See plans</Link>
          </Button>
        </div>
      ) : limit.limit !== null && limit.remaining !== null && limit.remaining <= 2 ? (
        <p className="text-ink-muted mt-6 text-xs">
          <Badge tone="outline">{limit.remaining} left on your plan</Badge>
        </p>
      ) : null}

      {/* Not offered when the plan's person limit is reached: a form that
          cannot save is a form that throws away what was typed. */}
      <div className={limit.allowed ? 'mt-8' : 'hidden'}>
        <PersonForm
          canResearch={capability.canAnalyseUrls}
          discoveryHint={capability.discoveryHint}
        />
      </div>
    </Container>
  )
}
