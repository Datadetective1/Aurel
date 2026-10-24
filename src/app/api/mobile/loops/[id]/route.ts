import { z } from 'zod'
import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { setLoopStatus } from '@/app/(app)/loops/actions'
import type { LoopActionRequest, LoopActionResponse } from '@/lib/mobile/contracts'

const ACTIONS = ['done', 'later', 'cancel', 'reopen'] as const

/** Done, Later, Cancel, Reopen: the web's one-tap loop action, from the phone. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)

  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<LoopActionRequest>(request)
  const action = ACTIONS.find((a) => a === body?.action)
  if (!action) return json<LoopActionResponse>({ ok: false, error: 'Unknown action.' }, 400)

  const result = await setLoopStatus(id, action)
  if (!result.ok) {
    return json<LoopActionResponse>(
      { ok: false, error: result.error ?? 'That could not be saved. Try again.' },
      result.error === 'That loop could not be found.' ? 404 : 502,
    )
  }
  return json<LoopActionResponse>({ ok: true })
}
