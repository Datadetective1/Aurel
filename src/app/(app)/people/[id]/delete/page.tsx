import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { DeletePersonForm, RetainedLoop } from '@/components/app/person-lifecycle'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { previewPersonDeletion } from '@/lib/people/lifecycle.server'
import { describeDeletion } from '@/lib/people/lifecycle'

export const metadata: Metadata = {
  title: 'Delete permanently',
  robots: { index: false, follow: false },
}

/**
 * DELETE SOMEONE FOR GOOD
 * =============================================================================
 * The second step, after removing them. Everything on this page is counted
 * from the record the delete will act on, and sorted three ways: what goes,
 * what stays with their link removed, and the loops that stay -- the ones
 * whose words still name them first, editable here, before anything happens.
 * =============================================================================
 */
export default async function DeletePersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const preview = await previewPersonDeletion(supabase, user.id, id)
  if (!preview) notFound()

  const name = preview.person.name
  const back = (
    <Button asChild variant="quiet" size="sm" className="-ml-3">
      <Link href="/people?view=archived">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Archived people
      </Link>
    </Button>
  )

  if (!preview.person.archivedAt) {
    return (
      <Container size="narrow" className="py-8 sm:py-12">
        {back}
        <SectionHeader
          as="h1"
          eyebrow="Delete permanently"
          title={`Remove ${name} first`}
          description="Only someone you have removed from your people can be deleted. Removing is reversible; deleting is not."
          className="mt-4"
        />
        <Button asChild variant="secondary" className="mt-6">
          <Link href={`/people/${id}/edit`}>Go to {name}&rsquo;s settings</Link>
        </Button>
      </Container>
    )
  }

  const words = describeDeletion(preview)
  const identifying = preview.retainedLoops.filter((l) => l.mentionsPerson)
  const other = preview.retainedLoops.filter((l) => !l.mentionsPerson)

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      {back}
      <SectionHeader
        as="h1"
        eyebrow="Delete permanently"
        title={`Delete ${name}`}
        description="This cannot be undone. Here is exactly what happens to everything connected to them."
        className="mt-4"
      />

      <section className="mt-8" aria-labelledby="deleted-heading">
        <h2 id="deleted-heading" className="text-ink text-sm font-medium">
          Deleted
        </h2>
        <ul className="text-ink-secondary mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>{name}&rsquo;s record: name, role, contact details and the notes on their page</li>
          {words.deleted.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="unlinked-heading">
        <h2 id="unlinked-heading" className="text-ink text-sm font-medium">
          Kept, no longer linked to {name}
        </h2>
        {words.unlinked.length > 0 ? (
          <>
            <ul className="text-ink-secondary mt-2 list-disc space-y-1 pl-5 text-sm">
              {words.unlinked.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-ink-muted mt-3 text-xs leading-relaxed">
              Meetings, conversations and decisions stay in your record with their notes and
              transcripts, which may still mention {name} by name. Only {name}&rsquo;s place in them
              is removed. You can open and edit or delete any of them on their own pages.
            </p>
          </>
        ) : (
          <p className="text-ink-secondary mt-2 text-sm">Nothing else refers to {name}.</p>
        )}
      </section>

      {preview.retainedLoops.length > 0 ? (
        <section className="mt-8" aria-labelledby="loops-heading">
          <h2 id="loops-heading" className="text-ink text-sm font-medium">
            Loops that stay
          </h2>
          <p className="text-ink-muted mt-1 text-xs leading-relaxed">
            Your loops are kept, without a link to {name}.
            {identifying.length > 0
              ? ` ${identifying.length === 1 ? 'One names' : `${identifying.length} name`} ${name}, so ${identifying.length === 1 ? 'it' : 'they'} will still identify them. Reword or delete ${identifying.length === 1 ? 'it' : 'them'} first if ${identifying.length === 1 ? 'it' : 'they'} should not.`
              : ''}
          </p>
          <ul className="mt-3 space-y-2">
            {[...identifying, ...other].map((loop) => (
              <RetainedLoop key={loop.id} loop={loop} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-line mt-10 border-t pt-6" aria-label="Confirm">
        <DeletePersonForm personId={preview.person.id} name={name} />
      </section>
    </Container>
  )
}
