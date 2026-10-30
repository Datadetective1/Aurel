import { EVIDENCE_WORDS } from '@/lib/evidence-words'
import { formatDateIn } from '@/lib/tz'
import type { PersonContext } from '@/lib/ai/types'

/**
 * HANDOFF PACK
 * =============================================================================
 * One relationship, written up so a colleague can pick it up, or so the user
 * can after time away. Plain text: it goes through the phone's share sheet
 * into mail, a message or a note, and reads the same in all of them.
 *
 * Deterministic, with no model call: everything in it is already on record,
 * and each point keeps the evidence label it carries everywhere else. What
 * the user wrote privately (their notes) is left out unless they ask for it.
 *
 * Pure.
 * =============================================================================
 */

export interface HandoffPack {
  title: string
  text: string
}

export interface HandoffOptions {
  timeZone: string
  now?: Date
  includeNotes?: boolean
  /** The product name, for the footer. */
  productName: string
  /** "Client", "Your mentor": how they relate to the user, as the app words it. */
  relationship?: string
}

function list(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}

export function composeHandoff(person: PersonContext, options: HandoffOptions): HandoffPack {
  const { timeZone } = options
  const day = (value: string) => formatDateIn(value, timeZone)
  const name = person.displayName
  const sections: string[] = []

  const role = [person.jobTitle, person.organization].filter(Boolean).join(' at ')
  const intro = [`${person.fullName}${role ? `, ${role}` : ''}.`]
  if (options.relationship) intro.push(`Relationship: ${options.relationship}.`)
  if (person.interactionCount > 0 && person.lastInteractionAt) {
    const since = person.firstInteractionAt ? ` since ${day(person.firstInteractionAt)}` : ''
    intro.push(
      `${person.interactionCount} conversation${person.interactionCount === 1 ? '' : 's'} on record${since}. Last spoke ${day(person.lastInteractionAt)}.`,
    )
  } else {
    intro.push('No conversations on record yet.')
  }
  sections.push(intro.join(' '))

  const roleFact = person.professionalFacts.find((f) => f.kind === 'current_role')
  const facts = person.professionalFacts
    .filter(
      (f) =>
        !(
          f.kind === 'current_organization' &&
          roleFact?.detail?.toLowerCase() === f.value.toLowerCase()
        ),
    )
    .slice(0, 6)
  if (facts.length > 0) {
    sections.push(
      `WHO THEY ARE (public sources)\n${list(
        facts.map(
          (f) =>
            `${f.value}${f.detail ? `, ${f.detail}` : ''} (${EVIDENCE_WORDS[f.evidenceLevel].label})`,
        ),
      )}`,
    )
  }

  const working = [
    ...person.observations.confirmed.map((o) => `${o.content} (${EVIDENCE_WORDS.confirmed.label})`),
    ...person.observations.observed.map((o) => `${o.content} (${EVIDENCE_WORDS.observed.label})`),
    ...person.observations.inferred.map(
      (o) => `${o.content} (${EVIDENCE_WORDS.inferred.label}, worth checking)`,
    ),
  ]
  if (working.length > 0) sections.push(`WORKING WITH THEM\n${list(working.slice(0, 8))}`)

  if (person.topics.length > 0) {
    sections.push(`WHAT YOU TALK ABOUT\n${person.topics.slice(0, 6).join(', ')}`)
  }

  if (person.recentInteractions.length > 0) {
    sections.push(
      `RECENT CONVERSATIONS\n${list(
        person.recentInteractions
          .slice(0, 5)
          .map((i) => `${day(i.occurredAt)}, ${i.title}${i.summary ? `: ${i.summary}` : ''}`),
      )}`,
    )
  }

  if (person.openCommitments.length > 0) {
    const line = (c: PersonContext['openCommitments'][number]) => {
      const who =
        c.kind === 'question'
          ? 'Still to settle'
          : c.owner === 'user'
            ? `Promised to ${name}`
            : c.owner === 'person'
              ? `${name} promised`
              : 'Open between you'
      const when = c.isOverdue ? ' (overdue)' : c.dueOn ? ` (due ${day(c.dueOn)})` : ''
      return `${who}: ${c.description}${when}`
    }
    sections.push(`STILL OPEN\n${list(person.openCommitments.slice(0, 10).map(line))}`)
  }

  if (person.decisions.length > 0) {
    sections.push(
      `DECIDED\n${list(
        person.decisions
          .slice(0, 5)
          .map((d) => `${day(d.decidedOn)}: ${d.description}${d.context ? `. ${d.context}` : ''}`),
      )}`,
    )
  }

  if (options.includeNotes && person.notes?.trim()) {
    sections.push(`NOTES\n${person.notes.trim()}`)
  }

  const footer = `Prepared with ${options.productName} on ${day((options.now ?? new Date()).toISOString())}. Confirmed means they said it or it was confirmed; Observed means it is on record; Inferred is a reading worth checking.`

  return {
    title: `Handoff: ${person.fullName}`,
    text: [`HANDOFF: ${person.fullName.toUpperCase()}`, ...sections, footer].join('\n\n'),
  }
}
