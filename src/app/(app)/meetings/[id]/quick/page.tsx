import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { QuickBriefView } from '@/components/app/meeting-brief'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { LiveCountdown } from '@/components/app/meeting-countdown'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { formatTime } from '@/lib/format'
import { listeningCues, normalizeBrief, startProximity } from '@/lib/brief'

export const metadata: Metadata = { title: 'Sixty seconds', robots: { index: false, follow: false } }

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

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (!meeting) notFound()

  const { data: artifact } = await supabase
    .from('ai_artifacts')
    .select('content')
    .eq('user_id', user.id)
    .eq('kind', 'meeting_brief')
    .eq('subject_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Nothing to show quickly if the brief has not been built yet.
  if (!artifact) redirect(`/meetings/${id}/brief`)

  const brief = normalizeBrief(artifact.content)

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('person_id')
    .eq('user_id', user.id)
    .eq('meeting_id', id)

  const attendeeIds = (attendees ?? []).map((a) => a.person_id)
  const { data: commitments } = attendeeIds.length
    ? await supabase
        .from('commitments')
        .select('description, owner, due_on')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .in('person_id', attendeeIds)
        .order('due_on', { ascending: true, nullsFirst: false })
        .limit(4)
    : { data: [] as { description: string; owner: string; due_on: string | null }[] }

  const cues = listeningCues(brief, { openCommitments: commitments ?? [] })

  await track('quick_brief_viewed', {
    proximity: startProximity(meeting.scheduled_at, now),
    participants: brief.participants.length,
    listening_cues: cues.length,
  })

  return (
    <Container size="narrow" className="py-6 sm:py-10">
      <header>
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] tracking-[0.14em] uppercase">
          {meeting.scheduled_at ? (
            <>
              <LiveCountdown
                startsAt={meeting.scheduled_at}
                nowIso={now.toISOString()}
                className="text-accent"
              />
              <span aria-hidden="true">·</span>
              <span>{formatTime(meeting.scheduled_at, timeZone)}</span>
            </>
          ) : (
            <span>Unscheduled</span>
          )}
        </p>
        <h1 className="font-display text-ink mt-2 text-2xl leading-tight sm:text-3xl">
          {meeting.title}
        </h1>
      </header>

      <BriefDepthNav meetingId={id} current="quick" className="mt-5" />

      <div className="mt-7">
        <QuickBriefView brief={brief} cues={cues} />
      </div>

      <Button asChild variant="secondary" size="lg" className="mt-8 w-full">
        <Link href={`/meetings/${id}/brief`}>
          Everything
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>

      <Button asChild size="lg" className="mt-3 w-full">
        <Link href={`/meetings/${id}/debrief`}>Debrief after the meeting</Link>
      </Button>
    </Container>
  )
}
