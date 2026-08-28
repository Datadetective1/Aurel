'use client'

import * as React from 'react'
import { CircleAlert, Loader2, Mic, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recordVoiceEvent } from '@/app/(app)/meetings/voice-actions'

/**
 * VOICE DEBRIEF
 * =============================================================================
 * Speak the debrief instead of typing it.
 *
 * An alternate input to the existing field, not a second workflow. It produces
 * text, drops it into the textarea that was always there, and stops. The user
 * still reads it, still edits it, and still presses the existing submit --
 * nothing here proposes an observation or touches relationship memory.
 *
 * Native MediaRecorder, no library. The container type is probed rather than
 * assumed: Chrome and Firefox give webm/opus, Safari gives mp4, and hard-coding
 * either one breaks half the pilot.
 *
 * The audio never leaves this component except as one multipart POST to our own
 * endpoint, and is dropped as soon as that returns.
 * =============================================================================
 */

const MAX_SECONDS = 180
/** Below Vercel's 4.5 MB body cap, checked here before a doomed upload. */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Ordered by preference. Opus in WebM is small and widely supported; mp4 is
 * what Safari will give us. The empty string is the browser's own default,
 * tried last so that a browser we have not anticipated still works.
 */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  '',
]

export function pickMimeType(
  isSupported?: (type: string) => boolean,
): string | null {
  // No probe available (older Safari): let the browser decide by passing
  // nothing, rather than naming a type it may reject outright.
  if (typeof isSupported !== 'function') return null
  for (const type of CANDIDATE_TYPES) {
    if (type === '') return null
    if (isSupported(type)) return type
  }
  return null
}

export function formatElapsed(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(clamped / 60)
  return `${minutes}:${String(clamped % 60).padStart(2, '0')}`
}

/** True when this browser can record at all. */
export function recordingSupported(nav?: {
  mediaDevices?: { getUserMedia?: unknown }
}): boolean {
  if (typeof MediaRecorder === 'undefined') return false
  return typeof nav?.mediaDevices?.getUserMedia === 'function'
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'error'

/** Microphone support does not change while the page is open. */
function subscribeToNothing(): () => void {
  return () => {}
}

export function VoiceDebrief({
  meetingId,
  onTranscript,
}: {
  meetingId: string
  /** Receives the words. What happens to them is the form's business. */
  onTranscript: (text: string) => void
}) {
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [elapsed, setElapsed] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * Whether this browser can record, read as an environment capability rather
   * than assigned into state from an effect.
   *
   * The server has no MediaRecorder, so the server snapshot is false and the
   * control appears once the client knows better. Setting this in an effect
   * instead triggers a cascading render on every mount, for a value that
   * cannot change while the page is open.
   */
  const supported = React.useSyncExternalStore(
    subscribeToNothing,
    () => recordingSupported(typeof navigator === 'undefined' ? undefined : navigator),
    () => false,
  )

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const discardedRef = React.useRef(false)
  const startButtonRef = React.useRef<HTMLButtonElement | null>(null)

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

  /**
   * Leaving mid-recording loses the recording, so the browser asks first. Only
   * armed while actually recording -- an unconditional prompt on a form page is
   * the intrusive version of this.
   */
  React.useEffect(() => {
    if (phase !== 'recording') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  async function send(blob: Blob, seconds: number) {
    if (blob.size > MAX_BYTES) {
      setPhase('error')
      setError('That recording is too large to process. Please record a shorter debrief.')
      return
    }
    if (blob.size < 1_000) {
      setPhase('error')
      setError("That recording was empty. Try again, or type your debrief.")
      return
    }

    setPhase('transcribing')
    setError(null)

    const body = new FormData()
    body.set('audio', blob)
    body.set('meetingId', meetingId)
    body.set('durationSeconds', String(seconds))

    try {
      const response = await fetch('/api/debrief/transcribe', { method: 'POST', body })
      const payload = (await response.json().catch(() => null)) as {
        text?: string
        error?: string
      } | null

      if (!response.ok || !payload?.text) {
        setPhase('error')
        setError(
          payload?.error ?? "We couldn't transcribe that recording. You can try again or type your debrief.",
        )
        return
      }

      onTranscript(payload.text)
      setPhase('idle')
      setElapsed(0)
      // Back to the control that started this, so a keyboard user is not
      // dropped at the top of the document.
      startButtonRef.current?.focus()
    } catch {
      setPhase('error')
      setError("We couldn't reach the transcription service. You can try again or type your debrief.")
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
          ? "Microphone access wasn't allowed. You can still type your debrief."
          : "We couldn't start recording. You can still type your debrief.",
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
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      cleanup()
      setPhase('error')
      setError("We couldn't start recording on this browser. You can still type your debrief.")
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
      void send(blob, seconds)
    }

    recorder.start()
    setPhase('recording')
    setElapsed(0)
    elapsedRef.current = 0
    void recordVoiceEvent('voice_debrief_started')

    tickRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      // Hard stop rather than a plea to wrap up: past three minutes the upload
      // would be refused anyway.
      if (elapsedRef.current >= MAX_SECONDS) stop()
    }, 1000)
  }

  // Kept in a ref as well as state: the interval and the onstop handler both
  // read it, and neither sees a re-rendered closure.
  const elapsedRef = React.useRef(0)

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  function discard() {
    discardedRef.current = true
    void recordVoiceEvent('voice_debrief_cancelled', elapsedRef.current)
    stop()
    setPhase('idle')
    setElapsed(0)
  }

  if (!supported) {
    // Not an error state. This browser simply types.
    return null
  }

  return (
    <div className="border-line bg-bg-sunken mb-3 rounded-[var(--radius-md)] border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {phase === 'recording' ? (
          <>
            <span
              className="text-critical flex items-center gap-2 text-sm font-medium"
              // Shape and words, not colour alone.
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
              {/* 44px, matching the rating buttons in this same form. The
                  small variant is 32px, which is a hard tap on a phone -- and
                  Stop is the one control nobody should have to aim at. */}
              <Button type="button" size="sm" className="min-h-11" onClick={stop}>
                <Square className="size-3.5" aria-hidden="true" />
                Stop
              </Button>
              <Button type="button" size="sm" variant="quiet" className="min-h-11" onClick={discard}>
                <X className="size-3.5" aria-hidden="true" />
                Discard
              </Button>
            </span>
          </>
        ) : phase === 'transcribing' ? (
          <span className="text-ink-secondary flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Transcribing…
          </span>
        ) : (
          <>
            <Button
              ref={startButtonRef}
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11"
              onClick={start}
            >
              <Mic className="size-3.5" aria-hidden="true" />
              Record voice
            </Button>
            <span className="text-ink-muted text-xs">or type what happened below</span>
          </>
        )}
      </div>

      {/* One live region for the whole control, so a screen reader hears the
          state change rather than the buttons re-ordering. */}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === 'recording'
          ? `Recording, ${formatElapsed(elapsed)} elapsed of three minutes maximum.`
          : phase === 'transcribing'
            ? 'Transcribing your recording.'
            : ''}
      </p>

      {/* Shown in every phase, including while recording.

          It used to disappear the moment recording started -- the reassurance
          vanished at exactly the moment the user was most exposed, with a live
          microphone open. It was also `text-ink-faint`, the faintest tone in
          the system at the smallest size, for the single most important
          sentence in the feature.

          `text-ink-muted` now: legible, still quiet. Not a banner, not a
          warning colour, no icon. The claim is calm because it is simply
          true. */}
      <p className="text-ink-muted mt-2 text-xs leading-relaxed">
        {phase === 'recording'
          ? 'Audio is used to create the transcript and is not retained.'
          : 'Record your own debrief after the conversation. Audio is used to create the transcript and is not retained.'}
      </p>

      {error ? (
        <p
          role="alert"
          className="text-critical mt-2 flex items-start gap-1.5 text-xs leading-relaxed"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
