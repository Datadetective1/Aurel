import { describe, expect, it } from 'vitest'
import { findRepeat, storedText, textColumn } from './repeat-save'

const WORDS = 'I promised to send Dana the revised proposal by Friday.'

describe('recognising a save that already happened', () => {
  it('finds the conversation already kept from the same words', () => {
    const recent = [
      { id: 'other', raw_notes: 'Something else entirely, said on another day.', transcript: null },
      { id: 'kept', raw_notes: WORDS, transcript: null },
    ]
    expect(findRepeat(recent, WORDS, 'voice_note')).toBe('kept')
  })

  it('compares the words as they are stored: trimmed, one kind of line ending', () => {
    const recent = [{ id: 'kept', raw_notes: 'First line\nSecond line', transcript: null }]
    expect(findRepeat(recent, '  First line\r\nSecond line \n', 'typed_notes')).toBe('kept')
  })

  it('looks in the column the kind of capture is stored in', () => {
    expect(textColumn('voice_note')).toBe('raw_notes')
    expect(textColumn('typed_notes')).toBe('raw_notes')
    expect(textColumn('meeting_recording')).toBe('transcript')
    const recent = [{ id: 'kept', raw_notes: null, transcript: WORDS }]
    expect(findRepeat(recent, WORDS, 'meeting_recording')).toBe('kept')
    expect(findRepeat(recent, WORDS, 'voice_note')).toBeNull()
  })

  it('treats different words, even one added note, as a new conversation', () => {
    const recent = [{ id: 'kept', raw_notes: WORDS, transcript: null }]
    expect(findRepeat(recent, `${WORDS}\n\nAlso: call Marcus.`, 'voice_note')).toBeNull()
    expect(findRepeat([], WORDS, 'voice_note')).toBeNull()
  })

  it('never matches text too short to keep', () => {
    expect(
      findRepeat([{ id: 'x', raw_notes: 'short', transcript: null }], 'short', 'typed_notes'),
    ).toBeNull()
  })

  it('normalises like the stored row', () => {
    expect(storedText(' a\r\nb\rc ')).toBe('a\nb\nc')
  })
})
