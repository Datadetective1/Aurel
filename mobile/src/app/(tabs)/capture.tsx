import * as React from 'react'
import { Alert, AppState, Linking, Pressable, Switch, TextInput, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import * as Haptics from 'expo-haptics'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import type { AccountResponse, CaptureRequest, CaptureResponse } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError, directTranscriber, segmentedDeps, useApi } from '~/lib/api'
import { discardRemote, storageTranscriber } from '~/lib/segmented'
import { config } from '~/lib/config'
import { deviceName, microphoneSettings, microphoneTakenBy } from '~/lib/device'
import {
  canStart,
  composeCaptureText,
  elapsed,
  MAX_RECORDING_SECONDS,
  nextTarget,
  PART_SECONDS,
  startPart,
  VOICE_RECORDING,
  type CaptureMode,
  type CaptureTarget,
} from '~/lib/capture'
import {
  closePart,
  forget,
  newPending,
  recordedSeconds,
  recover,
  transcribeParts,
  transcriptOf,
  type PartTranscriber,
  type PendingCapture,
} from '~/lib/pending-capture'
import { pendingStore, previewPartUri } from '~/lib/pending-store'
import { setRecordingState } from '~/lib/recording-state'
import { formatTime } from '~/lib/format'
import { Button } from '~/components/button'
import { Card, Screen, Section } from '~/components/screen'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/**
 * CAPTURE
 * =============================================================================
 * One tap to record; pause, resume, stop; the elapsed time and a red state
 * that cannot be missed; a mark for the moment that mattered. Then the words
 * go to the same transcription and reading the web uses, and the user reviews
 * what came out before any of it becomes memory.
 *
 * Privacy is the design, not a setting:
 *   - recording happens only in the foreground, visibly; leaving the app
 *     pauses it, and so does iOS taking the microphone for a call (background
 *     recording is off in app.json)
 *   - recording other people requires the user to confirm they know
 *   - audio never stays on Atturel's servers: each part is transcribed and
 *     dropped there. It stays on this phone only until the conversation has
 *     been kept, then it is deleted
 *
 * And a recording is never lost quietly (lib/pending-capture): every pause
 * and every ten minutes closes a complete file; parts are turned into words
 * while the conversation carries on; a failure keeps the audio to try again;
 * reopening the app offers back anything unsent.
 *
 * Typed notes are always an alternative to recording.
 * =============================================================================
 */

type Phase = 'ready' | 'recording' | 'paused' | 'stopped' | 'sending'

const INTERRUPTED = `Paused — the ${deviceName} needed the microphone (${microphoneTakenBy}). What was recorded is kept. Resume when you are ready.`

function captureId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export default function Capture() {
  const { c } = useTheme()
  const params = useLocalSearchParams<{ meetingId?: string; personId?: string }>()
  const recorder = useAudioRecorder(VOICE_RECORDING)
  const native = useAudioRecorderState(recorder, 500)
  const store = React.useMemo(() => pendingStore(), [])

  const [mode, setMode] = React.useState<CaptureMode>(params.meetingId ? 'meeting_recording' : 'voice_note')
  const [othersKnow, setOthersKnow] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>('ready')
  const [note, setNote] = React.useState('')
  const [typed, setTyped] = React.useState('')
  const [typing, setTyping] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // The technical reason behind an error, shown small for a tester to pass on.
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null)
  // The last send failed: the main button offers to try again.
  const [sendFailed, setSendFailed] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  // Microphone access was refused: the error offers the way to Settings.
  const [micDenied, setMicDenied] = React.useState(false)

  // Who or what this capture is for: read from the route on each visit, kept
  // while a recording or typed note is under way, cleared on leaving.
  const [target, setTarget] = React.useState<CaptureTarget>({
    meetingId: params.meetingId || null,
    personId: params.personId || null,
  })
  const engagedRef = React.useRef(false)
  // Re-render when the pending record changes; the record itself lives in a ref.
  const [, setVersion] = React.useState(0)
  const bump = () => setVersion((v) => v + 1)

  const pendingRef = React.useRef<PendingCapture | null>(null)
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const busyRef = React.useRef(false)
  const lastTransitionRef = React.useRef(0)

  // A recording or a typed note under way keeps what it was started for.
  engagedRef.current = phase !== 'ready' || typing || Boolean(pendingRef.current)
  const targetRef = React.useRef(target)
  targetRef.current = target
  useFocusEffect(
    React.useCallback(() => {
      const current = targetRef.current
      const next = nextTarget(current, { meetingId: params.meetingId, personId: params.personId }, engagedRef.current)
      if (next.meetingId !== current.meetingId || next.personId !== current.personId) {
        setTarget(next)
        setMode(next.meetingId ? 'meeting_recording' : 'voice_note')
      }
    }, [params.meetingId, params.personId]),
  )
  // Leaving clears what was passed in, so the tab bar later opens Capture clean.
  const navigation = useNavigation()
  React.useEffect(
    () =>
      navigation.addListener('blur', () => {
        if (!engagedRef.current) router.setParams({ meetingId: undefined, personId: undefined })
      }),
    [navigation],
  )
  const [recheck, setRecheck] = React.useState(0)

  // Preview data never touches the microphone: the clock is simulated.
  const [fakeSeconds, setFakeSeconds] = React.useState(0)
  React.useEffect(() => {
    if (!config.previewData || phase !== 'recording') return
    const t = setInterval(() => setFakeSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  // What the server will accept. Until it answers, the single-upload limit.
  const account = useApi<AccountResponse>('/api/mobile/account')
  const limits = account.data?.capture
  const lengthLimit = limits?.maxSeconds ?? MAX_RECORDING_SECONDS
  // The month's transcription allowance, when there is one: a recording that
  // would not fit stops at what is left, rather than failing once it is sent.
  const remaining = limits?.remainingSeconds ?? null
  const maxSeconds = remaining === null ? lengthLimit : Math.min(lengthLimit, remaining)
  const allowanceBound = remaining !== null && remaining < lengthLimit
  const partSeconds = Math.min(limits?.segmentSeconds ?? PART_SECONDS, PART_SECONDS)
  const transport = limits?.partTransport ?? (limits?.segmentSeconds ? 'storage' : 'direct')

  const transcriber = React.useCallback((): PartTranscriber => {
    const personIds = pendingRef.current?.personId ? [pendingRef.current.personId] : []
    return transport === 'storage' && !config.previewData ? storageTranscriber(segmentedDeps()) : directTranscriber(personIds)
  }, [transport])

  // --- an unsent recording from before -----------------------------------------
  React.useEffect(() => {
    const found = recover(store)
    const missing =
      found.kind !== 'none' && found.missingParts > 0
        ? ` ${found.missingParts === 1 ? 'One part' : `${found.missingParts} parts`} could not be found on this phone and ${found.missingParts === 1 ? 'is' : 'are'} not included.`
        : ''
    if (found.kind === 'unsent') {
      pendingRef.current = found.pending
      setMode(found.pending.mode)
      setTyped(found.pending.note)
      setPhase('stopped')
      setNotice(
        `This recording from ${formatTime(found.pending.createdAt, Intl.DateTimeFormat().resolvedOptions().timeZone)} has not been sent yet. Send it, or discard it.` +
          (found.lostCurrentPart ? ' The app closed while it was recording, so the last part — since the most recent pause — could not be saved.' : '') +
          missing,
      )
      bump()
    } else if (found.kind === 'lost') {
      setNotice(
        found.lostCurrentPart && found.missingParts === 0
          ? 'The app closed while recording, before any part of it could be saved. Nothing was sent.'
          : `An unsent recording could not be found on this phone, so it cannot be sent.${found.lostCurrentPart ? ' The app closed while it was recording.' : ''} Nothing was sent.`,
      )
    }
  }, [store])

  // The part being recorded, read from the recorder itself, so the clock does
  // not jump when one part closes and the next begins.
  const pending = pendingRef.current
  const currentSeconds = config.previewData
    ? fakeSeconds
    : phase === 'recording' && pending?.current && native.url === pending.current
      ? native.durationMillis / 1000
      : 0
  const seconds = recordedSeconds(pending) + (phase === 'recording' ? currentSeconds : 0)

  /** Turn finished parts into words while the conversation carries on. */
  const process = React.useCallback(() => {
    const p = pendingRef.current
    if (!p) return queueRef.current
    queueRef.current = queueRef.current
      .catch(() => {})
      .then(() => transcribeParts(p, transcriber(), store))
      .then(bump)
    return queueRef.current
  }, [store, transcriber])

  const beginPart = React.useCallback(async () => {
    const p = pendingRef.current
    if (!p) return
    lastTransitionRef.current = Date.now()
    if (config.previewData) {
      setFakeSeconds(0)
      p.current = previewPartUri()
      store.save(p)
      return
    }
    p.current = await startPart(
      recorder,
      p.parts.map((part) => part.uri),
      (uri) => store.removeAudio(uri),
    )
    store.save(p)
  }, [recorder, store])

  const endPart = React.useCallback(async () => {
    const p = pendingRef.current
    if (!p || !p.current) return
    lastTransitionRef.current = Date.now()
    if (config.previewData) {
      closePart(p, { uri: p.current, seconds: fakeSeconds }, store)
      setFakeSeconds(0)
    } else {
      const length = recorder.getStatus().durationMillis / 1000
      const uri = p.current
      await recorder.stop()
      closePart(p, { uri, seconds: length }, store)
    }
    bump()
    void process()
  }, [recorder, store, fakeSeconds, process])

  const pause = React.useCallback(
    async (reason?: string) => {
      if (phase !== 'recording' || busyRef.current) return
      busyRef.current = true
      try {
        await endPart()
      } catch {
        setError('The recording could not be paused cleanly. What was recorded before is kept.')
      } finally {
        busyRef.current = false
      }
      setPhase('paused')
      if (reason) setNotice(reason)
    },
    [phase, endPart],
  )

  const stop = React.useCallback(
    async (reason?: string) => {
      if ((phase !== 'recording' && phase !== 'paused') || busyRef.current) return
      busyRef.current = true
      try {
        if (phase === 'recording') await endPart()
      } catch {
        setError('The last part could not be closed cleanly. Everything before it is kept.')
      } finally {
        busyRef.current = false
      }
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {})
      const p = pendingRef.current
      if (p && p.parts.length === 0) {
        // Too short to hold anything: nothing to send, nothing to keep.
        forget(p, store)
        pendingRef.current = null
        setPhase('ready')
        setNotice('That was too short to keep. Nothing was recorded.')
        return
      }
      setPhase('stopped')
      if (reason) setNotice(reason)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    },
    [phase, endPart, store],
  )

  // Every ten minutes: close this part, start the next. The new part begins
  // straight away; the finished one is turned into words meanwhile.
  React.useEffect(() => {
    if (phase !== 'recording' || busyRef.current) return
    if (currentSeconds < partSeconds) return
    busyRef.current = true
    void (async () => {
      try {
        await endPart()
        await beginPart()
      } catch {
        setError('The recording could not continue. What was recorded so far is kept — stop and send it.')
        setPhase('paused')
      } finally {
        busyRef.current = false
      }
    })()
  }, [currentSeconds, phase, partSeconds, endPart, beginPart])

  React.useEffect(() => {
    setRecordingState(phase === 'recording' ? 'recording' : phase === 'paused' ? 'paused' : 'idle')
  }, [phase])

  // The screen stays awake while a recording is open, so auto-lock does not
  // pause a long meeting. Leaving the app still does.
  React.useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return
    void activateKeepAwakeAsync('capture').catch(() => {})
    return () => {
      void deactivateKeepAwake('capture').catch(() => {})
    }
  }, [phase])

  // Leaving the app pauses the recording, closing the part so it survives even
  // if iOS later ends the app in the background. Nothing records out of sight.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') void pause('Paused when you left the app. What was recorded is kept. Resume when you are back.')
    })
    return () => sub.remove()
  }, [pause])

  // iOS pauses the recorder itself for a call or Siri, and may resume it on
  // its own afterwards. The screen must never say "Recording" while it is not,
  // nor keep a recording going the person did not resume: an interruption
  // closes the part, and only Resume starts the next one.
  React.useEffect(() => {
    if (config.previewData || phase !== 'recording' || busyRef.current) return
    const settling = 1500 - (Date.now() - lastTransitionRef.current)
    if (settling > 0) {
      // A part just began; look again once the recorder has had time to report.
      const t = setTimeout(() => setRecheck((n) => n + 1), settling + 50)
      return () => clearTimeout(t)
    }
    if (native.mediaServicesDidReset) {
      void pause('iPhone restarted its audio. Everything up to the last pause is kept; the moments just before this may be missing.')
      return
    }
    if (!native.isRecording) void pause(INTERRUPTED)
  }, [native.isRecording, native.mediaServicesDidReset, phase, pause, recheck])

  // The length limit, said before it bites.
  React.useEffect(() => {
    if (phase !== 'recording') return
    if (seconds >= maxSeconds) {
      void stop(
        allowanceBound
          ? "Stopped: that's the rest of this month's transcription minutes. You can add typed notes before sending."
          : `Stopped at ${Math.round(maxSeconds / 60)} minutes, the longest one recording can be.`,
      )
    } else if (seconds >= maxSeconds - 120 && !notice) {
      setNotice(
        allowanceBound
          ? 'Two minutes of transcription left this month.'
          : 'Two minutes left before this recording stops itself.',
      )
    }
  }, [seconds, phase, stop, notice, maxSeconds, allowanceBound])

  const start = async () => {
    setError(null)
    setNotice(null)
    if (!canStart(mode, othersKnow)) {
      setError('Confirm the people in the conversation know it is being recorded.')
      return
    }
    if (remaining !== null && remaining < 60) {
      setError("You've used this month's transcription minutes. You can still type what happened; minutes reset on the 1st.")
      return
    }
    if (!config.previewData) {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        setError(`Microphone access is off. Turn it on in ${microphoneSettings}, or type notes instead.`)
        setMicDenied(true)
        return
      }
      setMicDenied(false)
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false })
    }
    pendingRef.current = newPending({
      id: captureId(),
      now: new Date(),
      mode,
      meetingId: target.meetingId,
      personId: target.personId,
      consent: mode === 'meeting_recording' ? othersKnow : false,
    })
    store.save(pendingRef.current)
    queueRef.current = Promise.resolve()
    try {
      await beginPart()
    } catch {
      forget(pendingRef.current, store)
      pendingRef.current = null
      setError('The microphone could not start. Try again, or type notes instead.')
      return
    }
    setPhase('recording')
    bump()
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }

  const resume = async () => {
    setNotice(null)
    setError(null)
    try {
      if (!config.previewData) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false })
      await beginPart()
      setPhase('recording')
    } catch {
      setError('The microphone could not restart. What was recorded is kept — stop and send it.')
    }
  }

  const mark = () => {
    const p = pendingRef.current
    if (!p) return
    p.bookmarks.push({ atSeconds: seconds, note: note.trim() })
    store.save(p)
    setNote('')
    bump()
    void Haptics.selectionAsync().catch(() => {})
  }

  const discard = () => {
    Alert.alert('Discard this recording?', 'It has not been sent. Once discarded it cannot be recovered.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          const p = pendingRef.current
          if (transport === 'storage' && !config.previewData) void discardRemote(segmentedDeps(), p)
          forget(p, store)
          pendingRef.current = null
          setPhase('ready')
          setTyped('')
          setFakeSeconds(0)
          setNotice(null)
          setError(null)
          setErrorDetail(null)
          setSendFailed(false)
        },
      },
    ])
  }

  const send = async (fromTyping: boolean) => {
    setPhase('sending')
    setError(null)
    setErrorDetail(null)
    setSendFailed(false)
    setNotice(null)
    const p = pendingRef.current
    try {
      let text = typed
      if (!fromTyping && p) {
        p.note = typed
        store.save(p)
        setStatus('Turning the recording into words…')
        await queueRef.current.catch(() => {})
        const words = await transcribeParts(p, transcriber(), store)
        bump()
        if (!words.ok) {
          setStatus(null)
          setPhase('stopped')
          // The failure says what went wrong; that the audio is kept is said
          // here, once -- unless the audio is what is missing.
          setError(
            words.missing
              ? `${words.error} It cannot be sent as it is — discard it, or type what happened instead.`
              : `${words.error} The recording is safe on this phone — try again, or discard it.`,
          )
          setErrorDetail(words.detail ?? null)
          setSendFailed(true)
          return
        }
        text = composeCaptureText(transcriptOf(p), p.bookmarks, typed)
      }
      setStatus('Reading it for what was promised and decided…')
      // A recording carries the meeting and person it was started from, even
      // when it is sent later (after a failure, or from a reopened app).
      const meetingId = fromTyping ? target.meetingId : p?.meetingId
      const personId = fromTyping ? target.personId : p?.personId
      const body: CaptureRequest = {
        text,
        sourceKind: fromTyping ? 'typed_notes' : (p?.mode ?? mode),
        meetingId: meetingId ?? undefined,
        participantIds: personId ? [personId] : undefined,
        durationSeconds: fromTyping ? undefined : Math.round(recordedSeconds(p)),
        consent: !fromTyping && p?.mode === 'meeting_recording' ? p.consent : undefined,
      }
      const result = await api.post<CaptureResponse>('/api/mobile/conversations', body)
      // Kept on the server: only now is the audio on the phone deleted.
      if (!fromTyping) forget(p, store)
      pendingRef.current = null
      setStatus(null)
      setPhase('ready')
      setTyped('')
      setTyping(false)
      router.push({ pathname: '/review/[id]', params: { id: result.interactionId } })
    } catch (e) {
      setStatus(null)
      setPhase(fromTyping ? 'ready' : 'stopped')
      const kept = fromTyping ? '' : ' The recording and its words are safe on this phone.'
      setSendFailed(!fromTyping)
      setError(
        (e instanceof ApiError && e.failure.kind === 'offline'
          ? 'Atturel could not be reached. Check the connection, then try again.'
          : e instanceof ApiError && e.failure.kind === 'server'
            ? e.failure.message
            : 'That could not be sent. Try again.') + kept,
      )
    }
  }

  const live = phase === 'recording' || phase === 'paused'
  const marks = pending?.bookmarks.length ?? 0
  const partsDone = pending?.parts.filter((x) => x.text !== null).length ?? 0
  const partsTotal = pending?.parts.length ?? 0

  return (
    <Screen>
      <T variant="display" accessibilityRole="header">Capture</T>
      <T variant="small" tone="secondary" style={{ marginTop: 6 }}>
        Record or type what happened. You review what {phase === 'ready' ? 'comes' : 'came'} out of it before anything is remembered.
      </T>

      {/* --- the unmissable state ----------------------------------------------- */}
      {live ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityLabel={phase === 'recording' ? `Recording, ${elapsed(seconds)}` : `Recording paused at ${elapsed(seconds)}`}
          style={{
            marginTop: 20,
            borderRadius: 18,
            padding: 20,
            backgroundColor: phase === 'recording' ? c.criticalWash : c.bgSunken,
            borderWidth: 1,
            borderColor: phase === 'recording' ? c.critical : c.line,
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: phase === 'recording' ? c.critical : c.inkMuted }} />
            <T variant="label" tone={phase === 'recording' ? 'critical' : 'muted'}>{phase === 'recording' ? 'Recording' : 'Paused'}</T>
          </View>
          <T style={{ fontFamily: fonts.display, fontSize: 56, lineHeight: 64, color: c.ink, fontVariant: ['tabular-nums'], marginTop: 6 }} maxFontSizeMultiplier={1.2}>
            {elapsed(seconds)}
          </T>
          {marks > 0 ? <T variant="meta" tone="muted">{marks === 1 ? '1 moment marked' : `${marks} moments marked`}</T> : null}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
            <RoundButton
              icon={phase === 'recording' ? 'pause' : 'play'}
              label={phase === 'recording' ? 'Pause' : 'Resume'}
              onPress={() => void (phase === 'recording' ? pause() : resume())}
            />
            <RoundButton icon="square" label="Stop" onPress={() => void stop()} primary />
            <RoundButton icon="bookmark" label="Mark" onPress={mark} />
          </View>

          <TextInput
            accessibilityLabel="Note for the next mark"
            placeholder="Optional note, then Mark"
            placeholderTextColor={c.inkMuted}
            value={note}
            onChangeText={setNote}
            onSubmitEditing={mark}
            returnKeyType="done"
            style={{ marginTop: 16, alignSelf: 'stretch', minHeight: TOUCH, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 12, color: c.ink, backgroundColor: c.surface, fontFamily: fonts.sans, fontSize: 15 }}
          />
        </View>
      ) : null}

      {notice ? (
        <View style={{ marginTop: 12 }}>
          <Card tone="caution"><T variant="small" tone="secondary">{notice}</T></Card>
        </View>
      ) : null}

      {/* --- before: who is being recorded -------------------------------------- */}
      {phase === 'ready' && !typing ? (
        <>
          <Section label="What are you capturing?">
            <View style={{ gap: 10 }}>
              <Choice
                icon="mic"
                title="A voice note"
                body="Just you, saying what happened."
                selected={mode === 'voice_note'}
                onPress={() => setMode('voice_note')}
              />
              <Choice
                icon="users"
                title="A conversation with others"
                body="Record the room while it happens."
                selected={mode === 'meeting_recording'}
                onPress={() => setMode('meeting_recording')}
              />
            </View>
            {mode === 'meeting_recording' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, minHeight: TOUCH }}>
                <Switch
                  value={othersKnow}
                  onValueChange={setOthersKnow}
                  accessibilityLabel="Everyone in this conversation knows it is being recorded"
                  trackColor={{ true: c.surfaceInverse, false: c.lineStrong }}
                />
                <T variant="small" style={{ flex: 1 }}>Everyone in this conversation knows it is being recorded.</T>
              </View>
            ) : null}
          </Section>

          <View style={{ marginTop: 24, gap: 10 }}>
            <Button label="Start recording" icon="mic" size="lg" onPress={() => void start()} disabled={!canStart(mode, othersKnow)} />
            <Button label="Type notes instead" icon="edit-3" variant="secondary" onPress={() => setTyping(true)} />
          </View>
          <T variant="meta" tone="muted" style={{ marginTop: 12 }}>
            {transport === 'storage'
              ? 'To turn it into words, the audio is sent through Atturel to a speech-to-text service, held briefly in private storage while that happens, then deleted. '
              : 'To turn it into words, the audio is sent through Atturel to a speech-to-text service; Atturel does not keep it. '}
            The copy on this {deviceName} is deleted once the conversation is kept. Recording pauses if you leave the app.
          </T>
        </>
      ) : null}

      {/* --- typed notes ----------------------------------------------------------- */}
      {typing && phase === 'ready' ? (
        <Section label="What happened">
          <TextInput
            accessibilityLabel="What happened"
            multiline
            placeholder="Who said what, what was promised, what was decided…"
            placeholderTextColor={c.inkMuted}
            value={typed}
            onChangeText={setTyped}
            textAlignVertical="top"
            style={{ minHeight: 180, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, padding: 14, color: c.ink, backgroundColor: c.surface, fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 }}
          />
          <View style={{ marginTop: 14, gap: 10 }}>
            <Button label="Keep this" icon="check" size="lg" onPress={() => void send(true)} disabled={typed.trim().length < 10} />
            <Button label="Record instead" variant="ghost" onPress={() => setTyping(false)} />
          </View>
        </Section>
      ) : null}

      {/* --- after: send it ---------------------------------------------------------- */}
      {phase === 'stopped' || phase === 'sending' ? (
        <Section label="Recorded">
          <Card>
            <T variant="title">{elapsed(recordedSeconds(pending))}</T>
            <T variant="meta" tone="muted" style={{ marginTop: 2 }}>
              {[
                marks ? `${marks} marked moment${marks === 1 ? '' : 's'}` : 'No moments marked',
                partsTotal > 1 ? `${partsDone} of ${partsTotal} parts turned into words` : partsDone === 1 ? 'Turned into words' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
            <TextInput
              accessibilityLabel="Anything to add"
              multiline
              placeholder="Anything to add? (optional)"
              placeholderTextColor={c.inkMuted}
              value={typed}
              onChangeText={setTyped}
              textAlignVertical="top"
              style={{ marginTop: 12, minHeight: 72, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, color: c.ink, fontFamily: fonts.sans, fontSize: 15 }}
            />
          </Card>
          <View style={{ marginTop: 14, gap: 10 }}>
            <Button
              label={sendFailed && phase === 'stopped' ? 'Try again' : 'Understand it'}
              icon={sendFailed && phase === 'stopped' ? 'refresh-cw' : 'arrow-right'}
              size="lg"
              busy={phase === 'sending'}
              onPress={() => void send(false)}
            />
            {phase === 'stopped' ? <Button label="Discard recording" variant="ghost" onPress={discard} /> : null}
          </View>
          {status ? <T variant="small" tone="secondary" style={{ marginTop: 12 }} accessibilityLiveRegion="polite">{status}</T> : null}
        </Section>
      ) : null}

      {error ? (
        <T variant="small" tone="critical" style={{ marginTop: 14 }} accessibilityRole="alert">{error}</T>
      ) : null}
      {error && micDenied ? (
        <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
          <Button label="Open Settings" icon="settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      {error && errorDetail ? (
        <T variant="meta" tone="muted" style={{ marginTop: 6 }} selectable>
          {errorDetail}
        </T>
      ) : null}
    </Screen>
  )
}

function RoundButton({ icon, label, onPress, primary }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; primary?: boolean }) {
  const { c } = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: primary ? c.surfaceInverse : c.surface, borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={22} color={primary ? c.inkInverse : c.ink} />
      </View>
      <T variant="meta" tone="secondary">{label}</T>
    </Pressable>
  )
}

function Choice({ icon, title, body, selected, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; body: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? c.ink : c.line, backgroundColor: c.surface, minHeight: 64 }}
    >
      <Feather name={icon} size={20} color={selected ? c.ink : c.inkMuted} />
      <View style={{ flex: 1 }}>
        <T variant="body" style={{ fontFamily: 'InstrumentSans_500Medium' }}>{title}</T>
        <T variant="meta" tone="muted">{body}</T>
      </View>
      <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? c.ink : c.lineStrong} />
    </Pressable>
  )
}
