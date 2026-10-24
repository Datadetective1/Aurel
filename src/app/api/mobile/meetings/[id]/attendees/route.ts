import { z } from 'zod'
import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { addMeetingParticipant } from '@/app/(app)/meetings/actions'
import type { AddAttendeeRequest, AddAttendeeResponse } from '@/lib/mobile/contracts'

/**
 * Add someone already on record to a meeting -- the case a calendar sync
 * leaves behind, a meeting with nobody Atturel knows in it. The web action
 * checks that both the meeting and the person are the caller's.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)

  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<AddAttendeeRequest>(request)
  const personId = String(body?.personId ?? '')
  if (!z.string().uuid().safeParse(personId).success) {
    return json<AddAttendeeResponse>({ ok: false, error: 'That person could not be found.' }, 400)
  }

  const result = await addMeetingParticipant(id, personId)
  if (result.error) return json<AddAttendeeResponse>({ ok: false, error: result.error }, 422)
  return json<AddAttendeeResponse>({ ok: true })
}
