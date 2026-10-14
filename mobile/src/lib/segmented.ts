/**
 * SEGMENTED CAPTURE, ON THE PHONE
 * =============================================================================
 * A long conversation is recorded as ten-minute segments. Each finished
 * segment is uploaded straight to private storage and transcribed while the
 * next one records, so stopping a ninety-minute meeting leaves one segment to
 * process rather than ninety minutes.
 *
 * Segments are processed one at a time, in order. A segment whose
 * transcription fails with a retryable error is tried again (twice); the
 * server keeps its audio for that, and deletes it the moment it succeeds or
 * gives up. Words are kept on the phone only until the conversation is sent.
 *
 * The dependencies are injected, so the rules here are tested without a
 * network.
 * =============================================================================
 */

export interface SegmentUploadTicket {
  uploadId: string
  captureId: string
  path: string
  token: string
  contentType: string
}

export interface SegmentedDeps {
  requestUpload(input: {
    captureId: string | null
    index: number
    extension: string
    bytes: number
    declaredSeconds: number
  }): Promise<SegmentUploadTicket>
  readFile(uri: string): Promise<ArrayBuffer>
  putObject(ticket: SegmentUploadTicket, body: ArrayBuffer): Promise<void>
  transcribe(uploadId: string): Promise<
    { ok: true; text: string } | { ok: false; error: string; retryable: boolean }
  >
  discard(captureId: string): Promise<void>
}

const RETRIES = 2

export class SegmentedCapture {
  private captureId: string | null = null
  private texts = new Map<number, string>()
  private failure: string | null = null
  private queue: Promise<void> = Promise.resolve()
  private count = 0

  constructor(private deps: SegmentedDeps) {}

  get segments(): number {
    return this.count
  }

  /** Queue a finished segment. Returns immediately; work happens in order. */
  add(uri: string, seconds: number): void {
    const index = this.count++
    this.queue = this.queue.then(() => this.process(index, uri, seconds))
  }

  private async process(index: number, uri: string, seconds: number): Promise<void> {
    if (this.failure) return
    try {
      const extension = (uri.split('.').pop() ?? 'm4a').toLowerCase()
      const body = await this.deps.readFile(uri)
      const ticket = await this.deps.requestUpload({
        captureId: this.captureId,
        index,
        extension,
        bytes: body.byteLength,
        declaredSeconds: Math.round(seconds),
      })
      this.captureId = ticket.captureId
      await this.deps.putObject(ticket, body)

      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        const result = await this.deps.transcribe(ticket.uploadId)
        if (result.ok) {
          this.texts.set(index, result.text)
          return
        }
        if (!result.retryable || attempt === RETRIES) {
          this.failure = result.error
          return
        }
      }
    } catch (error) {
      this.failure = error instanceof Error && error.message ? error.message : 'That part of the recording could not be sent.'
    }
  }

  /** Every segment's words, in order -- or the first failure. */
  async finish(): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    await this.queue
    if (this.failure) return { ok: false, error: this.failure }
    const parts: string[] = []
    for (let i = 0; i < this.count; i++) {
      const text = this.texts.get(i)
      if (text === undefined) return { ok: false, error: 'Part of the recording is missing. Try again.' }
      if (text.trim()) parts.push(text.trim())
    }
    return { ok: true, text: parts.join('\n\n') }
  }

  /** Throw the recording away, here and on the server. */
  async cancel(): Promise<void> {
    await this.queue.catch(() => {})
    this.texts.clear()
    if (this.captureId) await this.deps.discard(this.captureId).catch(() => {})
  }
}
