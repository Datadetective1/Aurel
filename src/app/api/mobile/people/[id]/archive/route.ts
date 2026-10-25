import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { archivePersonRecord } from '@/lib/people/lifecycle.server'
import { track } from '@/lib/analytics'
import type { PersonLifecycleResponse } from '@/lib/mobile/contracts'

/** Remove someone from the active record. Reversible; their history stays. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const outcome = await archivePersonRecord(ctx.supabase, ctx.user.id, id)
  if (outcome === 'not_found') {
    return json<PersonLifecycleResponse>({ ok: false, error: 'not_found' }, 404)
  }
  if (outcome === 'archived') await track('person_archived')
  return json<PersonLifecycleResponse>({ ok: true })
}
