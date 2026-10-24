import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { generateBrief } from '@/app/(app)/meetings/actions'
import type { PrepareResponse } from '@/lib/mobile/contracts'

/**
 * Prepare a meeting from the phone: the web's Generate, unchanged -- the same
 * entitlement check, the brief stored with the evidence it was built from,
 * the same metering. When no model is available the grounded composer builds
 * it from the record, and the response says so.
 */
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)

  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await generateBrief(id)
  if (!result.ok) {
    const upgrade = 'upgrade' in result ? Boolean(result.upgrade) : false
    return json<PrepareResponse>(
      { ok: false, error: result.error, upgrade },
      result.error === 'That meeting could not be found.' ? 404 : upgrade ? 403 : 502,
    )
  }

  const { data: artifact } = await ctx.supabase
    .from('ai_artifacts')
    .select('grounded_fallback')
    .eq('id', result.artifactId)
    .eq('user_id', ctx.user.id)
    .maybeSingle()

  return json<PrepareResponse>({ ok: true, grounded: artifact?.grounded_fallback ?? null })
}
