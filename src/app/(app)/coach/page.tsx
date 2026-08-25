import type { Metadata } from 'next'
import { AdaptPanel, AskPanel, CoachTabs, type CoachPerson } from '@/components/app/coach'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { COACH_EXAMPLES, COACH_INTRO } from '@/lib/ai/coach'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: brand.assistantName,
  robots: { index: false, follow: false },
}

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; mode?: string; q?: string }>
}) {
  const { person, mode, q } = await searchParams
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('people')
    .select('id, full_name, preferred_name')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('relevance', { ascending: false })
    .limit(200)

  const people: CoachPerson[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.preferred_name || p.full_name,
  }))

  // A person link from a profile page pre-fills the question.
  const preselected = person ? people.find((p) => p.id === person) : undefined
  const initialQuestion =
    q ?? (preselected && mode !== 'adapt' ? `What have I learned about ${preselected.name}?` : undefined)

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Coach"
        title={brand.assistantName}
        description="Answers come from your own relationship record, with the evidence attached."
      />

      <div className="mt-8">
        <CoachTabs
          initialTab={mode === 'adapt' ? 'adapt' : 'ask'}
          ask={
            <AskPanel
              examples={COACH_EXAMPLES}
              intro={COACH_INTRO}
              initialQuestion={initialQuestion}
            />
          }
          adapt={<AdaptPanel people={people} initialPersonId={person} />}
        />
      </div>
    </Container>
  )
}
