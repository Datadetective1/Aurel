import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from './logger'

/**
 * The redaction backstop.
 *
 * Call sites are supposed to pass only shapes — counts, codes, durations, enum
 * values. This is what catches the day one of them does not, and until now it
 * had no tests, which is the wrong thing to be unsure about heading into a
 * pilot where the logs will actually be read.
 *
 * The content at risk is not hypothetical: notes about real colleagues, message
 * drafts, extracted source text, email addresses and people's names.
 */

function captured(run: () => void): string {
  const lines: unknown[] = []
  const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args) => void lines.push(args)),
  )
  run()
  spies.forEach((s) => s.mockRestore())
  return JSON.stringify(lines)
}

afterEach(() => vi.restoreAllMocks())

describe('logger redaction', () => {
  it('redacts the fields most likely to carry someone else’s words', () => {
    const output = captured(() =>
      logger.warn('test.event', {
        note: 'Maya objected to the timeline in March',
        message: 'draft email body',
        prompt: 'system prompt text',
        text: 'extracted page content',
        excerpt: 'a quoted passage',
      }),
    )

    expect(output).not.toContain('Maya objected')
    expect(output).not.toContain('draft email body')
    expect(output).not.toContain('system prompt text')
    expect(output).not.toContain('extracted page content')
    expect(output).not.toContain('a quoted passage')
  })

  it('redacts identity, which is not ours to write down either', () => {
    const output = captured(() =>
      logger.warn('test.event', {
        name: 'Priya Raman',
        fullName: 'Priya Raman',
        displayName: 'Priya',
        email: 'priya@example.com',
      }),
    )

    expect(output).not.toContain('Priya')
    expect(output).not.toContain('priya@example.com')
  })

  it('redacts credentials', () => {
    const output = captured(() =>
      logger.warn('test.event', {
        apiKey: 'sk-live-not-a-real-key',
        token: 'bearer-value',
        secret: 'shhh',
        password: 'hunter2',
      }),
    )

    expect(output).not.toContain('sk-live-not-a-real-key')
    expect(output).not.toContain('bearer-value')
    expect(output).not.toContain('hunter2')
  })

  it('truncates a long string under any key, because the deny list cannot be complete', () => {
    // A field nobody thought to name is exactly how content leaks. Length is
    // the signal that survives someone inventing a new key.
    const secretish = 'x'.repeat(600)
    const output = captured(() => logger.warn('test.event', { somethingNew: secretish }))
    expect(output).not.toContain(secretish)
  })

  it('keeps the shapes an operator actually needs', () => {
    // Redaction that ate the diagnostics would just move the problem.
    const output = captured(() =>
      logger.warn('research.slow_run', {
        elapsedMs: 73_400,
        searchRequests: 1,
        sourcesAccepted: 5,
        code: 'PGRST116',
      }),
    )

    expect(output).toContain('73400')
    expect(output).toContain('research.slow_run')
    expect(output).toContain('PGRST116')
  })
})
