import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { MeetingBriefView, type BriefCitation } from '@/components/app/meeting-brief'
import { GenerateBriefPanel } from '@/components/app/generate-brief'
import type { PersonChoice } from '@/components/app/add-participants'
import { ArtifactFeedback } from '@/components/app/artifact-feedback'
import { RegenerateBrief } from '@/components/app/regenerate-brief'
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
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
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
    ? ((
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
      })) ?? [])
    : []

  // --- has the evidence moved since this brief was made? --------------------
  // Checked against the things a brief actually rests on. A brief that goes on
  // citing a source the user has since deleted is the failure worth catching.
  const attendeeIds = (attendees ?? []).map((a) => a.person_id)

  // People the user could still add. Excluding the ones already in the room
  // keeps the picker honest -- offering somebody already listed reads as though
  // the add did not work.
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, job_title, organizations(name)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('full_name', { ascending: true })
    .limit(200)

  const addablePeople: PersonChoice[] = (allPeople ?? [])
    .filter((p) => !attendeeIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.preferred_name || p.full_name,
      subtitle:
        [p.job_title, p.organizations?.name].filter(Boolean).join(' · ') || null,
    }))
  let staleReason: string | null = null

  if (artifact && attendeeIds.length > 0) {
    const since = artifact.created_at
    const [{ count: newFacts }, { count: newObservations }, { count: newSources }] =
      await Promise.all([
        supabase
          .from('professional_facts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('person_id', attendeeIds)
          .gt('updated_at', since),
        supabase
          .from('observations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('person_id', attendeeIds)
          .eq('status', 'active')
          .gt('updated_at', since),
        supabase
          .from('source_person_links')
          .select('source_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('person_id', attendeeIds)
          .gt('updated_at', since),
      ])

    const changes: string[] = []
    if ((newFacts ?? 0) > 0) changes.push('public professional facts')
    if ((newObservations ?? 0) > 0) changes.push('what you have learned about them')
    if ((newSources ?? 0) > 0) changes.push('the sources behind it')
    if (changes.length > 0) {
      staleReason = `Since then, ${changes.join(' and ')} changed.`
    }
  }

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
              ? `${relativeDay(meeting.scheduled_at, timeZone, now)} · ${formatTime(meeting.scheduled_at, timeZone)}`
              : 'Unscheduled'}
          </Eyebrow>
          {meeting.importance >= 4 ? (
            <Badge tone="accent">Importance {meeting.importance}/5</Badge>
          ) : null}
        </div>

        <h1 className="font-display text-ink mt-3 text-3xl sm:text-4xl">{meeting.title}</h1>

        {(attendees ?? []).length > 0 ? (
          <p className="text-ink-secondary mt-2 text-sm">
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
            <span className="text-ink-faint text-xs">
              Prepared {formatDate(artifact!.created_at, timeZone)}
            </span>
            <RegenerateBrief meetingId={id} stale={false} reason={null} />
          </div>

          {staleReason ? <RegenerateBrief meetingId={id} stale reason={staleReason} /> : null}

          <div className="mt-10">
            <MeetingBriefView
              brief={brief}
              citations={citations}
              grounded={artifact!.grounded_fallback}
              meetingId={id}
            />
          </div>

          <div className="border-line mt-12 border-t pt-6">
            <ArtifactFeedback artifactId={artifact!.id} />
          </div>
        </>
      ) : (
        <GenerateBriefPanel
          meetingId={id}
          hasObjective={Boolean(meeting.objective)}
          attendeeCount={(attendees ?? []).length}
          addablePeople={addablePeople}
        />
      )}
    </Container>
  )
}
