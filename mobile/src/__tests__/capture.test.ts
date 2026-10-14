jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))

import { canStart, composeCaptureText, elapsed, MAX_RECORDING_SECONDS, VOICE_RECORDING } from '../lib/capture'

describe('capture rules', () => {
  it('formats elapsed time', () => {
    expect(elapsed(0)).toBe('0:00')
    expect(elapsed(247)).toBe('4:07')
    expect(elapsed(3729)).toBe('1:02:09')
  })

  it('never starts recording other people without the user confirming they know', () => {
    expect(canStart('voice_note', false)).toBe(true)
    expect(canStart('meeting_recording', false)).toBe(false)
    expect(canStart('meeting_recording', true)).toBe(true)
  })

  it('labels marks and notes as the user’s, after the transcript', () => {
    const text = composeCaptureText('Me: hello', [{ atSeconds: 192, note: 'pricing came up' }, { atSeconds: 300, note: '' }], 'Follow up Friday')
    expect(text).toBe(
      'Me: hello\n\nMy notes during the conversation:\n- 3:12 — pricing came up\n- 5:00 — marked as important\n\nMy note afterwards:\nFollow up Friday',
    )
  })

  it('keeps a full-length recording under the serverless body limit', () => {
    const bytes = ((VOICE_RECORDING.bitRate ?? 0) / 8) * MAX_RECORDING_SECONDS
    expect(bytes).toBeLessThan(4.5 * 1024 * 1024)
  })
})
