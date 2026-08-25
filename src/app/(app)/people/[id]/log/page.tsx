import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { InteractionForm } from '@/components/app/interaction-form'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Log an interaction',
  robots: { index: false, follow: false },
}

/**
 * LOG AN INTERACTION
 * =============================================================================
 * The person page has linked here since it was written. The page did not exist,
 * so the primary call to action on the busiest screen in the product returned a
 * 404, and `addInteraction` — fully implemented — had no caller anywhere in the
 * codebase.
 *
 * That made a new person a dead end: the empty state says the record starts
 * compounding once you log an interaction, and the button to log one went
 * nowhere.
 * =============================================================================
 */
export default async function LogInteractionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, preferred_name')
    .eq('user_id', user.id)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) notFound()

  const name = person.preferred_name || person.full_name

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
        eyebrow="Log an interaction"
        title={`What happened with ${name}?`}
        description="A conversation that has already taken place. Recording it is what makes the next brief sharper than the last."
        className="mt-4"
      />

      <InteractionForm personId={id} personName={name} className="mt-8" />
    </Container>
  )
}
