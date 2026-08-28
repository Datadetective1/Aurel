import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { QuickBriefView } from '@/components/app/meeting-brief'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { formatTime, relativeDay } from '@/lib/format'
import type { MeetingBrief } from '@/lib/ai/prompts/meeting-brief'

export const metadata: Metadata = { title: 'Quick Brief', robots: { index: false, follow: false } }

/**
 * QUICK BRIEF — designed for the five minutes before walking in.
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

  await track('quick_brief_viewed')
  const brief = artifact.content as unknown as MeetingBrief

  return (
    <Container size="narrow" className="py-6 sm:py-10">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={`/meetings/${id}/brief`}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Full brief
        </Link>
      </Button>

      <header className="mt-3">
        <Eyebrow>
          {meeting.scheduled_at
            ? `${relativeDay(meeting.scheduled_at, timeZone, now)} · ${formatTime(meeting.scheduled_at, timeZone)}`
            : 'Quick Brief'}
        </Eyebrow>
        <h1 className="mt-2 font-display text-2xl leading-tight text-ink">{meeting.title}</h1>
      </header>

      <div className="mt-8">
        <QuickBriefView brief={brief} />
      </div>

      <Button asChild size="lg" className="mt-10 w-full">
        <Link href={`/meetings/${id}/debrief`}>Debrief after the meeting</Link>
      </Button>
    </Container>
  )
}
