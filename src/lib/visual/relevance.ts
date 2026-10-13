/**
 * How much a relationship matters, in the user's own words.
 *
 * `people.relevance` is set by the user on a five-step slider whose steps are
 * these labels. It is never calculated. It is shown only at the top two steps
 * and only as the words the user chose -- never as "4/5", which reads as a
 * measurement -- because 3 is also the silent default for anyone added from a
 * conversation or a calendar invite, and showing it would present a value the
 * user never set.
 */
export const RELEVANCE_LABELS = [
  'Occasional contact',
  'Works with me sometimes',
  'Regular working relationship',
  'Important to my work',
  'Critical relationship',
] as const

export function relevanceChip(relevance: number | null | undefined): string | null {
  if (!relevance || relevance < 4) return null
  return RELEVANCE_LABELS[Math.min(5, relevance) - 1] ?? null
}

/** Meetings carry the same kind of user-set 1-5 importance. */
export function meetingImportanceChip(importance: number | null | undefined): string | null {
  if (!importance || importance < 4) return null
  return importance >= 5 ? 'You marked this critical' : 'You marked this important'
}
