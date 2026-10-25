import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { restorePersonRecord } from '@/lib/people/lifecycle.server'
import { track } from '@/lib/analytics'
import type { PersonLifecycleResponse } from '@/lib/mobile/contracts'

/** Bring someone back. Held to the plan's active-people limit, as on the web. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const outcome = await restorePersonRecord(ctx.supabase, ctx.user.id, id)
  if (!outcome.ok) {
    return outcome.reason === 'limit'
      ? json<PersonLifecycleResponse>({ ok: false, error: outcome.message }, 403)
      : json<PersonLifecycleResponse>({ ok: false, error: 'not_found' }, 404)
  }
  if (!outcome.already) await track('person_restored')
  return json<PersonLifecycleResponse>({ ok: true })
}
