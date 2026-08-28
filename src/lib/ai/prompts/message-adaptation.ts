import { z } from 'zod'
import type { Citation, PersonContext, PromptModule, UserContext } from '../types'
import { BRAND_VOICE, dateBlock, renderPerson, renderUser, styleBlock } from './shared'

/**
 * MESSAGE ADAPTATION
 * =============================================================================
 * Rewrite a draft for one specific recipient, and show WHY each change was made.
 * The explanation is the product: an unexplained rewrite is just a thesaurus.
 * =============================================================================
 */

export const ADAPTATION_MODES = [
  'recipient',
  'concise',
  'warmer',
  'direct',
  'diplomatic',
  'executive',
  'evidence_first',
] as const

export type AdaptationMode = (typeof ADAPTATION_MODES)[number]

export const ADAPTATION_MODE_LABEL: Record<AdaptationMode, string> = {
  recipient: 'Adapted to recipient',
  concise: 'More concise',
  warmer: 'Warmer',
  direct: 'More direct',
  diplomatic: 'More diplomatic',
  executive: 'Executive summary first',
  evidence_first: 'Evidence first',
}

export const ADAPTATION_MODE_HINT: Record<AdaptationMode, string> = {
  recipient: "Uses what you've recorded about how this person prefers to receive information.",
  concise: 'Same content, fewer words. Cuts hedging and preamble.',
  warmer: 'Adds relational warmth without adding length or softening the ask.',
  direct: 'States the ask and the position plainly, up front.',
  diplomatic: 'Softens delivery while keeping the substance intact.',
  executive: 'Leads with conclusion and decision required; detail moves below.',
  evidence_first: 'Opens with the supporting evidence, then the recommendation.',
}

export const messageAdaptationSchema = z.object({
  adapted: z.string(),
  /** Each change paired with the evidence that motivated it. */
  changes: z
    .array(
      z.object({
        what: z.string(),
        why: z.string(),
        /** True when driven by the recipient's recorded record rather than the mode. */
        fromRecord: z.boolean(),
      }),
    )
    .max(6),
  /** Anything the user should double-check before sending. */
  cautions: z.array(z.string()).max(3),
})

export type MessageAdaptation = z.infer<typeof messageAdaptationSchema>

export interface MessageAdaptationInput {
  user: UserContext
  recipient: PersonContext | null
  mode: AdaptationMode
  draft: string
  /** email | chat | talking point | presentation line */
  format: string
}

// --- deterministic composition ------------------------------------------------

function sentencesOf(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const HEDGES =
  /\b(just|really|actually|basically|i think maybe|kind of|sort of|a bit|somewhat|perhaps|i was wondering if|i just wanted to|sorry to bother|if that makes sense|does that make sense)\b/gi

const PREAMBLE =
  /^(hi|hey|hello|good (morning|afternoon)|hope (you're|you are) (well|doing well)|hope this finds you well)[,!.]?\s*/i

/**
 * Deterministic rewriting. This performs real, defensible transformations —
 * reordering, hedge removal, evidence promotion — rather than pretending to
 * generate prose. Every change it makes it can also explain, which is exactly
 * the contract the UI promises.
 */
function composeAdaptation(input: MessageAdaptationInput): MessageAdaptation {
  const { draft, mode, recipient } = input
  const changes: MessageAdaptation['changes'] = []
  const cautions: string[] = []

  let sentences = sentencesOf(draft)
  if (sentences.length === 0) {
    return {
      adapted: draft,
      changes: [],
      cautions: ['The draft was empty, so there was nothing to adapt.'],
    }
  }

  // Which recorded preferences are relevant to how this person reads a message.
  const signals = recipient
    ? [...recipient.observations.confirmed, ...recipient.observations.observed].filter((o) =>
        ['communication', 'preference', 'decision'].includes(o.category),
      )
    : []

  const wantsConclusionFirst = signals.some((o) =>
    /recommendation|conclusion|headline|bottom line|the ask|up front|first/i.test(o.content),
  )
  const wantsEvidence = signals.some((o) =>
    /data|evidence|number|proof|detail|methodology|utilisation|utilization|analysis/i.test(o.content),
  )
  const prefersBrevity = signals.some((o) => /brief|short|concise|to the point|keep it/i.test(o.content))

  // 1. Strip greeting preamble for the modes where it costs more than it earns.
  if (mode === 'concise' || mode === 'executive' || mode === 'direct') {
    const first = sentences[0]!
    const stripped = first.replace(PREAMBLE, '')
    if (stripped !== first && stripped.length > 0) {
      sentences[0] = stripped
      changes.push({
        what: 'Removed the opening pleasantry.',
        why: 'It delays the point without adding information.',
        fromRecord: false,
      })
    }
  }

  // 2. Remove hedging where the mode calls for directness.
  if (mode === 'direct' || mode === 'concise' || mode === 'executive') {
    const before = sentences.join(' ')
    sentences = sentences.map((s) => s.replace(HEDGES, '').replace(/\s{2,}/g, ' ').trim())
    if (sentences.join(' ') !== before) {
      changes.push({
        what: 'Cut hedging language.',
        why: 'Qualifiers made the ask sound less certain than it is.',
        fromRecord: false,
      })
    }
  }

  // 3. Reorder: promote the sentence carrying the ask or recommendation.
  const askIndex = sentences.findIndex((s) =>
    /\b(recommend|propose|i'd like|i would like|we should|the ask|please|can you|could you|need|decision)\b/i.test(
      s,
    ),
  )
  const shouldLeadWithAsk =
    mode === 'executive' || mode === 'direct' || (mode === 'recipient' && wantsConclusionFirst)

  if (shouldLeadWithAsk && askIndex > 0) {
    const [ask] = sentences.splice(askIndex, 1)
    sentences.unshift(ask!)
    changes.push({
      what: 'Moved the recommendation to the first sentence.',
      why:
        mode === 'recipient' && wantsConclusionFirst && recipient
          ? `Your record for ${recipient.displayName} shows they look for the conclusion before the reasoning.`
          : 'The reader should know what is being asked before they read the reasoning.',
      fromRecord: mode === 'recipient' && wantsConclusionFirst,
    })
  }

  // 4. Promote evidence for readers who have asked for it before.
  const evidenceIndex = sentences.findIndex((s) =>
    /\b(\d+%|\d+\s*(percent|x)|data|analysis|numbers|measured|based on|last quarter|utilisation|utilization)\b/i.test(
      s,
    ),
  )
  if ((mode === 'evidence_first' || (mode === 'recipient' && wantsEvidence)) && evidenceIndex > 0) {
    const [evidence] = sentences.splice(evidenceIndex, 1)
    sentences.unshift(evidence!)
    changes.push({
      what: 'Moved the supporting evidence ahead of the recommendation.',
      why:
        mode === 'recipient' && recipient
          ? `Your record for ${recipient.displayName} shows they ask for supporting evidence before agreeing.`
          : 'You asked for the evidence to lead.',
      fromRecord: mode === 'recipient' && wantsEvidence,
    })
  }

  // 5. Tone adjustments.
  if (mode === 'diplomatic') {
    sentences = sentences.map((s) =>
      s
        .replace(/\bYou (need to|must|have to)\b/gi, 'It would help if you could')
        .replace(/\bThis is wrong\b/gi, 'I read this differently')
        .replace(/\bNo,\s*/gi, 'I see it a little differently — '),
    )
    changes.push({
      what: 'Softened directive phrasing.',
      why: 'Keeps the substance while leaving the other person room to respond.',
      fromRecord: false,
    })
  }

  if (mode === 'warmer') {
    const name = recipient ? (recipient.preferredName ?? recipient.displayName.split(' ')[0]) : null
    if (name && !new RegExp(`\\b${name}\\b`).test(sentences[0] ?? '')) {
      sentences[0] = `${name} — ${sentences[0]}`
      changes.push({
        what: 'Addressed the recipient by name.',
        why: 'Direct address reads as warmer without adding length.',
        fromRecord: false,
      })
    }
    sentences.push('Happy to talk it through if that is easier.')
    changes.push({
      what: 'Added an offer to discuss.',
      why: 'Gives the reader an easy, low-cost way to respond.',
      fromRecord: false,
    })
  }

  // 6. Length discipline.
  if ((mode === 'concise' || (mode === 'recipient' && prefersBrevity)) && sentences.length > 4) {
    const kept = sentences.slice(0, 4)
    changes.push({
      what: `Cut the message from ${sentences.length} sentences to ${kept.length}.`,
      why:
        mode === 'recipient' && recipient
          ? `Your record for ${recipient.displayName} points to a preference for brevity.`
          : 'Everything after the ask was restating it.',
      fromRecord: mode === 'recipient' && prefersBrevity,
    })
    sentences = kept
  }

  // Honest cautions.
  if (mode === 'recipient' && !recipient) {
    cautions.push('No recipient selected, so nothing here is adapted to a specific person.')
  }
  if (mode === 'recipient' && recipient && signals.length === 0) {
    cautions.push(
      `You have no recorded communication preferences for ${recipient.displayName} yet, so this used general principles rather than their record.`,
    )
  }
  if (changes.length === 0) {
    cautions.push('The draft already matched what this mode would do, so it was left unchanged.')
  }
  cautions.push('Read it once before sending — this rewrote your words, it did not verify them.')

  return {
    adapted: sentences.join(' ').replace(/\s{2,}/g, ' ').trim(),
    changes: changes.slice(0, 6),
    cautions: cautions.slice(0, 3),
  }
}

function citeAdaptation(input: MessageAdaptationInput): Citation[] {
  if (!input.recipient) return []
  return [...input.recipient.observations.confirmed, ...input.recipient.observations.observed]
    .filter((o) => ['communication', 'preference', 'decision'].includes(o.category))
    .map((o) => ({
      label: o.content,
      evidenceLevel: o.evidenceLevel,
      observationId: o.id,
      personId: input.recipient!.id,
    }))
}

export const messageAdaptationPrompt: PromptModule<MessageAdaptationInput, MessageAdaptation> = {
  id: 'message-adaptation',
  kind: 'message_adaptation',
  version: 'message-adaptation@1.0.0',
  schema: messageAdaptationSchema,

  system: (input) =>
    [
      BRAND_VOICE,
      styleBlock(input.user.coachingStyle),
      dateBlock(input.user.timeZone),
      `TASK: rewrite the user's draft ${input.format} in the mode "${input.mode}" (${ADAPTATION_MODE_HINT[input.mode]}).

RULES
- Preserve the user's meaning, facts and commitments exactly. You are changing delivery, not content.
- Never add a fact, number, promise or date that is not in the draft.
- Keep the user's own voice. This should read like a better version of them, not like a different person.
- For every meaningful change, add an entry to "changes" explaining why. Set fromRecord=true ONLY when the reason comes from the recipient's recorded preferences, and name the evidence in the why.
- If the recipient's record contains nothing relevant, say so in "cautions" rather than implying personalization you did not do.
- Never make the message more persuasive by pressuring, flattering or manufacturing urgency.`,
    ].join('\n\n'),

  user: (input) =>
    [
      renderUser(input.user),
      '',
      input.recipient
        ? `## RECIPIENT\n${renderPerson(input.recipient)}`
        : '## RECIPIENT\nNone selected. Do not claim recipient-specific personalization.',
      '',
      `## FORMAT\n${input.format}`,
      '',
      `## THE USER'S DRAFT`,
      input.draft,
    ].join('\n'),

  compose: composeAdaptation,
  cite: citeAdaptation,
}
