import type { Metadata } from 'next'
import { MeetingForm, type PersonOption } from '@/components/app/meeting-form'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Prepare', robots: { index: false, follow: false } }

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>
}) {
  const { person } = await searchParams
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, job_title, organizations(name)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('relevance', { ascending: false })
    .order('full_name', { ascending: true })
    .limit(200)

  const people: PersonOption[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.preferred_name || p.full_name,
    subtitle: [p.job_title, p.organizations?.name].filter(Boolean).join(' · ') || null,
  }))

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Prepare"
        title="What are you preparing for?"
        description="The objective and who is in the room are what turn a record into useful guidance."
      />
      <div className="mt-8">
        <MeetingForm people={people} preselectedPersonId={person} />
      </div>
    </Container>
  )
}
