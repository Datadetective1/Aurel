import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { createMeetingCore } from '@/app/(app)/meetings/actions'
import type { CreateMeetingRequest, CreateMeetingResponse } from '@/lib/mobile/contracts'

/**
 * A meeting created on the phone: the web's own creation path, so the same
 * validation (an objective is required), the same wall-clock reading in the
 * account's zone, and the same analytics. Attendees must already be the
 * caller's people; any id that is not is dropped before it is written.
 */
export async function POST(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<CreateMeetingRequest>(request)
  if (!body) {
    return json<CreateMeetingResponse>({ ok: false, error: 'That request could not be read.' }, 400)
  }

  const requested = [...new Set((body.attendeeIds ?? []).map(String))].slice(0, 12)
  const { data: owned } = requested.length
    ? await ctx.supabase
        .from('people')
        .select('id')
        .eq('user_id', ctx.user.id)
        .is('archived_at', null)
        .in('id', requested)
    : { data: [] as { id: string }[] }

  const form = new FormData()
  form.set('title', String(body.title ?? ''))
  form.set('objective', String(body.objective ?? ''))
  if (body.scheduledAt) form.set('scheduledAt', String(body.scheduledAt))
  if (typeof body.durationMinutes === 'number') {
    form.set('durationMinutes', String(Math.round(body.durationMinutes)))
  }
  for (const person of owned ?? []) form.append('attendee', `${person.id}:contributor`)

  const result = await createMeetingCore(form)
  if (!result.meetingId) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<CreateMeetingResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'We could not create that meeting.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 502,
    )
  }
  return json<CreateMeetingResponse>({ ok: true, meetingId: result.meetingId }, 201)
}
