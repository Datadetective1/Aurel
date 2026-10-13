import { NextResponse } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { features } from '@/lib/env'
import { checkCapability } from '@/lib/billing/entitlements'
import { logger } from '@/lib/logger'
import { requestSegmentUpload, sweepOrphans } from '@/lib/capture/segments'
import { supabaseSegmentDeps } from '@/lib/capture/segments.server'

/**
 * Ask for somewhere to put one segment of a recording.
 *
 * Returns a signed upload URL for a path under the caller's own folder in the
 * private capture bucket. The audio goes from the phone straight to storage;
 * it never passes through this function, so the request-body ceiling that
 * limits single uploads does not apply.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store' }

export async function POST(request: Request) {
  const { user } = await requireOnboardedUser()

  if (!features.captureStorage) {
    return NextResponse.json(
      { error: 'Long recordings are not available yet. Keep this one under 17 minutes.' },
      { status: 503, headers: noStore },
    )
  }

  const capability = await checkCapability('debrief')
  if (!capability.allowed) {
    return NextResponse.json({ error: capability.message }, { status: 403, headers: noStore })
  }

  const body = (await request.json().catch(() => null)) as {
    captureId?: unknown
    index?: unknown
    extension?: unknown
    bytes?: unknown
    declaredSeconds?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 })

  const deps = supabaseSegmentDeps()
  try {
    // Opportunistic cleanup, bounded: the daily sweep is the backstop.
    await sweepOrphans(deps, 25).catch(() => 0)

    const result = await requestSegmentUpload(
      user.id,
      { ...body, index: body.index, extension: body.extension, bytes: body.bytes },
      deps,
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore })
    }
    return NextResponse.json(result, { status: 201, headers: noStore })
  } catch (error) {
    logger.error('capture.segment_request_failed', {
      error: error instanceof Error ? error.message.slice(0, 60) : 'unknown',
    })
    return NextResponse.json(
      { error: 'That part of the recording could not be uploaded. Try again.' },
      { status: 502, headers: noStore },
    )
  }
}
