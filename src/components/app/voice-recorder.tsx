'use client'

import * as React from 'react'
import { CircleAlert, Loader2, Mic, Square, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatElapsed, pickMimeType, recordingSupported } from './voice-debrief'
import { cn } from '@/lib/utils'
import { SINGLE_UPLOAD_MAX_BYTES, SINGLE_UPLOAD_MAX_SECONDS } from '@/lib/capture/limits'
import { brand } from '@/lib/brand'

/**
 * VOICE RECORDER
 * =============================================================================
 * The debrief recorder, grown up. Records from the microphone or accepts an
 * audio file, sends it to the conversation transcription route, and hands the
 * words back. It never submits anything itself.
 *
 * Longer than the debrief's three minutes because this is for the
 * conversation itself as well as a note about it afterwards. The ceiling is
 * the platform's request-body limit (see lib/capture/limits): recorded at
 * 32 kbps, seventeen minutes fits with room to spare, and that is the limit
 * stated up front rather than discovered at upload time. Longer recordings
 * use the iPhone app's segmented upload.
 *
 * Audio leaves this component once, as a POST to our own route, and is not
 * kept anywhere. The words come back and go into the form beside it.
 * =============================================================================
 */

const MAX_SECONDS = SINGLE_UPLOAD_MAX_SECONDS
const MAX_BYTES = SINGLE_UPLOAD_MAX_BYTES
/** Speech encoding: small enough that MAX_SECONDS fits under MAX_BYTES. */
const BITS_PER_SECOND = 32_000

type Phase = 'idle' | 'recording' | 'transcribing' | 'error'

function subscribeToNothing(): () => void {
  return () => {}
}

export function VoiceRecorder({
  participantIds,
  onTranscript,
  mode,
  className,
}: {
  participantIds: string[]
  /** Receives the words and how long the audio ran. */
  onTranscript: (text: string, durationSeconds: number, origin: 'recorded' | 'file') => void
  /** 'note' is the user speaking afterwards; 'live' is recording the room. */
  mode: 'note' | 'live'
  className?: string
}) {
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [elapsed, setElapsed] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  /** Near the month's transcription allowance: said once, after a success. */
  const [notice, setNotice] = React.useState<string | null>(null)

  const supported = React.useSyncExternalStore(
    subscribeToNothing,
    () => recordingSupported(typeof navigator === 'undefined' ? undefined : navigator),
    () => false,
  )

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = React.useRef(0)
  const discardedRef = React.useRef(false)
  const startButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  // The last recording that failed to transcribe, kept so "try again" resends
  // it instead of asking someone to re-record a meeting that is over.
  const [failed, setFailed] = React.useState<{
    blob: Blob
    seconds: number
    origin: 'recorded' | 'file'
    fileName?: string
  } | null>(null)

  const cleanup = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  React.useEffect(() => cleanup, [cleanup])

  React.useEffect(() => {
    if (phase !== 'recording') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  async function send(blob: Blob, seconds: number, origin: 'recorded' | 'file', fileName?: string) {
    if (blob.size > MAX_BYTES) {
      setPhase('error')
      setError(
        `That audio is larger than ${Math.floor(MAX_BYTES / 1_000_000)} MB. Split it, or paste a transcript instead.`,
      )
      return
    }
    if (blob.size < 1_000) {
      setPhase('error')
      setError('That recording was empty. Try again, or type what happened.')
      return
    }

    setPhase('transcribing')
    setError(null)

    const body = new FormData()
    body.set('audio', blob, fileName ?? 'recording')
    body.set('durationSeconds', String(seconds))
    for (const id of participantIds) body.append('participant', id)

    try {
      const response = await fetch('/api/conversations/transcribe', { method: 'POST', body })
      const payload = (await response.json().catch(() => null)) as {
        text?: string
        error?: string
        notice?: string | null
      } | null

      if (!response.ok || !payload?.text) {
        setPhase('error')
        setFailed({ blob, seconds, origin, fileName })
        setError(
          `${payload?.error ?? "We couldn't transcribe that."} Your recording is still here. Try again, or download it to keep a copy.`,
        )
        return
      }

      setFailed(null)
      setNotice(payload.notice ?? null)
      onTranscript(payload.text, seconds, origin)
      setPhase('idle')
      setElapsed(0)
      startButtonRef.current?.focus()
    } catch {
      setPhase('error')
      setFailed({ blob, seconds, origin, fileName })
      setError(
        "We couldn't reach the transcription service. Your recording is still here. Try again when you're back online, or download it to keep a copy.",
      )
    }
  }

  async function start() {
    setError(null)
    discardedRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (cause) {
      setPhase('error')
      const denied =
        cause instanceof DOMException &&
        (cause.name === 'NotAllowedError' || cause.name === 'SecurityError')
      setError(
        denied
          ? "Microphone access wasn't allowed. Allow the microphone for this site in your browser's settings and try again, or upload audio or type what happened."
          : "We couldn't start recording. You can upload audio or type what happened.",
      )
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const mimeType = pickMimeType(
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
        ? (type) => MediaRecorder.isTypeSupported(type)
        : undefined,
    )

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: BITS_PER_SECOND,
      })
    } catch {
      cleanup()
      setPhase('error')
      setError("We couldn't start recording on this browser. You can upload audio instead.")
      return
    }

    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const seconds = elapsedRef.current
      const type = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type })
      cleanup()
      if (discardedRef.current) {
        setPhase('idle')
        setElapsed(0)
        return
      }
      void send(blob, seconds, 'recorded')
    }

    // Timeslice so a long recording is not one giant buffer held until stop.
    recorder.start(10_000)
    setPhase('recording')
    setElapsed(0)
    elapsedRef.current = 0

    tickRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      if (elapsedRef.current >= MAX_SECONDS) stop()
    }, 1000)
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  function discard() {
    discardedRef.current = true
    stop()
    setPhase('idle')
    setElapsed(0)
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void send(file, 0, 'file', file.name)
  }

  return (
    <div
      className={cn(
        'border-line bg-bg-sunken rounded-[var(--radius-md)] border px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {phase === 'recording' ? (
          <>
            <span
              className="text-critical flex items-center gap-2 text-sm font-medium"
              aria-hidden="true"
            >
              <span className="bg-critical size-2.5 animate-pulse rounded-full" />
              Recording
            </span>
            <span className="text-ink font-mono text-sm tabular-nums">
              {formatElapsed(elapsed)}
              <span className="text-ink-faint"> / {formatElapsed(MAX_SECONDS)}</span>
            </span>
            <span className="ms-auto flex gap-2">
              <Button type="button" size="sm" className="min-h-11" onClick={stop}>
                <Square className="size-3.5" aria-hidden="true" />
                Stop
              </Button>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                className="min-h-11"
                onClick={discard}
              >
                <X className="size-3.5" aria-hidden="true" />
                Discard
              </Button>
            </span>
          </>
        ) : phase === 'transcribing' ? (
          <span className="text-ink-secondary flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Transcribing… this can take a minute for a long recording.
          </span>
        ) : (
          <>
            {supported ? (
              <Button
                ref={startButtonRef}
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11"
                onClick={start}
              >
                <Mic className="size-3.5" aria-hidden="true" />
                {mode === 'live' ? 'Record the conversation' : 'Record a voice note'}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={supported ? 'ghost' : 'secondary'}
              className="min-h-11"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Upload audio
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.webm,.mp4,.flac"
              className="sr-only"
              onChange={onFile}
              tabIndex={-1}
              aria-hidden="true"
            />
          </>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {phase === 'recording'
          ? `Recording, ${formatElapsed(elapsed)} elapsed of seventeen minutes maximum.`
          : phase === 'transcribing'
            ? 'Transcribing your recording.'
            : ''}
      </p>

      <p className="text-ink-muted mt-2 text-xs leading-relaxed">
        {mode === 'live'
          ? `Audio is used to create the transcript; ${brand.name} does not keep it. Tell the people in the room before you press record.`
          : `Say what happened in your own words. Audio is used to create the transcript; ${brand.name} does not keep it.`}
      </p>

      {notice && !error ? (
        <p role="status" className="text-ink-muted mt-2 text-xs">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="text-critical mt-2 flex items-start gap-1.5 text-xs leading-relaxed"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {failed && phase === 'error' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11"
            onClick={() => void send(failed.blob, failed.seconds, failed.origin, failed.fileName)}
          >
            Try again
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => downloadBlob(failed.blob, failed.fileName ?? 'atturel-recording.webm')}
          >
            Download recording
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Save a blob through a temporary link, revoked straight after the click. */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
