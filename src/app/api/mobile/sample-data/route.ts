import { mobileContext, json } from '@/lib/mobile/route'
import { loadDemoData } from '@/app/(app)/settings/actions'
import { removeSampleRecord } from '@/lib/demo/reset'
import { track } from '@/lib/analytics'
import type { SampleDataResponse } from '@/lib/mobile/contracts'

/**
 * The fictional sample record, from the phone.
 *
 * POST loads it with the web's own action (Settings › Data › Load demo data):
 * invented people, labelled as samples everywhere they appear, idempotent.
 * DELETE removes it, and with it anything captured with those invented
 * people -- never a row that involves a real one.
 */
export async function POST() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await loadDemoData()
  if (result.error) return json<SampleDataResponse>({ ok: false, error: result.error }, 502)
  return json<SampleDataResponse>({
    ok: true,
    message: 'Sample people added. Every one is invented.',
  })
}

export async function DELETE() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const result = await removeSampleRecord(ctx.supabase, ctx.user.id)
  if (!result.ok) {
    return json<SampleDataResponse>(
      { ok: false, error: 'The sample record could not be removed. Try again.' },
      502,
    )
  }
  await track('demo_data_cleared', { conversations: result.conversationsRemoved })
  return json<SampleDataResponse>({ ok: true, message: 'Sample record removed.' })
}
