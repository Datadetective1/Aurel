import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { AddParticipants, type PersonChoice } from '@/components/app/add-participants'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { MeetingCockpit } from '@/components/visual/meeting-cockpit'
import { GlanceBrief } from '@/components/visual/glance-brief'
import { Container } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { startProximity } from '@/lib/brief'
import { loadMeetingVisual } from '@/lib/visual/meeting.server'
import { brand } from '@/lib/brand'
export const metadata: Metadata = {
  title: 'What you need',
  robots: { index: false, follow: false },
}

/**
 * TEN SECONDS.
 *
 * The shortest useful view of a brief, and the destination of the countdown on
 * Today. A person walking into a room needs four things: who is in it, what
 * they want out of it, the first sentence, and anything overdue between them.
 *
 * Nothing here is generated. Every field is read from the stored artifact or
 * the record, so this renders instantly and renders briefs written before it
 * existed. The cockpit says who and when; the glance says what to hold in
 * mind; everything else is one tap down.
 */
export default async function GlancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const visual = await loadMeetingVisual(supabase, user.id, id, { timeZone, now })
  if (!visual) notFound()

  // There is nothing to glance at before the brief exists. Preparing is the
  // honest next step, and the brief page is where that happens.
  if (!visual.artifact) redirect(`/meetings/${id}/brief`)

  const { meeting, people, glance } = visual

  // --- who the invite carried that resolves to nobody ------------------------
  // Read from the synced calendar row, where every attendee is stored with the
  // person it matched to, or null. This is the ONLY thing that distinguishes
  // "the invite had people in it and none of them are in your record" from
  // "nobody was ever invited" -- and the empty state says different things for
  // the two, because claiming matching failed when nothing was invited would
  // describe an event that did not happen.
  let unmatchedAttendees = 0
  let addablePeople: PersonChoice[] = []
  if (people.length === 0) {
    const [{ data: calendarEvent }, { data: allPeople }] = await Promise.all([
      supabase
        .from('external_calendar_events')
        .select('attendees')
        .eq('user_id', user.id)
        .eq('meeting_id', id)
        .maybeSingle(),
      supabase
        .from('people')
        .select('id, full_name, preferred_name, job_title, organizations(name)')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('full_name', { ascending: true })
        .limit(200),
    ])

    const invited = (calendarEvent?.attendees ?? []) as unknown as { personId?: string | null }[]
    unmatchedAttendees = Array.isArray(invited) ? invited.filter((a) => !a?.personId).length : 0
    addablePeople = (allPeople ?? []).map((p) => ({
      id: p.id,
      name: p.preferred_name || p.full_name,
      subtitle: [p.job_title, p.organizations?.name].filter(Boolean).join(' · ') || null,
    }))
  }

  const owe = visual.visualLoops.filter((l) => l.direction === 'owe').length

  // Bucket only. See lib/brief: a duration next to an event timestamp is a
  // reconstruction of when a named person was in a specific meeting.
  await track('brief_glance_viewed', {
    proximity: startProximity(meeting.scheduledAt, now),
    participants: people.length,
    has_alert: Boolean(glance.openLoop),
    remember_lines: glance.remember.length,
  })

  return (
    <Container size="narrow" className="py-6 sm:py-10">
      <MeetingCockpit
        title={meeting.title}
        scheduledAt={meeting.scheduledAt}
        people={people}
        prep={visual.prep}
        openLoops={visual.visualLoops.length}
        owe={owe}
        timeZone={timeZone}
        now={now}
      />

      <BriefDepthNav meetingId={id} current="glance" className="mt-6" />

      {people.length === 0 ? (
        /* Silence used to be the answer here, on the one screen whose job is
           to say who you are about to meet. It distinguishes the two
           conditions the data model can actually tell apart, and never
           asserts that an invitee IS someone in the record: turning an email
           address into a person is a decision only the user can make. */
        <section className="border-line bg-bg-sunken mt-6 rounded-[var(--radius-lg)] border p-4">
          <h2 className="label">In the room</h2>
          <p className="text-ink mt-2 text-sm leading-relaxed">
            {unmatchedAttendees > 0
              ? 'No participants have been matched to this meeting yet.'
              : 'No one has been added to this meeting yet.'}
          </p>
          {unmatchedAttendees > 0 ? (
            <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
              Its invite carries{' '}
              {unmatchedAttendees === 1 ? 'one attendee' : `${unmatchedAttendees} attendees`}{' '}
              {brand.name} does not recognise.
            </p>
          ) : null}
          <div className="mt-4">
            <AddParticipants meetingId={id} people={addablePeople} />
          </div>
        </section>
      ) : null}

      <GlanceBrief glance={glance} meetingId={id} timeZone={timeZone} now={now} className="mt-7" />
    </Container>
  )
}
