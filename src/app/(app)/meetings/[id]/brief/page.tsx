import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, CircleCheck } from 'lucide-react'
import { MeetingBriefView, type BriefCitation } from '@/components/app/meeting-brief'
import { BriefDepthNav } from '@/components/app/brief-depth-nav'
import { GenerateBriefPanel } from '@/components/app/generate-brief'
import type { PersonChoice } from '@/components/app/add-participants'
import { ArtifactFeedback } from '@/components/app/artifact-feedback'
import { RegenerateBrief } from '@/components/app/regenerate-brief'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics'
import { formatDate, formatTime, relativeDay } from '@/lib/format'
import { listeningCues, normalizeBrief, startProximity } from '@/lib/brief'

export const metadata: Metadata = {
  title: 'Meeting brief',
  robots: { index: false, follow: false },
}

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ debriefed?: string }>
}) {
  const { id } = await params
  const { debriefed } = await searchParams
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

  // Normalised once at the boundary. `content` is a Json column that is cast,
  // never parsed, so a brief written before a field existed simply lacks it --
  // and the three depths all read the same object.
  const brief = artifact ? normalizeBrief(artifact.content) : null

  // Promises still open with this room. Read here rather than composed into the
  // artifact because a commitment closes between generating a brief and reading
  // it, and a stale "still open" is worse than none.
  const { data: openCommitments } =
    brief && attendeeIds.length > 0
      ? await supabase
          .from('commitments')
          .select('description, owner, due_on')
          .eq('user_id', user.id)
          .eq('status', 'open')
          .in('person_id', attendeeIds)
          .order('due_on', { ascending: true, nullsFirst: false })
          .limit(4)
      : { data: [] as { description: string; owner: string; due_on: string | null }[] }

  const cues = brief ? listeningCues(brief, { openCommitments: openCommitments ?? [] }) : []

  if (brief) {
    await track('brief_deep_viewed', {
      proximity: startProximity(meeting.scheduled_at, now),
      participants: brief.participants.length,
      listening_cues: cues.length,
    })
  }

  return (
    <Container size="default" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href="/meetings">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Meetings
        </Link>
      </Button>

      {/* Saving a debrief redirected here with `?debriefed=1` and nothing read
          it, so the one action that visibly compounds landed in silence.

          It confirms the save and says what the save bought -- carefully. The
          record improved because the user confirmed things into it, not
          because anything learned on its own, and the wording has to keep that
          straight. */}
      {debriefed ? (
        <p
          role="status"
          className="border-line bg-bg-sunken text-ink-secondary mt-6 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed"
        >
          <CircleCheck className="text-positive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Debrief saved. What you confirm becomes part of this person&rsquo;s record, so the next
            brief starts from it.
          </span>
        </p>
      ) : null}

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
          {/* The depth rail replaces a lone "Quick Brief" button. That button
              was the only way to reach the short view and it named a document
              rather than a promise, so the two shorter depths were effectively
              undiscoverable from here. */}
          <BriefDepthNav meetingId={id} current="deep" className="mt-6" />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/meetings/${id}/debrief`}>Debrief this meeting</Link>
            </Button>
            <span className="text-ink-faint text-xs">
              Prepared {formatDate(artifact!.created_at, timeZone)}
            </span>
            <RegenerateBrief meetingId={id} stale={false} reason={null} />
          </div>

          {/* The compounding promise, said once, where it is about to be true.
              The loop -- prepare, meet, debrief, remember, prepare better --
              is built and works, and the product never mentioned it outside a
              single line in the first-run checklist that a returning user
              never sees again. One sentence under the button that starts the
              next turn of it. */}
          <p className="text-ink-muted mt-3 text-xs leading-relaxed">
            Afterwards, debriefing is what sharpens the next one — what you confirm becomes part of
            the record this brief was built from.
          </p>

          {staleReason ? <RegenerateBrief meetingId={id} stale reason={staleReason} /> : null}

          <div className="mt-10">
            <MeetingBriefView
              brief={brief}
              citations={citations}
              grounded={artifact!.grounded_fallback}
              meetingId={id}
              cues={cues}
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
