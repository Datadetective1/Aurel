import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import {
  ConversationCapture,
  type CaptureMeeting,
  type CapturePerson,
} from '@/components/app/conversation-capture'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveFaces } from '@/lib/conversations/avatars'
import { relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Add a conversation',
  robots: { index: false, follow: false },
}

/**
 * ADD A CONVERSATION
 * =============================================================================
 * Reached from the nav, from a person ("record a conversation with Ravi"),
 * or from a meeting ("debrief"). The query string pre-selects who and which,
 * so the common case is: arrive, speak, press one button.
 * =============================================================================
 */
export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; meeting?: string; mode?: string }>
}) {
  const { person, meeting, mode } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const [{ data: people }, { data: meetings }] = await Promise.all([
    supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, job_title, avatar_url, avatar_path, organizations(name)',
      )
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .order('relevance', { ascending: false })
      .limit(120),
    // Recent and upcoming meetings both: a debrief is usually for a meeting
    // that just ended, which is still "upcoming" until it is debriefed.
    supabase
      .from('meetings')
      .select('id, title, scheduled_at, status, meeting_attendees(person_id)')
      .eq('user_id', user.id)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .limit(20),
  ])

  const faces = await resolveFaces(supabase, people ?? [], (p) => p.id)

  const capturePeople: CapturePerson[] = (people ?? []).map((p) => ({
    id: p.id,
    name: p.preferred_name || p.full_name,
    fullName: p.full_name,
    preferredName: p.preferred_name,
    src: faces.get(p.id) ?? null,
    subtitle: [p.job_title, p.organizations?.name].filter(Boolean).join(' · ') || null,
  }))

  const captureMeetings: CaptureMeeting[] = (meetings ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    when: m.scheduled_at ? relativeDay(m.scheduled_at, timeZone, now) : null,
    attendeeIds: (m.meeting_attendees ?? []).map((a) => a.person_id),
  }))

  const linkedMeeting = meeting ? captureMeetings.find((m) => m.id === meeting) : undefined
  const initialPersonIds = linkedMeeting
    ? linkedMeeting.attendeeIds
    : person && capturePeople.some((p) => p.id === person)
      ? [person]
      : []

  const initialMode =
    mode === 'paste' || mode === 'upload' || mode === 'record' || mode === 'notes' ? mode : 'voice'

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link
          href={
            linkedMeeting
              ? `/meetings/${linkedMeeting.id}/brief`
              : person
                ? `/people/${person}`
                : '/conversations'
          }
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {linkedMeeting ? 'Back to brief' : person ? 'Back' : 'Conversations'}
        </Link>
      </Button>

      <SectionHeader
        as="h1"
        eyebrow={linkedMeeting ? 'After the meeting' : 'Remember'}
        title={linkedMeeting ? linkedMeeting.title : 'Keep a conversation'}
        description={`Speak it, record it, paste it or type it. ${brand.name} reads it for what you promised, what they promised, what was decided and what was left open — then asks you before any of it becomes memory.`}
        className="mt-4"
      />

      <ConversationCapture
        className="mt-8"
        people={capturePeople}
        meetings={captureMeetings}
        initialPersonIds={initialPersonIds}
        initialMeetingId={linkedMeeting?.id ?? null}
        initialMode={initialMode}
        userNames={[profile.full_name, profile.preferred_name]}
      />
    </Container>
  )
}
