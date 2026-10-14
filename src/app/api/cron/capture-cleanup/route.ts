import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { sweepOrphans } from '@/lib/capture/segments'
import { supabaseSegmentDeps } from '@/lib/capture/segments.server'

/**
 * The orphan sweep: any capture segment still in storage an hour after it
 * was uploaded is deleted. Every upload request also runs a small sweep, so
 * this daily run is the backstop, not the only line.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const secret = serverEnv.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!features.captureStorage) return NextResponse.json({ ok: true, removed: 0, enabled: false })

  let removed = 0
  try {
    const deps = supabaseSegmentDeps()
    for (let round = 0; round < 10; round++) {
      const n = await sweepOrphans(deps, 500)
      removed += n
      if (n < 500) break
    }
  } catch (error) {
    logger.error('capture.cleanup_failed', {
      error: error instanceof Error ? error.message.slice(0, 60) : 'unknown',
    })
    return NextResponse.json({ ok: false, removed }, { status: 500 })
  }
  logger.info('capture.cleanup_completed', { removed })
  return NextResponse.json({ ok: true, removed })
}
