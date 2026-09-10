/**
 * TRANSCRIPT HYGIENE
 * =============================================================================
 * Pure text helpers for what meeting tools export. No I/O, no model.
 *
 * A .vtt or .srt file is mostly timestamps and cue numbers; fed to the reader
 * as-is, half the token budget goes on "00:04:12.480 --> 00:04:15.200". The
 * speaker labels are the part worth keeping, because they are what lets a
 * first-person promise be attributed to the right person.
 * =============================================================================
 */

const VTT_HEADER = /^WEBVTT[^\n]*\n?/
const TIMESTAMP_LINE =
  /^\s*(?:\d+\s*$|\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}.*$)/
const INLINE_TIMESTAMP = /\[?\(?\b\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\b\)?\]?/g
const VTT_TAGS = /<\/?(?:v|c|b|i|u|ruby|rt|lang)[^>]*>/g

export type TranscriptFormat = 'vtt' | 'srt' | 'plain'

export function transcriptFormat(fileName: string): TranscriptFormat {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'vtt') return 'vtt'
  if (ext === 'srt') return 'srt'
  return 'plain'
}

/**
 * Turn a caption file into readable dialogue.
 *
 * Consecutive cues from the same speaker are joined so a sentence split across
 * three caption frames reads as one sentence. Speaker tags in the WebVTT
 * `<v Name>` form become "Name:" so the reader sees the same shape a pasted
 * meeting transcript has.
 */
export function cleanTranscript(raw: string, format: TranscriptFormat): string {
  let text = raw.replace(/\r\n?/g, '\n')
  if (format === 'plain') {
    return text
      .replace(INLINE_TIMESTAMP, (m) => (m.length >= 4 && /^\[|^\(/.test(m) ? '' : m))
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  }

  if (format === 'vtt') text = text.replace(VTT_HEADER, '')

  const lines: { speaker: string | null; text: string }[] = []
  let current: { speaker: string | null; text: string } | null = null

  for (const line of text.split('\n')) {
    if (TIMESTAMP_LINE.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line)) continue
    let body = line.trim()
    // A blank line separates cues, not speakers. The same person across two
    // cues is still one sentence.
    if (body === '') continue

    let speaker: string | null = null
    const voice = body.match(/^<v\s+([^>]+)>/)
    if (voice?.[1]) {
      speaker = voice[1].trim()
      body = body.replace(/^<v\s+[^>]+>/, '')
    }
    body = body.replace(VTT_TAGS, '').trim()

    const labelled = body.match(/^([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}):\s+(.+)$/)
    if (labelled?.[1] && labelled[2]) {
      speaker = labelled[1]
      body = labelled[2]
    }

    if (!body) continue

    if (current && current.speaker === speaker) {
      current.text = `${current.text} ${body}`
    } else {
      if (current) lines.push(current)
      current = { speaker, text: body }
    }
  }
  if (current) lines.push(current)

  return lines
    .map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** A usable title from a filename: "weekly_sync_2026-09-10.vtt" -> "Weekly sync 2026-09-10". */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!base) return 'Conversation'
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Roughly how long a transcript would take to say. Reading, not audio. */
export function estimatedMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 150))
}
