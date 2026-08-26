import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { PersonForm } from '@/components/app/person-form'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { researchCapability } from '@/lib/research/providers'

export const metadata: Metadata = { title: 'Edit person', robots: { index: false, follow: false } }

/**
 * EDIT A PERSON
 * =============================================================================
 * The gear icon in the person header has linked here since it was written, and
 * the route did not exist. `PersonForm` already takes `mode="edit"` and
 * `updatePerson` is fully implemented with its own validation and revalidation
 * — the page in between was the only missing piece, so nothing about a person
 * could be corrected after it was first typed.
 *
 * The same defect as `/people/[id]/log`: a link, a finished server action, and
 * no page joining them. Worth remembering that the 404 was invisible in normal
 * use — Next prefetches the link, so it failed in the console rather than under
 * anyone's cursor.
 * =============================================================================
 */
export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, email, profile_url, relationship_type, relevance, notes, organizations(name)',
    )
    .eq('user_id', user.id)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) notFound()

  const name = person.preferred_name || person.full_name
  const capability = researchCapability()

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={`/people/${id}`}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {name}
        </Link>
      </Button>

      <SectionHeader
        as="h1"
        eyebrow="Edit"
        title={`Update ${name}`}
        description="Correcting the record here changes what every future brief is built on."
        className="mt-4"
      />

      <div className="mt-8">
        <PersonForm
          mode="edit"
          defaults={{
            id: person.id,
            fullName: person.full_name,
            // Every field falls back to an empty string: the form's inputs are
            // controlled, and a null from the database would make React switch
            // them to uncontrolled halfway through rendering.
            preferredName: person.preferred_name ?? '',
            jobTitle: person.job_title ?? '',
            organizationName: person.organizations?.name ?? '',
            email: person.email ?? '',
            profileUrl: person.profile_url ?? '',
            relationshipType: person.relationship_type ?? 'peer',
            relevance: person.relevance ?? 3,
            notes: person.notes ?? '',
          }}
          canResearch={capability.canAnalyseUrls}
          discoveryHint={capability.discoveryHint}
        />
      </div>
    </Container>
  )
}
