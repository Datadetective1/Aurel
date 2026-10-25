import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { resolveFace } from '@/lib/conversations/avatars'
import { relationshipLabel } from '@/lib/conversations/room'
import { loadPersonRecordVisual } from '@/lib/visual/person.server'
import { toVisualLoop } from '@/lib/visual/meeting.server'
import { track } from '@/lib/analytics'
import { readJson } from '@/lib/mobile/route'
import { updatePerson } from '@/app/(app)/people/actions'
import { deletePersonRecord } from '@/lib/people/lifecycle.server'
import type {
  DeletePersonRequest,
  DeletePersonResponse,
  PersonResponse,
  UpdatePersonRequest,
  UpdatePersonResponse,
} from '@/lib/mobile/contracts'

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
      'id, full_name, preferred_name, email, profile_url, relevance, pronouns, timezone, notes, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, organizations(name, domain)',
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
    edit: {
      fullName: person.full_name,
      preferredName: person.preferred_name,
      jobTitle: person.job_title,
      organizationName: person.organizations?.name ?? null,
      email: person.email,
      profileUrl: person.profile_url,
      relationshipType: person.relationship_type,
      relevance: person.relevance,
      pronouns: person.pronouns,
      timezone: person.timezone,
      notes: person.notes,
    },
  }
  return json(body)
}

/** Correct someone's record: the web's edit form and its validation. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<UpdatePersonRequest>(request)
  if (!body)
    return json<UpdatePersonResponse>({ ok: false, error: 'That request could not be read.' }, 400)

  // Only an active person on this account: anything else is not found here.
  const { data: person } = await ctx.supabase
    .from('people')
    .select('id')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .is('archived_at', null)
    .maybeSingle()
  if (!person) return json<UpdatePersonResponse>({ ok: false, error: 'not_found' }, 404)

  const form = new FormData()
  form.set('personId', id)
  form.set('fullName', String(body.fullName ?? ''))
  const fields = [
    'preferredName',
    'jobTitle',
    'organizationName',
    'email',
    'profileUrl',
    'relationshipType',
    'pronouns',
    'timezone',
    'notes',
  ] as const
  for (const key of fields) if (body[key]) form.set(key, String(body[key]))
  if (typeof body.relevance === 'number') form.set('relevance', String(body.relevance))

  const result = await updatePerson({}, form)
  if (result.error || result.fieldErrors) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<UpdatePersonResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'Check those details.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 502,
    )
  }
  return json<UpdatePersonResponse>({ ok: true })
}

/**
 * Delete someone for good. Only an archived person, and only with
 * `{ "confirm": "delete" }`: the app shows the deletion preview first.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<DeletePersonRequest>(request)
  if (body?.confirm !== 'delete') {
    return json<DeletePersonResponse>({ ok: false, error: 'Confirm the delete.' }, 400)
  }

  const outcome = await deletePersonRecord(ctx.supabase, ctx.user.id, id)
  if (!outcome.ok) {
    const status =
      outcome.reason === 'not_found' ? 404 : outcome.reason === 'not_archived' ? 409 : 502
    const error =
      outcome.reason === 'not_archived'
        ? 'Remove them from your people first; only an archived person can be deleted.'
        : outcome.reason === 'not_found'
          ? 'not_found'
          : 'They could not be deleted. Nothing was changed.'
    return json<DeletePersonResponse>({ ok: false, error }, status)
  }
  await track('person_deleted', {
    keptLoops: outcome.keptLoops > 0,
    removedSources: outcome.removedSources > 0,
  })
  return json<DeletePersonResponse>({ ok: true, keptLoops: outcome.keptLoops })
}
