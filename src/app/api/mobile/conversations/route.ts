import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { createConversationCore } from '@/app/(app)/conversations/actions'
import { track } from '@/lib/analytics'
import type { CaptureRequest, CaptureResponse } from '@/lib/mobile/contracts'

/**
 * Keep a conversation from the phone.
 *
 * The audio never comes here: the app sends it to /api/conversations/
 * transcribe, which returns words and drops the audio, exactly as the web
 * recorder does. What arrives here is text, and it goes through the same
 * capture path as the web form -- the row is written first, then read for
 * loops, decisions and memories, all of which arrive as proposals.
 */
export async function POST(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<CaptureRequest>(request)
  if (!body || typeof body.text !== 'string') return json({ error: 'Send the words to keep.' }, 400)

  const sourceKind = ['voice_note', 'typed_notes', 'meeting_recording'].includes(body.sourceKind)
    ? body.sourceKind
    : 'typed_notes'

  const form = new FormData()
  form.set('source', body.text)
  form.set('sourceKind', sourceKind)
  form.set('kind', sourceKind === 'meeting_recording' ? 'meeting' : 'informal')
  if (body.title) form.set('title', String(body.title).slice(0, 200))
  if (body.meetingId) form.set('meetingId', String(body.meetingId))
  if (typeof body.durationSeconds === 'number') {
    form.set('durationSeconds', String(Math.max(0, Math.round(body.durationSeconds))))
  }
  if (body.consent === true) form.set('consent', 'yes')
  for (const id of (body.participantIds ?? []).slice(0, 12)) form.append('participant', String(id))

  const result = await createConversationCore(form)
  if (!result.interactionId) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json({ error: result.error ?? first ?? 'That conversation could not be kept.' }, 400)
  }

  await track('mobile_capture_completed', {
    sourceKind,
    participants: (body.participantIds ?? []).length,
    fromMeeting: Boolean(body.meetingId),
  })

  const response: CaptureResponse = { interactionId: result.interactionId }
  return json(response, 201)
}
