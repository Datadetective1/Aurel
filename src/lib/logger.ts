/**
 * Structured logging.
 *
 * PRIVACY RULE: this logger must never receive relationship content. No notes,
 * transcripts, observation text, message bodies, person names or email
 * addresses. Log identifiers, enum values, counts, durations and error *shapes*.
 * `redact()` below is a backstop, not a licence to be careless at call sites.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

type Fields = Record<string, unknown>

/** Keys that must never be logged, whatever the call site passes. */
const FORBIDDEN_KEYS = new Set([
  'content',
  'body',
  'transcript',
  'notes',
  'rawNotes',
  'note',
  'summary',
  'objective',
  'stakes',
  'message',
  'draft',
  'text',
  'prompt',
  'email',
  'fullName',
  'displayName',
  'name',
  'excerpt',
  'apiKey',
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
])

function redact(fields: Fields): Fields {
  const safe: Fields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key)) {
      safe[key] = '[redacted]'
      continue
    }
    // Long strings are a strong signal that user content leaked in.
    if (typeof value === 'string' && value.length > 200) {
      safe[key] = `[redacted:${value.length}chars]`
      continue
    }
    safe[key] = value
  }
  return safe
}

function emit(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...redact(fields),
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (process.env.NODE_ENV !== 'production' || level === 'info') console.log(line)
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}

/** Normalise an unknown thrown value into a log-safe shape. */
export function errorShape(error: unknown) {
  if (error instanceof Error) {
    return { error: error.name, hasStack: Boolean(error.stack) }
  }
  return { error: typeof error }
}
