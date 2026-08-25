import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { MeetingBriefView, type BriefCitation } from '@/components/app/meeting-brief'
import { GenerateBriefPanel } from '@/components/app/generate-brief'
import { ArtifactFeedback } from '@/components/app/artifact-feedback'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime, relativeDay } from '@/lib/format'
import type { MeetingBrief } from '@/lib/ai/prompts/meeting-brief'

export const metadata: Metadata = {
  title: 'Meeting brief',
  robots: { index: false, follow: false },
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, kind, scheduled_at, objective, stakes, importance, status')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (!meeting) notFound()

  // Most recent brief for this meeting.
  const { data: artifact } = await supabase
    .from('ai_artifacts')
    .select('id, content, grounded_fallback, created_at, provider')
    .eq('user_id', user.id)
    .eq('kind', 'meeting_brief')
    .eq('subject_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('person_id, role, people(full_name, preferred_name)')
    .eq('user_id', user.id)
    .eq('meeting_id', id)

  const citations: BriefCitation[] = artifact
    ? (
        await supabase
          .from('artifact_sources')
          .select('label, evidence_level, person_id')
          .eq('user_id', user.id)
          .eq('artifact_id', artifact.id)
          .limit(40)
      ).data?.map((c) => ({
        label: c.label,
        evidenceLevel: c.evidence_level,
        personId: c.person_id,
      })) ?? []
    : []

  const brief = artifact ? (artifact.content as unknown as MeetingBrief) : null

  return (
    <Container size="default" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href="/meetings">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Meetings
        </Link>
      </Button>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>
            {meeting.scheduled_at
              ? `${relativeDay(meeting.scheduled_at)} · ${formatTime(meeting.scheduled_at)}`
              : 'Unscheduled'}
          </Eyebrow>
          {meeting.importance >= 4 ? (
            <Badge tone="accent">Importance {meeting.importance}/5</Badge>
          ) : null}
        </div>

        <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{meeting.title}</h1>

        {(attendees ?? []).length > 0 ? (
          <p className="mt-2 text-sm text-ink-secondary">
            With{' '}
            {(attendees ?? [])
              .map((a) => a.people?.preferred_name || a.people?.full_name)
              .filter(Boolean)
              .join(', ')}
          </p>
        ) : null}
      </header>

      {brief ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/meetings/${id}/quick`}>
                <Smartphone className="size-3.5" aria-hidden="true" />
                Quick Brief
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/meetings/${id}/debrief`}>Debrief this meeting</Link>
            </Button>
            <span className="text-xs text-ink-faint">
              Prepared {formatDate(artifact!.created_at)}
            </span>
          </div>

          <div className="mt-10">
            <MeetingBriefView
              brief={brief}
              citations={citations}
              grounded={artifact!.grounded_fallback}
              meetingId={id}
            />
          </div>

          <div className="mt-12 border-t border-line pt-6">
            <ArtifactFeedback artifactId={artifact!.id} />
          </div>
        </>
      ) : (
        <GenerateBriefPanel
          meetingId={id}
          hasObjective={Boolean(meeting.objective)}
          attendeeCount={(attendees ?? []).length}
        />
      )}
    </Container>
  )
}
