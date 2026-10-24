import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio'

/**
 * CAPTURE, THE PARTS THAT ARE RULES
 * =============================================================================
 * Recording settings tuned for speech, and the limits that follow from them.
 *
 * Mono AAC at 32 kbps is about 240 KB a minute. A recording is kept as parts:
 * every pause, and every ten minutes, closes the file and starts a new one,
 * so each part is a complete recording on its own (lib/pending-capture). A
 * part is about 2.4 MB, inside the 4.5 MB request ceiling of the single
 * upload route, so parts can go one at a time to transcription. The total
 * length is what the server says (GET /api/mobile/account); an older server
 * says seventeen minutes.
 *
 * Files are written to the app's Documents directory, not the cache, so iOS
 * never clears one under storage pressure before it has been sent.
 * =============================================================================
 */

export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  directory: 'document',
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

/** The single-upload limit, used until the server says otherwise. */
export const MAX_RECORDING_SECONDS = 17 * 60

/** A part is closed at this length, whatever the server's total limit. */
export const PART_SECONDS = 10 * 60

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
