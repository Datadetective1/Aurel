import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio'

/**
 * CAPTURE, THE PARTS THAT ARE RULES
 * =============================================================================
 * Recording settings tuned for speech, and the limits that follow from them.
 *
 * The audio goes to the same transcription route as the web recorder, which
 * runs on a serverless platform with a request body limit of about 4.5 MB.
 * Mono AAC at 32 kbps is about 240 KB a minute, so a recording stops itself at
 * seventeen minutes with room to spare, and says why. Longer conversations
 * need a direct-to-storage upload, which is not built yet -- the app says so
 * rather than failing at the end of a long meeting.
 * =============================================================================
 */

export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
}

export const MAX_RECORDING_SECONDS = 17 * 60
export const WARN_RECORDING_SECONDS = 15 * 60

/** "4:07", "1:02:09". */
export function elapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export interface Bookmark {
  atSeconds: number
  note: string
}

/**
 * The words sent for reading: the transcript, then anything the user marked
 * or noted while it ran, labelled as theirs so the reading can tell a note
 * from something said aloud.
 */
export function composeCaptureText(transcript: string, bookmarks: Bookmark[], typedNote: string): string {
  const parts = [transcript.trim()]
  const marks = bookmarks
    .map((b) => `- ${elapsed(b.atSeconds)}${b.note.trim() ? ` — ${b.note.trim()}` : ' — marked as important'}`)
    .join('\n')
  if (marks) parts.push(`My notes during the conversation:\n${marks}`)
  if (typedNote.trim()) parts.push(`My note afterwards:\n${typedNote.trim()}`)
  return parts.filter(Boolean).join('\n\n')
}

export type CaptureMode = 'voice_note' | 'meeting_recording'

/**
 * A recording of other people needs the user to have told them. The app asks
 * and records that it asked; it cannot know, and it does not give legal advice.
 */
export function canStart(mode: CaptureMode, othersKnow: boolean): boolean {
  return mode === 'voice_note' || othersKnow
}
