import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { loadMeetingVisual } from '@/lib/visual/meeting.server'
import { listeningCues, startProximity } from '@/lib/brief'
import { track } from '@/lib/analytics'
import type { MeetingResponse } from '@/lib/mobile/contracts'

/** One meeting at every depth: the glance, the quick modules and the whole stored brief. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)

  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response
  const now = new Date()

  const visual = await loadMeetingVisual(ctx.supabase, ctx.user.id, id, {
    timeZone: ctx.timeZone,
    now,
  })
  if (!visual) return json({ error: 'not_found' }, 404)

  const brief = visual.brief
  const cues = brief
    ? listeningCues(brief, {
        openCommitments: visual.loops
          .filter((l) => l.status === 'open')
          .slice(0, 4)
          .map((l) => ({ description: l.description, owner: l.owner })),
      })
    : []

  await track('mobile_brief_opened', {
    proximity: startProximity(visual.meeting.scheduledAt, now),
    participants: visual.people.length,
    prepared: Boolean(brief),
  })

  const body: MeetingResponse = {
    meeting: {
      id: visual.meeting.id,
      title: visual.meeting.title,
      scheduledAt: visual.meeting.scheduledAt,
      objective: visual.meeting.objective,
    },
    timeZone: ctx.timeZone,
    prep: visual.prep,
    people: visual.people,
    glance: visual.glance,
    quick: brief
      ? {
          objective: brief.objective,
          outcomeToLeaveWith: brief.outcomeToLeaveWith,
          howToOpen: brief.howToOpen,
          recommendedApproach: brief.recommendedApproach,
          participants: brief.participants.map((p) => ({
            personId: p.personId,
            name: p.name,
            guidance: p.guidance,
            knownConcerns: p.knownConcerns,
            publicOnly: p.publicOnly,
          })),
          cues,
          likelyObjections: brief.likelyObjections,
          uncertainties: brief.uncertainties,
        }
      : null,
    deep: brief,
    loops: visual.visualLoops,
    lastConversation: visual.lastConversation,
    connections: visual.connections,
    grounded: visual.artifact?.grounded ?? null,
    preparedAt: visual.artifact?.createdAt ?? null,
  }
  return json(body)
}
