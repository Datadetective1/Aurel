/**
 * A SAVE THAT ALREADY HAPPENED
 * =============================================================================
 * The phone keeps a recording until the server says the conversation was
 * kept. If that answer is lost -- the connection drops while the reading
 * runs, or the app is sent to the background -- the server has the
 * conversation and the phone does not know it, and "Try again" would keep it
 * a second time, with every proposal twice.
 *
 * So the mobile save first looks for the same words, kept by the same person
 * in the last day, and answers with that conversation instead of writing
 * another. No schema change: the comparison is on the stored text, normalised
 * exactly as createConversationCore stores it, over a handful of recent rows
 * read under the user's own row level security.
 * =============================================================================
 */

export const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000
export const REPEAT_CANDIDATES = 10

/** The words as createConversationCore stores them (zod trims, then CRLF becomes LF). */
export function storedText(text: string): string {
  return text.trim().replace(/\r\n?/g, '\n').trim()
}

/** The column createConversationCore writes the words to for this kind of capture. */
export function textColumn(sourceKind: string): 'raw_notes' | 'transcript' {
  return sourceKind === 'typed_notes' || sourceKind === 'voice_note' ? 'raw_notes' : 'transcript'
}

export interface RecentConversation {
  id: string
  raw_notes: string | null
  transcript: string | null
}

/** The conversation these words were already kept as, or null. */
export function findRepeat(
  recent: RecentConversation[],
  text: string,
  sourceKind: string,
): string | null {
  const words = storedText(text)
  if (words.length < 10) return null
  const column = textColumn(sourceKind)
  return recent.find((row) => row[column] === words)?.id ?? null
}
