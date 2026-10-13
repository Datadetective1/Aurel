/**
 * THE GLANCE, COMPOSED
 * =============================================================================
 * The few lines worth holding in your head walking into a room, selected from
 * what the brief and the record already say. Same rule as `listeningCues` in
 * `lib/brief`: it selects and labels, it never writes a sentence. Each line
 * keeps a short `basis` naming where in the record it came from, so the
 * shortest view still answers "why does it think that" one tap down.
 * =============================================================================
 */

import type { NormalizedBrief } from '@/lib/brief'

export type PrepState = 'ready' | 'needs_people' | 'not_prepared'

/**
 * Where preparation stands, stated as a fact about the record:
 * a brief exists, or the room is empty, or nothing has been prepared yet.
 */
export function prepState(input: { hasBrief: boolean; attendeeCount: number }): PrepState {
  if (input.hasBrief) return 'ready'
  if (input.attendeeCount === 0) return 'needs_people'
  return 'not_prepared'
}

export const PREP_META: Record<PrepState, { label: string; tone: 'positive' | 'caution' | 'neutral' }> =
  {
    ready: { label: 'Brief ready', tone: 'positive' },
    needs_people: { label: 'No one added yet', tone: 'neutral' },
    not_prepared: { label: 'Not prepared', tone: 'caution' },
  }

export interface RememberItem {
  text: string
  /** Who it is about, when it is about one person. */
  personId: string | null
  /** Where it came from, in the record's own terms. */
  basis: string
}

export interface RememberInput {
  brief: NormalizedBrief | null
  lastConversation?: { title: string; outcome: string | null; summary: string | null } | null
  openLoopCount?: number
}

const MAX_REMEMBER = 3

/**
 * Up to three lines. Preference order: what matters to the people in the room
 * (from the brief, which drew it from the record), a concern they have raised,
 * what the last conversation came to, and finally the count of what is open.
 * One line per participant before a second line about anyone, so a two-person
 * room does not read as being about only one of them.
 */
export function composeRemember(input: RememberInput): RememberItem[] {
  const items: RememberItem[] = []
  const seen = new Set<string>()
  const push = (item: RememberItem) => {
    const key = item.text.trim().toLowerCase()
    if (!key || seen.has(key) || items.length >= MAX_REMEMBER) return
    seen.add(key)
    items.push(item)
  }

  const participants = input.brief?.participants ?? []

  // Recorded relationship evidence first; public-only context never leads.
  for (const p of participants) {
    if (p.publicOnly) continue
    const first = p.whatMatters[0]
    if (first) push({ text: first, personId: p.personId, basis: `What matters to ${p.name}` })
  }
  for (const p of participants) {
    if (p.publicOnly) continue
    const concern = p.knownConcerns[0]
    if (concern) push({ text: concern, personId: p.personId, basis: `${p.name} has raised this` })
  }

  const last = input.lastConversation
  if (last) {
    const said = last.outcome ?? last.summary
    if (said) push({ text: said, personId: null, basis: `Last time: ${last.title}` })
  }

  for (const p of participants) {
    const second = p.whatMatters[1]
    if (second && !p.publicOnly) {
      push({ text: second, personId: p.personId, basis: `What matters to ${p.name}` })
    }
  }

  const open = input.openLoopCount ?? 0
  if (open > 0) {
    push({
      text: open === 1 ? 'One loop is still open between you' : `${open} loops are still open between you`,
      personId: null,
      basis: 'Open loops on record',
    })
  }

  return items
}
