jest.mock('expo-audio', () => ({ AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' } }))

import { canStart, composeCaptureText, elapsed, MAX_RECORDING_SECONDS, nextTarget, startPart, VOICE_RECORDING } from '../lib/capture'

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
      'Me: hello\n\nMy notes during the conversation:\n- 3:12: pricing came up\n- 5:00: marked as important\n\nMy note afterwards:\nFollow up Friday',
    )
  })

  it('keeps a full-length recording under the serverless body limit', () => {
    const bytes = ((VOICE_RECORDING.bitRate ?? 0) / 8) * MAX_RECORDING_SECONDS
    expect(bytes).toBeLessThan(4.5 * 1024 * 1024)
  })
})

import { atWallTime, wallTime } from '../lib/format'

describe('wallTime', () => {
  it('reads the instant in the account zone, not the phone zone', () => {
    const at = new Date('2026-10-21T13:53:00Z')
    expect(wallTime(at, 'America/Chicago')).toBe('2026-10-21T08:53')
    expect(wallTime(at, 'Europe/Paris')).toBe('2026-10-21T15:53')
    expect(wallTime(new Date('2026-10-21T05:00:00Z'), 'America/Chicago')).toBe('2026-10-21T00:00')
  })
})

describe('atWallTime', () => {
  it('finds 9:00 on the right day, even far from UTC', () => {
    for (const tz of ['America/Chicago', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'Asia/Kolkata', 'Europe/London']) {
      expect(wallTime(atWallTime('2026-10-25T09:00', tz), tz)).toBe('2026-10-25T09:00')
    }
  })
})

describe('what a visit to Capture is for', () => {
  const none = { meetingId: null, personId: null }

  it('a meeting or person passed in is what the capture is for', () => {
    expect(nextTarget(none, { meetingId: 'm1' }, false)).toEqual({ meetingId: 'm1', personId: null })
    expect(nextTarget(none, { personId: 'p1' }, false)).toEqual({ meetingId: null, personId: 'p1' })
  })

  it('a later visit from the tab bar starts clean, so a voice note never attaches to an old meeting', () => {
    expect(nextTarget({ meetingId: 'm1', personId: null }, {}, false)).toEqual(none)
  })

  it('a recording or typed note under way keeps what it was started for', () => {
    expect(nextTarget({ meetingId: 'm1', personId: null }, {}, true)).toEqual({ meetingId: 'm1', personId: null })
    expect(nextTarget({ meetingId: 'm1', personId: null }, { personId: 'p2' }, true)).toEqual({ meetingId: 'm1', personId: null })
  })
})

describe('starting a part of a recording', () => {
  const recorder = (fail: 'prepare' | 'record' | null, uri: string | null) => ({
    uri,
    prepareToRecordAsync: jest.fn(async () => {
      if (fail === 'prepare') throw new Error('prepare failed')
    }),
    record: jest.fn(() => {
      if (fail === 'record') throw new Error('record failed')
    }),
  })

  it('returns the new file, prepared with the speech settings', async () => {
    const r = recorder(null, 'file:///Documents/ExpoAudio/b.m4a')
    const remove = jest.fn()
    await expect(startPart(r, ['file:///Documents/ExpoAudio/a.m4a'], remove)).resolves.toBe('file:///Documents/ExpoAudio/b.m4a')
    expect(r.prepareToRecordAsync).toHaveBeenCalledWith(VOICE_RECORDING)
    expect(remove).not.toHaveBeenCalled()
  })

  it('a microphone that will not start leaves no empty file behind', async () => {
    for (const fail of ['prepare', 'record'] as const) {
      const remove = jest.fn()
      await expect(startPart(recorder(fail, 'file:///Documents/ExpoAudio/empty.m4a'), [], remove)).rejects.toThrow()
      expect(remove).toHaveBeenCalledWith('file:///Documents/ExpoAudio/empty.m4a')
    }
  })

  it('never removes a part already recorded', async () => {
    const remove = jest.fn()
    const kept = 'file:///Documents/ExpoAudio/a.m4a'
    await expect(startPart(recorder('record', kept), [kept], remove)).rejects.toThrow()
    await expect(startPart(recorder('prepare', null), [kept], remove)).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
})
