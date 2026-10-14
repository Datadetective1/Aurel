import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, Mic } from 'lucide-react'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { MeetingCockpit } from '@/components/visual/meeting-cockpit'
import { QuickBrief } from '@/components/visual/quick-brief'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { formatTime } from '@/lib/format'
import { listeningCues, startProximity } from '@/lib/brief'
import { loadMeetingVisual } from '@/lib/visual/meeting.server'
export const metadata: Metadata = {
  title: 'Sixty seconds',
  robots: { index: false, follow: false },
}

/**
 * SIXTY SECONDS — the middle depth.
 *
 * What the glance has, plus the three things that change how the conversation
 * actually goes: the room and how to approach it, what is likely to be pushed
 * back on and why Atturel thinks so, and what is still open between you.
 *
 * A narrow single column with large touch targets, not a shrunken desktop page.
 */
export default async function QuickBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const visual = await loadMeetingVisual(supabase, user.id, id, { timeZone, now })
  if (!visual) notFound()

  // Nothing to show quickly if the brief has not been built yet.
  if (!visual.artifact || !visual.brief) redirect(`/meetings/${id}/brief`)

  const { meeting, brief, people } = visual
  const cues = listeningCues(brief, {
    openCommitments: visual.loops
      .filter((l) => l.status === 'open')
      .slice(0, 4)
      .map((l) => ({ description: l.description, owner: l.owner })),
  })
  const owe = visual.visualLoops.filter((l) => l.direction === 'owe').length

  await track('quick_brief_viewed', {
    proximity: startProximity(meeting.scheduledAt, now),
    participants: brief.participants.length,
    listening_cues: cues.length,
    room_view: people.length > 1,
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

      <BriefDepthNav meetingId={id} current="quick" className="mt-6" />

      <div className="mt-8">
        <QuickBrief
          brief={brief}
          people={people}
          connections={visual.connections}
          loops={visual.visualLoops}
          lastConversation={visual.lastConversation}
          cues={cues}
          centerLabel={meeting.scheduledAt ? formatTime(meeting.scheduledAt, timeZone) : 'Meeting'}
          timeZone={timeZone}
          now={now}
        />
      </div>

      <div className="mt-10 grid gap-2.5 sm:grid-cols-2">
        <Button asChild size="lg" className="w-full">
          <Link href={`/conversations/new?meeting=${id}`}>
            <Mic className="size-4" aria-hidden="true" />
            Capture the conversation
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href={`/meetings/${id}/brief`}>
            Everything
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Container>
  )
}
