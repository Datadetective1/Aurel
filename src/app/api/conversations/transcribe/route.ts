import { NextResponse, type NextRequest } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { recordUsage } from '@/lib/billing/entitlements'
import { track } from '@/lib/analytics'
import { logger } from '@/lib/logger'

/**
 * CONVERSATION TRANSCRIPTION
 * =============================================================================
 * Audio in, words out, audio gone. The same contract as the debrief endpoint
 * it grew from, for a wider set of inputs: a voice note spoken after a
 * conversation, a recording of the conversation itself, or an audio file the
 * user already has.
 *
 * The blob exists as a request body and as a variable for the length of one
 * provider call. It is never written to the database, never put in storage,
 * never cached and never logged. What comes back is text, and the text goes to
 * a form the user still reads, edits and submits themselves.
 *
 * This endpoint produces words and nothing else. Extraction happens in the
 * conversation action, behind the user's explicit submit.
 * =============================================================================
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The provider's own ceiling is 25 MB. The platform accepts a good deal more
 * than it used to, so the provider is the constraint now, and refusing here
 * gives a sentence instead of a provider error.
 */
const MAX_BYTES = 24 * 1024 * 1024
const MIN_BYTES = 1_000

const ACCEPTED: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'webm',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mpga': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

function extensionFor(mimeType: string, fileName: string): string | null {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (ACCEPTED[base]) return ACCEPTED[base]!
  // Some browsers send octet-stream for a dropped file. The extension is the
  // only other signal, and it is only ever used to name the upload.
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (['webm', 'mp4', 'm4a', 'mp3', 'wav', 'flac', 'ogg', 'mpga', 'mpeg'].includes(ext)) {
    return ext === 'ogg' ? 'webm' : ext === 'mpeg' ? 'mp3' : ext
  }
  return null
}

/** Buckets, so a size never becomes a fingerprint of what was said. */
function sizeBucket(bytes: number): string {
  if (bytes < 250_000) return '<250kb'
  if (bytes < 1_000_000) return '250kb-1mb'
  if (bytes < 5_000_000) return '1mb-5mb'
  if (bytes < 12_000_000) return '5mb-12mb'
  return '12mb-24mb'
}

function durationBucket(seconds: number): string {
  if (seconds < 60) return '<1m'
  if (seconds < 300) return '1-5m'
  if (seconds < 900) return '5-15m'
  if (seconds < 1800) return '15-30m'
  return '30m+'
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
  const declaredSeconds = Number(form.get('durationSeconds') ?? 0)
  const participantIds = form.getAll('participant').map(String).filter(Boolean).slice(0, 12)

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'That recording could not be read.' }, { status: 400 })
  }

  if (audio.size < MIN_BYTES) {
    return NextResponse.json(
      { error: 'That recording was empty. Try again, or type what happened.' },
      { status: 400 },
    )
  }

  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'That recording is larger than 24 MB. Split it, or paste the transcript instead.' },
      { status: 413 },
    )
  }

  const fileName = audio instanceof File ? audio.name : ''
  const extension = extensionFor(audio.type, fileName)
  if (!extension) {
    logger.warn('transcribe.unsupported_type', { declaredType: audio.type.split(';')[0] })
    return NextResponse.json(
      { error: "That audio format isn't supported. MP3, M4A, WAV, WebM and MP4 work." },
      { status: 415 },
    )
  }

  /**
   * Names of the people in the conversation, as spelling hints. They are the
   * user's own records and go nowhere but the transcription call, where they
   * only affect how a name is spelled. Not logged, not sent to analytics.
   */
  let keywords: string[] = []
  if (participantIds.length > 0) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('people')
      .select('full_name, preferred_name')
      .eq('user_id', user.id)
      .in('id', participantIds)
      .limit(12)
    keywords = (data ?? [])
      .map((row) => row.preferred_name || row.full_name)
      .filter((name): name is string => Boolean(name))
  }

  await track('voice_debrief_transcription_started', {
    durationBucket: durationBucket(declaredSeconds),
    sizeBucket: sizeBucket(audio.size),
    surface: 'conversation',
  })

  const result = await transcribeAudio({ audio, extension, keywords })

  if (!result.ok) {
    await track('voice_debrief_transcription_failed', {
      reason: result.reason,
      latencyMs: result.latencyMs,
      surface: 'conversation',
    })
    logger.warn('transcribe.failed', {
      reason: result.reason,
      latencyMs: result.latencyMs,
      sizeBucket: sizeBucket(audio.size),
    })

    const message =
      result.reason === 'empty_result'
        ? "We couldn't make out any speech in that recording. Try again, or type what happened."
        : result.reason === 'not_configured'
          ? 'Transcription is not available on this deployment. You can paste a transcript instead.'
          : result.reason === 'too_large'
            ? 'That recording is too long for the transcription service. Split it and try again.'
            : "We couldn't transcribe that recording. You can try again or paste a transcript."

    return NextResponse.json({ error: message }, { status: 502 })
  }

  await recordUsage({
    meter: 'voice_transcription',
    provider: 'openai',
    model: result.model,
    inputTokens: result.inputTokens ?? undefined,
    outputTokens: result.outputTokens ?? undefined,
  })

  await track('voice_debrief_transcription_completed', {
    latencyMs: result.latencyMs,
    model: result.model,
    provider: 'openai',
    durationBucket: durationBucket(declaredSeconds),
    sizeBucket: sizeBucket(audio.size),
    surface: 'conversation',
  })

  logger.info('transcribe.completed', {
    model: result.model,
    latencyMs: result.latencyMs,
    sizeBucket: sizeBucket(audio.size),
    durationBucket: durationBucket(declaredSeconds),
  })

  return NextResponse.json({ text: result.text }, { headers: { 'cache-control': 'no-store' } })
}
