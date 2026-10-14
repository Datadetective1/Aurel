import { NextResponse } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { transcribeSegment } from '@/lib/capture/segments'
import { supabaseSegmentDeps } from '@/lib/capture/segments.server'
import { transcribeAndMeter, transcriptionFailureMessage } from '@/lib/capture/transcribe.server'
import type { TranscribeFailure } from '@/lib/ai/transcribe'

/**
 * Transcribe one uploaded segment, then delete it.
 *
 * Ownership is checked against the signed-in user before storage is touched;
 * another user's segment id answers 404. The words go back to the phone and
 * are not stored here. See lib/capture/segments for when the object is
 * deleted on failure.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One ten-minute segment, with room for a slow provider and one retry.
export const maxDuration = 120

const noStore = { 'cache-control': 'no-store' }

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboardedUser()
  if (!features.captureStorage) {
    return NextResponse.json({ error: 'That recording could not be found.' }, { status: 404 })
  }
  const { id } = await params

  try {
    const result = await transcribeSegment(user.id, id, {
      ...supabaseSegmentDeps(),
      transcribe: async ({ audio, extension, declaredSeconds }) => {
        const metered = await transcribeAndMeter({ audio, extension, declaredSeconds })
        if (metered.ok) {
          return {
            ok: true,
            text: metered.text,
            seconds: metered.duration.seconds,
            notice: metered.notice,
          }
        }
        return metered.reason === 'allowance'
          ? { ok: false, reason: 'allowance', message: metered.message }
          : { ok: false, reason: metered.reason }
      },
      failureMessage: (reason) => transcriptionFailureMessage(reason as TranscribeFailure),
    })

    if (!result.ok) {
      await track('capture_segment_failed', { status: result.status, retryable: result.retryable })
      return NextResponse.json(
        { error: result.error, retryable: result.retryable },
        { status: result.status, headers: noStore },
      )
    }
    await track('capture_segment_transcribed', {})
    return NextResponse.json(
      { text: result.text, seconds: result.seconds, notice: result.notice },
      { headers: noStore },
    )
  } catch (error) {
    logger.error('capture.segment_transcribe_failed', {
      error: error instanceof Error ? error.message.slice(0, 60) : 'unknown',
    })
    return NextResponse.json(
      { error: "We couldn't transcribe that part. Try again.", retryable: true },
      { status: 502, headers: noStore },
    )
  }
}
