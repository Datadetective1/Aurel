import type { CoachingStyle, MeetingKind, PersonContext, UserContext } from '../types'
import { brand } from '@/lib/brand'

/**
 * Shared prompt scaffolding.
 *
 * The voice rules and prohibitions here are the product's ethics expressed as
 * instructions. They are repeated into every system prompt rather than assumed,
 * because a model that drifts on this particular product does real harm: it
 * would be inventing claims about identifiable colleagues.
 */

export const BRAND_VOICE = `You are ${brand.name}, a professional preparation assistant. You brief someone before an important work conversation.

VOICE
- You sound like a well-prepared chief of staff: calm, precise, specific, useful.
- You are not a therapist, a motivational speaker, a psychologist or a salesperson.
- Short sentences. No filler. No preamble. Never congratulate the user on their question.
- Avoid: "revolutionise", "unlock", "supercharge", "game changer", "seamless", "leverage".

GROUNDING - THIS IS THE MOST IMPORTANT RULE
- You are given a record of what the user has actually observed about real, named colleagues.
- Distinguish what is known from what is guessed, every single time:
    CONFIRMED  - the person said it, or the user explicitly confirmed it. State it plainly.
    OBSERVED   - it happened across recorded interactions. Attribute it: "Across two recent meetings, X asked for..."
    INFERRED   - a reasonable reading of thin evidence. Hedge it: "X may prefer...", "It is worth checking whether..."
- NEVER present an inference as a fact.
- NEVER invent a meeting, a quote, a date, an objection or a commitment that is not in the record.
- If the record does not support a section, say so. "I don't have enough evidence about this relationship yet" is a correct and valuable answer. Do not pad.

DESCRIBING PEOPLE
- Describe behavior and stated preferences, not character.
- Write: "asked for supporting data before agreeing in the last two meetings".
- Never write: "is skeptical", "is difficult", "is insecure", "has a big ego".
- NEVER infer or mention race, ethnicity, religion, sexual orientation, gender identity, health, disability, mental health, pregnancy, age, political affiliation, union membership, immigration status or criminal history. If the user's notes contain such information, ignore it entirely.

PURPOSE
- Help the user communicate clearly, prepare properly and follow through.
- Never advise manipulation, pressure tactics, exploiting a weakness, or engineering a "yes".
- Never assess whether someone should be hired, fired, promoted or paid more. Decline that and offer preparation help instead.`

export const STYLE_GUIDANCE: Record<CoachingStyle, string> = {
  concise: 'Be terse. Prefer three words to ten. Omit any section that adds nothing.',
  balanced: 'Be economical but complete. One or two sentences per point.',
  detailed:
    'Give fuller reasoning and more worked examples, while staying concrete. Never repeat yourself to fill space.',
  challenging:
    "Push back on the user's plan where the evidence warrants it. Name the weakest part of their position directly. Stay respectful and specific.",
  supportive:
    'Lead with what the user already has going for them, then the gaps. Keep the tone steady and encouraging without being soft on risk.',
}

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  one_on_one: '1:1',
  executive_review: 'executive review',
  project_review: 'project review',
  customer_meeting: 'customer meeting',
  sales_conversation: 'sales conversation',
  negotiation: 'negotiation',
  difficult_conversation: 'difficult conversation',
  feedback_conversation: 'feedback conversation',
  performance_conversation: 'performance conversation',
  interview: 'interview',
  networking: 'networking conversation',
  presentation: 'presentation',
  vendor_discussion: 'vendor discussion',
  team_meeting: 'team meeting',
  other: 'meeting',
}

export const RELATIONSHIP_LABEL: Record<string, string> = {
  manager: 'your manager',
  report: 'your direct report',
  skip_level: 'your skip-level',
  peer: 'a peer',
  cross_functional: 'a cross-functional partner',
  customer: 'a customer',
  prospect: 'a prospect',
  vendor: 'a vendor',
  partner: 'a partner',
  candidate: 'a candidate',
  mentor: 'your mentor',
  external: 'an external contact',
  other: 'a colleague',
}

/** Render a person's evidence record as labelled prompt text. */
export function renderPerson(person: PersonContext): string {
  const lines: string[] = []
  lines.push(
    `### ${person.displayName}` +
      (person.jobTitle ? ` — ${person.jobTitle}` : '') +
      (person.organization ? `, ${person.organization}` : ''),
  )
  lines.push(
    `Relationship: ${RELATIONSHIP_LABEL[person.relationshipType] ?? 'a colleague'}. ` +
      `Importance to the user: ${person.relevance}/5. ` +
      `Recorded interactions: ${person.interactionCount}.`,
  )
  if (person.meetingRole)
    lines.push(`Role in this meeting: ${person.meetingRole.replace(/_/g, ' ')}.`)

  const group = (label: string, items: typeof person.observations.confirmed) => {
    if (items.length === 0) return
    lines.push(`${label}:`)
    for (const o of items) {
      const reinforced = o.reinforcementCount > 1 ? ` [seen ${o.reinforcementCount}x]` : ''
      lines.push(`- ${o.content}${reinforced}`)
    }
  }
  group('CONFIRMED (stated by them, or confirmed by the user)', person.observations.confirmed)
  group('OBSERVED (supported by recorded interactions)', person.observations.observed)
  group('INFERRED (thin evidence — hedge these)', person.observations.inferred)

  if (person.recentInteractions.length > 0) {
    lines.push('Recent interactions (most recent first):')
    for (const i of person.recentInteractions) {
      lines.push(
        `- ${i.occurredAt.slice(0, 10)} "${i.title}"` +
          (i.summary ? `: ${i.summary}` : '') +
          (i.outcome ? ` Outcome: ${i.outcome}` : ''),
      )
    }
  }

  if (person.openCommitments.length > 0) {
    lines.push('Open commitments:')
    for (const c of person.openCommitments) {
      const who = c.owner === 'user' ? 'user owes' : c.owner === 'person' ? 'they owe' : 'shared'
      lines.push(
        `- (${who}) ${c.description}` +
          (c.dueOn ? ` — due ${c.dueOn}${c.isOverdue ? ' (OVERDUE)' : ''}` : ''),
      )
    }
  }

  if (person.topics.length > 0) lines.push(`Topics: ${person.topics.join(', ')}.`)
  if (person.notes) lines.push(`User's notes: ${person.notes}`)

  // Public material is rendered in its own block, after everything earned
  // through contact, and labelled so the model cannot present a company bio as
  // a read on how someone behaves.
  if (person.professionalFacts.length > 0) {
    lines.push(
      'PUBLIC PROFESSIONAL CONTEXT (from public sources — describes who they are, ' +
        'NOT how they work with the user; never cite it as relationship knowledge):',
    )
    for (const f of person.professionalFacts) {
      const freshness = f.asOf ? ` [as of ${f.asOf.slice(0, 10)}]` : ' [date not stated]'
      const conflict = f.hasConflict ? ' [SOURCES DISAGREE]' : ''
      const level = f.evidenceLevel === 'inferred' ? ' [inferred from one mention]' : ''
      const cite = f.sourceTitles[0] ? ` (source: ${f.sourceTitles[0]})` : ''
      lines.push(
        `- ${f.kind.replace(/_/g, ' ')}: ${f.value}${f.detail ? ` — ${f.detail}` : ''}${freshness}${conflict}${level}${cite}`,
      )
    }
  }

  if (person.publicSources.length > 0) {
    lines.push(
      `Public sources read (${person.publicSources.length}): ` +
        person.publicSources
          .slice(0, 6)
          .map((src) => src.title ?? src.publisher ?? src.url ?? 'untitled')
          .join('; '),
    )
  }

  const hasRelationshipRecord =
    person.observations.confirmed.length > 0 ||
    person.observations.observed.length > 0 ||
    person.recentInteractions.length > 0

  if (!hasRelationshipRecord && person.professionalFacts.length > 0) {
    lines.push(
      'NOTE: there is NO relationship history with this person — only public professional ' +
        'context. Say "Relationship history: none yet" plainly. You may use the public context ' +
        'for who they are and what they work on. Do NOT state how they communicate, decide or ' +
        'react as if it were known; at most raise it as something to find out.',
    )
  } else if (!hasRelationshipRecord) {
    lines.push('NOTE: there is almost no record for this person. Say so rather than inventing one.')
  } else if (person.professionalFacts.length > 0) {
    lines.push(
      'NOTE: where public context and recorded interactions disagree, the recorded ' +
        'interactions win. They are first-hand and current; public material may be years old.',
    )
  }

  return lines.join('\n')
}

/** Render the user's own profile, so guidance accounts for both sides. */
export function renderUser(user: UserContext): string {
  const lines = [
    `The user is ${user.displayName}` +
      (user.jobTitle ? `, ${user.jobTitle}` : '') +
      (user.company ? ` at ${user.company}` : '') +
      '.',
  ]
  if (user.interactionProfile) {
    const p = user.interactionProfile
    lines.push(
      `Their own Interaction Profile is "${p.archetype}" (confidence: ${p.confidence}). Their tendencies:`,
    )
    for (const l of p.leanings) lines.push(`- ${l.label}: ${l.pole}. ${l.blurb}`)
    lines.push(
      'Where the user and the other person differ, name the gap and tell the user what to adjust.',
    )
  } else {
    lines.push(
      'The user has not completed an Interaction Profile, so do not reference their style.',
    )
  }
  return lines.join('\n')
}

/** Style instruction block appended to every system prompt. */
export function styleBlock(style: CoachingStyle): string {
  return `OUTPUT STYLE: ${STYLE_GUIDANCE[style]}\nStyle changes tone and density only. Never omit a risk, soften a warning, or drop an uncertainty to fit a style.`
}

/** Today's date, so relative language ("last week") is anchored. */
export function dateBlock(now = new Date()): string {
  // The weekday is not decoration. Notes say "by Friday" far more often than
  // they say a date, and without knowing what day it is now the model cannot
  // turn that into one — it returns null and the due date is lost.
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  return `Today is ${weekday}, ${now.toISOString().slice(0, 10)}.`
}
