import { describe, expect, it } from 'vitest'
import { cleanTranscript, titleFromFileName, transcriptFormat } from './transcript'

describe('cleanTranscript', () => {
  it('turns a WebVTT file into labelled dialogue', () => {
    const vtt = [
      'WEBVTT',
      '',
      '1',
      '00:00:01.000 --> 00:00:03.000',
      "<v Ravi Menon>I'll send the numbers",
      '',
      '2',
      '00:00:03.000 --> 00:00:05.000',
      '<v Ravi Menon>by Thursday.',
      '',
      '3',
      '00:00:05.000 --> 00:00:06.000',
      '<v Alex Rivera>Perfect.',
      '',
    ].join('\n')

    expect(cleanTranscript(vtt, 'vtt')).toBe(
      "Ravi Menon: I'll send the numbers by Thursday.\nAlex Rivera: Perfect.",
    )
  })

  it('handles SRT with inline speaker labels', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:03,000',
      "Jason: I'll get you the questionnaire.",
      '',
      '2',
      '00:00:03,500 --> 00:00:04,000',
      'Alex: Thanks.',
    ].join('\r\n')

    expect(cleanTranscript(srt, 'srt')).toBe("Jason: I'll get you the questionnaire.\nAlex: Thanks.")
  })

  it('leaves plain text alone apart from bracketed timestamps', () => {
    expect(cleanTranscript('[00:02:10] Ravi: fine by me.  \n', 'plain')).toBe('Ravi: fine by me.')
  })

  it('classifies by extension', () => {
    expect(transcriptFormat('meeting.VTT')).toBe('vtt')
    expect(transcriptFormat('meeting.srt')).toBe('srt')
    expect(transcriptFormat('meeting.txt')).toBe('plain')
  })
})

describe('titleFromFileName', () => {
  it('reads a title out of a filename', () => {
    expect(titleFromFileName('weekly_sync-2026-09-10.vtt')).toBe('Weekly sync 2026 09 10')
    expect(titleFromFileName('.vtt')).toBe('Conversation')
  })
})
