import * as React from 'react'
import { AppState, Pressable, Switch, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import * as Haptics from 'expo-haptics'
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import type { CaptureRequest, CaptureResponse } from '@atturel/web/lib/mobile/contracts'
import { api, ApiError } from '~/lib/api'
import { config } from '~/lib/config'
import {
  canStart,
  composeCaptureText,
  elapsed,
  MAX_RECORDING_SECONDS,
  VOICE_RECORDING,
  WARN_RECORDING_SECONDS,
  type Bookmark,
  type CaptureMode,
} from '~/lib/capture'
import { Button } from '~/components/button'
import { Card, Screen, Section } from '~/components/screen'
import { T } from '~/components/text'
import { fonts, TOUCH, useTheme } from '~/theme'

/**
 * CAPTURE
 * =============================================================================
 * One tap to record; pause, resume, stop; the elapsed time and a red state
 * that cannot be missed; a mark for the moment that mattered. Then the words
 * go to the same transcription and reading the web uses, and the user reviews
 * what came out before any of it becomes memory.
 *
 * Privacy is the design, not a setting:
 *   - recording happens only on this screen, in the foreground, visibly;
 *     leaving the app pauses it (background recording is off in app.json)
 *   - recording other people requires the user to confirm they know
 *   - audio is never stored by Atturel: it is uploaded, transcribed, dropped
 *
 * Typed notes are always an alternative to recording.
 * =============================================================================
 */

type Phase = 'ready' | 'recording' | 'paused' | 'stopped' | 'sending'

export default function Capture() {
  const { c } = useTheme()
  const params = useLocalSearchParams<{ meetingId?: string; personId?: string }>()
  const recorder = useAudioRecorder(VOICE_RECORDING)
  const native = useAudioRecorderState(recorder, 500)

  const [mode, setMode] = React.useState<CaptureMode>(params.meetingId ? 'meeting_recording' : 'voice_note')
  const [othersKnow, setOthersKnow] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>('ready')
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([])
  const [note, setNote] = React.useState('')
  const [typed, setTyped] = React.useState('')
  const [typing, setTyping] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)

  // Preview data never touches the microphone: the clock is simulated.
  const [fakeSeconds, setFakeSeconds] = React.useState(0)
  React.useEffect(() => {
    if (!config.previewData || phase !== 'recording') return
    const t = setInterval(() => setFakeSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  const seconds = config.previewData ? fakeSeconds : native.durationMillis / 1000

  const pause = React.useCallback(
    (reason?: string) => {
      if (phase !== 'recording') return
      if (!config.previewData) recorder.pause()
      setPhase('paused')
      if (reason) setNotice(reason)
    },
    [phase, recorder],
  )

  const stop = React.useCallback(
    async (reason?: string) => {
      if (phase !== 'recording' && phase !== 'paused') return
      if (!config.previewData) await recorder.stop()
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {})
      setPhase('stopped')
      if (reason) setNotice(reason)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    },
    [phase, recorder],
  )

  // Leaving the app pauses the recording. Nothing records out of sight.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') pause('Paused when you left the app. Resume when you are back.')
    })
    return () => sub.remove()
  }, [pause])

  // The length limit, said before it bites.
  React.useEffect(() => {
    if (phase !== 'recording') return
    if (seconds >= MAX_RECORDING_SECONDS) {
      void stop('Stopped at 17 minutes, the longest recording the app can send today. Longer conversations can be uploaded on the web.')
    } else if (seconds >= WARN_RECORDING_SECONDS && !notice) {
      setNotice('Two minutes left before this recording stops itself.')
    }
  }, [seconds, phase, stop, notice])

  const start = async () => {
    setError(null)
    setNotice(null)
    if (!canStart(mode, othersKnow)) {
      setError('Confirm the people in the conversation know it is being recorded.')
      return
    }
    if (!config.previewData) {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        setError('Microphone access is off. Turn it on in Settings, or type notes instead.')
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false })
      await recorder.prepareToRecordAsync()
      recorder.record()
    } else {
      setFakeSeconds(0)
    }
    setBookmarks([])
    setPhase('recording')
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }

  const resume = () => {
    if (!config.previewData) recorder.record()
    setNotice(null)
    setPhase('recording')
  }

  const mark = () => {
    setBookmarks((b) => [...b, { atSeconds: seconds, note: note.trim() }])
    setNote('')
    void Haptics.selectionAsync().catch(() => {})
  }

  const discard = () => {
    setPhase('ready')
    setBookmarks([])
    setFakeSeconds(0)
    setNotice(null)
  }

  const send = async (fromTyping: boolean) => {
    setPhase('sending')
    setError(null)
    try {
      let text = typed
      if (!fromTyping) {
        setStatus('Turning the recording into words…')
        const uri = recorder.uri ?? 'preview.m4a'
        const transcript = await api.transcribe(uri, seconds, params.personId ? [params.personId] : [])
        text = composeCaptureText(transcript, bookmarks, typed)
      }
      setStatus('Reading it for what was promised and decided…')
      const body: CaptureRequest = {
        text,
        sourceKind: fromTyping ? 'typed_notes' : mode,
        meetingId: params.meetingId,
        participantIds: params.personId ? [params.personId] : undefined,
        durationSeconds: fromTyping ? undefined : Math.round(seconds),
        consent: !fromTyping && mode === 'meeting_recording' ? othersKnow : undefined,
      }
      const result = await api.post<CaptureResponse>('/api/mobile/conversations', body)
      setStatus(null)
      setPhase('ready')
      setTyped('')
      setTyping(false)
      router.push({ pathname: '/review/[id]', params: { id: result.interactionId } })
    } catch (e) {
      setStatus(null)
      setPhase(fromTyping ? 'ready' : 'stopped')
      setError(
        e instanceof ApiError && e.failure.kind === 'offline'
          ? 'You are offline. The recording is still here — send it when you reconnect.'
          : e instanceof ApiError && e.failure.kind === 'server'
            ? e.failure.message
            : 'That could not be sent. Try again.',
      )
    }
  }

  const live = phase === 'recording' || phase === 'paused'

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
          {bookmarks.length > 0 ? <T variant="meta" tone="muted">{bookmarks.length === 1 ? '1 moment marked' : `${bookmarks.length} moments marked`}</T> : null}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
            <RoundButton
              icon={phase === 'recording' ? 'pause' : 'play'}
              label={phase === 'recording' ? 'Pause' : 'Resume'}
              onPress={() => (phase === 'recording' ? pause() : resume())}
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
            Audio is sent once to be turned into words and is not kept. Recording pauses if you leave the app.
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
            <T variant="title">{elapsed(seconds)}</T>
            <T variant="meta" tone="muted" style={{ marginTop: 2 }}>
              {bookmarks.length ? `${bookmarks.length} marked moment${bookmarks.length === 1 ? '' : 's'}` : 'No moments marked'}
            </T>
            <TextInput
              accessibilityLabel="Anything to add"
              multiline
              placeholder="Anything to add? (optional)"
              placeholderTextColor={c.inkMuted}
              value={typed}
              onChangeText={setTyped}
              style={{ marginTop: 12, minHeight: 72, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, color: c.ink, fontFamily: fonts.sans, fontSize: 15 }}
            />
          </Card>
          <View style={{ marginTop: 14, gap: 10 }}>
            <Button label="Understand it" icon="arrow-right" size="lg" busy={phase === 'sending'} onPress={() => void send(false)} />
            {phase === 'stopped' ? <Button label="Discard recording" variant="ghost" onPress={discard} /> : null}
          </View>
          {status ? <T variant="small" tone="secondary" style={{ marginTop: 12 }} accessibilityLiveRegion="polite">{status}</T> : null}
        </Section>
      ) : null}

      {error ? (
        <T variant="small" tone="critical" style={{ marginTop: 14 }} accessibilityRole="alert">{error}</T>
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
