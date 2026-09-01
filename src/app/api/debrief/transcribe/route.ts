import { NextResponse, type NextRequest } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { checkCapability, recordUsage } from '@/lib/billing/entitlements'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * VOICE DEBRIEF TRANSCRIPTION
 * =============================================================================
 * Audio in, words out, audio gone.
 *
 * The blob exists as a request body and as a variable for the length of one
 * provider call. It is never written to the database, never put in blob
 * storage, never cached and never logged. The only thing that outlives the
 * request is the transcript, and that goes back to the browser to be dropped
 * into a form the user still has to read, edit and submit themselves.
 *
 * This endpoint produces text and nothing else. No observations, no
 * commitments, no memory proposals -- those stay with the existing debrief
 * action, behind the user's explicit submit.
 * =============================================================================
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vercel caps a function request body at 4.5 MB. The client refuses to send
 * more than 4 MB, and this is the server saying the same thing rather than
 * trusting it to.
 */
const MAX_BYTES = 4 * 1024 * 1024
const MIN_BYTES = 1_000

/**
 * What browsers actually produce, mapped to what the provider accepts.
 *
 * Chrome and Firefox emit webm/opus; Safari emits mp4 or a bare
 * audio/mpeg. Codec parameters arrive attached to the type
 * ("audio/webm;codecs=opus"), so the base type is what gets matched.
 */
const ACCEPTED: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'webm',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mpga': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

function extensionFor(mimeType: string): string | null {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return ACCEPTED[base] ?? null
}

/** Buckets, so a size never becomes a fingerprint of what was said. */
function sizeBucket(bytes: number): string {
  if (bytes < 250_000) return '<250kb'
  if (bytes < 1_000_000) return '250kb-1mb'
  if (bytes < 2_500_000) return '1mb-2.5mb'
  return '2.5mb-4mb'
}

function durationBucket(seconds: number): string {
  if (seconds < 15) return '<15s'
  if (seconds < 45) return '15-45s'
  if (seconds < 90) return '45-90s'
  return '90-180s'
}

export async function POST(request: NextRequest) {
  // Authentication first. Nothing below runs for a stranger, including reading
  // the body.
  const { user } = await requireOnboardedUser()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'That recording could not be read.' }, { status: 400 })
  }

  const audio = form.get('audio')
  const meetingId = form.get('meetingId')
  const declaredSeconds = Number(form.get('durationSeconds') ?? 0)

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'That recording could not be read.' }, { status: 400 })
  }

  if (audio.size < MIN_BYTES) {
    // A tap on the button, or a microphone that produced nothing.
    return NextResponse.json(
      { error: "That recording was empty. Try again, or type your debrief." },
      { status: 400 },
    )
  }

  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'That recording is too large to process. Please record a shorter debrief.' },
      { status: 413 },
    )
  }

  const extension = extensionFor(audio.type)
  if (!extension) {
    logger.warn('transcribe.unsupported_type', { declaredType: audio.type.split(';')[0] })
    return NextResponse.json(
      { error: "That audio format isn't supported. You can type your debrief instead." },
      { status: 415 },
    )
  }

  /**
   * Names of the people in this meeting, as spelling hints.
   *
   * They are already the user's own records and never leave for anywhere but
   * the transcription call, where they only affect how a name is spelled. They
   * are not logged, and they are not sent to analytics.
   */
  let keywords: string[] = []
  if (typeof meetingId === 'string' && meetingId.length > 0) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('meeting_attendees')
      .select('people(full_name, preferred_name)')
      .eq('user_id', user.id)
      .eq('meeting_id', meetingId)
      .limit(12)

    keywords = (data ?? [])
      .map((row) => row.people?.preferred_name || row.people?.full_name)
      .filter((name): name is string => Boolean(name))
  }

  // Checked HERE, immediately before the paid call, and not earlier: the
  // validation above rejects a malformed or oversized upload, and burning
  // somebody's monthly allowance on a request that was never going to reach the
  // provider is the one way this gate could make things worse.
  //
  // The quota is what bites. `debrief` is on for every plan, so the capability
  // half passes everywhere — it is here so that an account with the capability
  // switched off by a support override is refused too.
  const capability = await checkCapability('debrief', 'voice_transcription')
  if (!capability.allowed) {
    // 402, not 403: this is a limit, not a permission, and the client
    // distinguishes them when deciding whether to offer the upgrade.
    return NextResponse.json({ error: capability.message, upgrade: true }, { status: 402 })
  }

  await track('voice_debrief_transcription_started', {
    durationBucket: durationBucket(declaredSeconds),
    sizeBucket: sizeBucket(audio.size),
  })

  const result = await transcribeAudio({ audio, extension, keywords })

  if (!result.ok) {
    await track('voice_debrief_transcription_failed', {
      reason: result.reason,
      latencyMs: result.latencyMs,
    })
    logger.warn('transcribe.failed', {
      reason: result.reason,
      latencyMs: result.latencyMs,
      sizeBucket: sizeBucket(audio.size),
    })

    // The user hears one of two things: try again, or type it. Provider detail
    // is not theirs to debug.
    const message =
      result.reason === 'empty_result'
        ? "We couldn't make out any speech in that recording. Try again, or type your debrief."
        : result.reason === 'not_configured'
          ? 'Voice debrief is not available on this deployment. You can type your debrief.'
          : "We couldn't transcribe that recording. You can try again or type your debrief."

    return NextResponse.json({ error: message }, { status: 502 })
  }

  // Real token counts from the provider. The price table has no entry for a
  // transcription model, so estimated cost stays zero and the existing
  // `usage.unpriced_model` warning fires -- which is the honest outcome rather
  // than a number nobody checked. See the report accompanying this feature.
  await recordUsage({
    meter: 'voice_transcription',
    provider: 'openai',
    model: result.model,
    inputTokens: result.inputTokens ?? undefined,
    outputTokens: result.outputTokens ?? undefined,
    subjectKind: 'meeting',
    subjectId: typeof meetingId === 'string' ? meetingId : undefined,
  })

  await track('voice_debrief_transcription_completed', {
    latencyMs: result.latencyMs,
    model: result.model,
    provider: 'openai',
    durationBucket: durationBucket(declaredSeconds),
    sizeBucket: sizeBucket(audio.size),
  })

  logger.info('transcribe.completed', {
    model: result.model,
    latencyMs: result.latencyMs,
    sizeBucket: sizeBucket(audio.size),
    durationBucket: durationBucket(declaredSeconds),
  })

  return NextResponse.json(
    { text: result.text },
    { headers: { 'cache-control': 'no-store' } },
  )
}
