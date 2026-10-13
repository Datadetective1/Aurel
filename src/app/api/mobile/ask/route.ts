import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { ask } from '@/app/(app)/coach/actions'
import { track } from '@/lib/analytics'
import type { AskRequest, AskResponse } from '@/lib/mobile/contracts'

/**
 * Ask Atturel from the phone. The same action the web form submits -- same
 * entitlement check, same tools over the user's own record, same metering --
 * with the citations carried back so the app can show what each answer rests
 * on. Nothing is answered that the record does not support.
 */
export async function POST(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<AskRequest>(request)
  const question = typeof body?.question === 'string' ? body.question : ''
  const form = new FormData()
  form.set('question', question)

  const state = await ask({}, form)
  if (state.error || !state.answer) {
    return json(
      { error: state.error ?? 'That question could not be answered.' },
      state.error ? 400 : 502,
    )
  }

  await track('mobile_ask_used', {
    grounded: state.answer.grounded,
    citations: state.answer.citations.length,
  })

  const answer: AskResponse = {
    answer: state.answer.answer,
    grounded: state.answer.grounded,
    followUps: state.answer.followUps,
    citations: state.answer.citations.slice(0, 20).map((c) => ({
      label: c.label,
      evidenceLevel: c.evidenceLevel,
      personId: c.personId ?? null,
    })),
    people: (state.answer.people ?? []).map((p) => ({ id: p.id, name: p.name, src: p.src })),
  }
  return json(answer)
}
