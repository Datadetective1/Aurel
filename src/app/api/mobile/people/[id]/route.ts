import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { resolveFace } from '@/lib/conversations/avatars'
import { relationshipLabel } from '@/lib/conversations/room'
import { loadPersonRecordVisual } from '@/lib/visual/person.server'
import { toVisualLoop } from '@/lib/visual/meeting.server'
import { track } from '@/lib/analytics'
import type { PersonResponse } from '@/lib/mobile/contracts'

/** One person: face, place, what is open, and the dated record between you. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)

  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response
  const now = new Date()

  const { data: person } = await ctx.supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, email, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, organizations(name, domain)',
    )
    .eq('user_id', ctx.user.id)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()
  if (!person) return json({ error: 'not_found' }, 404)

  const name = person.preferred_name || person.full_name
  const [face, record] = await Promise.all([
    resolveFace(ctx.supabase, person),
    loadPersonRecordVisual(ctx.supabase, ctx.user.id, id, {
      firstName: name.split(' ')[0] ?? name,
      timeZone: ctx.timeZone,
      now,
    }),
  ])
  const loops = record.activeLoops.map((l) => toVisualLoop(l, ctx.timeZone, now))
  const label = relationshipLabel(person.relationship_type)

  await track('mobile_person_opened', { loops: loops.length, timeline: record.timeline.length })

  const body: PersonResponse = {
    timeZone: ctx.timeZone,
    person: {
      id: person.id,
      name,
      fullName: person.full_name,
      src: face,
      title: person.job_title,
      company: person.organizations?.name ?? null,
      companyDomain: person.organizations?.domain ?? null,
      context: label,
      relationshipLabel: label,
      email: person.email,
      lastInteractionAt: person.last_interaction_at,
      openLoops: loops.length,
      owe: loops.filter((l) => l.direction === 'owe').length,
      isDemo: person.is_demo,
      nextMeeting: record.nextMeeting,
    },
    loops,
    timeline: record.timeline,
    themes: record.themes,
  }
  return json(body)
}
