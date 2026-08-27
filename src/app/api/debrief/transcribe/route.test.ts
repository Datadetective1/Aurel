import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The transcription endpoint's contract.
 *
 * Read from the source rather than executed: the handler needs a Supabase
 * session, a request body and a provider, and standing all three up would test
 * the harness rather than the rules. The rules are what matter here, and every
 * one of them is a thing that would be quietly easy to drop in a later edit.
 */

const raw = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'debrief', 'transcribe', 'route.ts'),
  'utf8',
)

/**
 * The assertions below are about what the code does, so they read code.
 *
 * This file's own comments discuss audio, transcripts and attendee names at
 * length -- explaining precisely why none of them may be logged -- and a naive
 * grep flags the explanation as the violation.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

const source = stripComments(raw)

describe('who may call it', () => {
  it('requires an authenticated, onboarded user before anything else', () => {
    const body = source.slice(source.indexOf('export async function POST'))
    const authAt = body.indexOf('requireOnboardedUser')
    const readAt = body.indexOf('request.formData')

    expect(authAt).toBeGreaterThan(-1)
    // Not merely present -- first. A stranger's body is not even read.
    expect(authAt).toBeLessThan(readAt)
  })
})

describe('what it accepts', () => {
  it('caps the body below the platform limit', () => {
    // Vercel refuses at 4.5 MB. Refusing at 4 gives a real message instead of
    // a platform error page.
    expect(source).toContain('const MAX_BYTES = 4 * 1024 * 1024')
    expect(source).toMatch(/audio\.size > MAX_BYTES/)
  })

  it('rejects an empty or near-empty recording', () => {
    expect(source).toMatch(/audio\.size < MIN_BYTES/)
  })

  it('accepts the formats browsers actually emit', () => {
    // webm/opus from Chrome and Firefox, mp4 from Safari. Everything in this
    // list is also a format the provider accepts.
    for (const type of ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav']) {
      expect(source).toContain(`'${type}'`)
    }
  })

  it('matches the base type, ignoring codec parameters', () => {
    // The browser sends "audio/webm;codecs=opus"; an exact-match lookup would
    // reject every real recording.
    expect(source).toMatch(/split\(';'\)\[0\]/)
  })

  it('refuses a type it does not recognise', () => {
    expect(source).toMatch(/if \(!extension\)/)
    expect(source).toContain('415')
  })

  it('never trusts the browser-supplied filename', () => {
    // The blob is re-named server-side in lib/ai/transcribe.
    expect(source).not.toMatch(/\.name\b/)
  })
})

describe('what it stores', () => {
  it('never writes the audio anywhere', () => {
    // No insert, no upload, no storage bucket. The blob lives for one call.
    expect(source).not.toMatch(/\.insert\(|\.upsert\(|storage\.|\.upload\(/)
  })

  it('records usage without inventing a price', () => {
    // Transcription is billed per minute; the estimator is per token. Real
    // token counts go in, cost stays unpriced, and the existing warning fires.
    expect(source).toContain("meter: 'voice_transcription'")
    expect(source).toMatch(/inputTokens: result\.inputTokens/)
    expect(source).not.toMatch(/costUnits|estimateCost/)
  })
})

describe('what it says out loud', () => {
  it('sends only buckets and categories to analytics', () => {
    const tracked = [...source.matchAll(/track\(\s*'voice_[a-z_]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )

    expect(tracked.length).toBeGreaterThan(2)
    for (const props of tracked) {
      // Keys first: nothing may be *called* text, transcript, keywords and so
      // on. `sizeBucket(audio.size)` mentions audio and is a number about it,
      // which is the distinction that matters.
      const keys = [...props.matchAll(/(\w+)\s*:/g)].map((m) => m[1])
      expect(keys).not.toContain('text')
      expect(keys).not.toContain('transcript')
      expect(keys).not.toContain('keywords')
      expect(keys).not.toContain('name')
      expect(keys).not.toContain('email')
      expect(keys).not.toContain('notes')

      // Then values: the transcript and the name hints, by the identifiers
      // they are held in.
      expect(props).not.toMatch(/result\.text|\bkeywords\b/)
    }
  })

  it('never logs the transcript, the audio or the attendee names', () => {
    const logged = [...source.matchAll(/logger\.[a-z]+\(\s*'[a-z_.]+'\s*,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )

    expect(logged.length).toBeGreaterThan(1)
    for (const props of logged) {
      const keys = [...props.matchAll(/(\w+)\s*:/g)].map((m) => m[1])
      expect(keys).not.toContain('text')
      expect(keys).not.toContain('transcript')
      expect(keys).not.toContain('keywords')
      expect(keys).not.toContain('name')
      expect(keys).not.toContain('email')
      expect(keys).not.toContain('notes')

      expect(props).not.toMatch(/result\.text|\bkeywords\b/)
    }
  })

  it('does not hand provider errors to the user', () => {
    // Two sentences, both actionable. Nothing about status codes or models.
    expect(source).toContain("You can try again or type your debrief.")
    expect(source).not.toMatch(/error: [^']*result\.reason/)
  })

  it('buckets size and duration rather than reporting them exactly', () => {
    // An exact byte count of a short recording is closer to a fingerprint than
    // a metric.
    expect(source).toMatch(/function sizeBucket/)
    expect(source).toMatch(/function durationBucket/)
  })
})

describe('what it does not do', () => {
  it('produces text and nothing else', () => {
    // No observations, no commitments, no memory proposals. Those belong to
    // the existing debrief action, behind the user's explicit submit.
    expect(source).not.toMatch(/observations|commitments|proposedMemories|debriefPrompt/)
  })
})
