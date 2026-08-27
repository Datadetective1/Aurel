import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatElapsed, pickMimeType, recordingSupported } from './voice-debrief'

/**
 * Voice debrief, the parts that are decidable without a microphone.
 *
 * A real recording needs hardware and a permission prompt, so the browser half
 * is verified by hand. What is testable here is everything that decides
 * whether recording is offered at all, what container it asks for, and — more
 * importantly — the promises the component makes about not submitting anything
 * and not destroying what the user typed.
 */

const source = readFileSync(join(process.cwd(), 'src', 'components', 'app', 'voice-debrief.tsx'), 'utf8')
const form = readFileSync(join(process.cwd(), 'src', 'components', 'app', 'debrief-form.tsx'), 'utf8')

/** Comments mention submitting; only a call would actually do it. */
function stripComments(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join(' ')
}

describe('container selection', () => {
  it('prefers opus in webm when the browser supports it', () => {
    expect(pickMimeType((type) => type === 'audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus')
  })

  it('takes mp4 on a browser that only offers mp4', () => {
    // Safari. Assuming webm here is what breaks half a pilot.
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4')
  })

  it('defers to the browser default when nothing matches', () => {
    // null means "construct MediaRecorder without a mimeType" rather than
    // naming a type the browser will reject.
    expect(pickMimeType(() => false)).toBeNull()
  })

  it('defers to the browser default when it cannot probe at all', () => {
    expect(pickMimeType(undefined)).toBeNull()
  })
})

describe('support detection', () => {
  it('reports unsupported when there is no getUserMedia', () => {
    expect(recordingSupported({})).toBe(false)
    expect(recordingSupported(undefined)).toBe(false)
  })
})

describe('elapsed time', () => {
  it('reads as minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(9)).toBe('0:09')
    expect(formatElapsed(65)).toBe('1:05')
    expect(formatElapsed(180)).toBe('3:00')
  })

  it('never renders a negative or fractional time', () => {
    expect(formatElapsed(-4)).toBe('0:00')
    expect(formatElapsed(12.7)).toBe('0:12')
  })
})

describe('the promises this component makes', () => {
  it('stops itself at three minutes', () => {
    expect(source).toContain('const MAX_SECONDS = 180')
    expect(source).toMatch(/elapsedRef\.current >= MAX_SECONDS/)
  })

  it('refuses an oversized recording before uploading it', () => {
    // Vercel would reject the body anyway; failing here costs the user a
    // wait and a worse error.
    expect(source).toContain('const MAX_BYTES = 4 * 1024 * 1024')
    expect(source).toMatch(/blob\.size > MAX_BYTES/)
  })

  it('refuses an empty recording', () => {
    expect(source).toMatch(/blob\.size < 1_000/)
  })

  it('never submits the form', () => {
    // The whole point: transcription ends at the text field. If this component
    // ever learns to submit, human confirmation has stopped being the gate.
    expect(source).not.toMatch(/requestSubmit|\.submit\(\)|type="submit"/)
    expect(source).not.toMatch(/debriefMeeting/)
  })

  it('renders nothing at all on a browser that cannot record', () => {
    // Not an error, not a warning banner. That browser simply types.
    expect(source).toMatch(/if \(!supported\)[\s\S]{0,120}return null/)
  })

  it('names the microphone-denied wording the user actually needs', () => {
    expect(source).toContain("Microphone access wasn't allowed. You can still type your debrief.")
  })

  it('says what happens to the audio, near the control', () => {
    expect(source).toContain('Record your own debrief after the conversation.')
    expect(source).toContain('is not retained')
  })

  it('announces state changes to a screen reader', () => {
    expect(source).toMatch(/aria-live="polite"/)
    expect(source).toMatch(/role="status"/)
  })

  it('does not signal recording with colour alone', () => {
    // A dot and the word, so the state survives a monochrome display.
    expect(source).toMatch(/Recording/)
  })
})

describe('what the form does with a transcript', () => {
  it('appends rather than assigns, so typed text survives', () => {
    // Someone who typed three lines and then decided to speak the rest must
    // not watch those three lines disappear.
    expect(form).toMatch(/existing\.length > 0 \? `\$\{existing\}/)
    expect(form).not.toMatch(/field\.value = text\b/)
  })

  it('leaves the transcript in an editable field', () => {
    // It goes into the same Textarea that was always there -- not a preview,
    // not a read-only box.
    expect(form).toContain('ref={notesRef}')
    expect(form).toContain('name="notes"')
    expect(form).not.toMatch(/readOnly|disabled=\{true\}/)
  })

  it('does not auto-submit after inserting', () => {
    const insert = form.slice(form.indexOf('function insertTranscript'))
    const body = insert.slice(0, insert.indexOf('\n  }'))
    expect(stripComments(body)).not.toMatch(/requestSubmit|[.]submit[(]|formAction|debriefMeeting/)
  })

  it('keeps the existing submit as the only way in', () => {
    expect(form).toContain('Save debrief')
  })
})
