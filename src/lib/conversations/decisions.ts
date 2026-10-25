/**
 * DECIDED, OR ONLY PROPOSED
 * =============================================================================
 * A decision is an outcome the conversation settled. "We decided to move the
 * launch to March" is one. "I'd suggest going with vendor B" is not: it is a
 * proposal, and it was being read as a decision and pre-ticked for keeping
 * (audit finding 8.7). Recommendations, suggestions, hypotheticals and open
 * questions are the same: somebody put an option on the table; nobody settled
 * it.
 *
 * Read from the words a decision rests on -- its excerpt and its own text --
 * on both extraction paths, and again whenever Review shows it, so rows
 * written before this rule existed are read the same way.
 *
 *   decided   settling words ("decided", "agreed to", "we're going with"),
 *             and nothing that hedges them. A reason given after them is
 *             not a hedge: "we agreed to go with vendor B because it could
 *             scale" was agreed. A proposal anywhere still is.
 *   proposed  a suggestion, recommendation, hypothetical, condition, hedge,
 *             open question or unsettled outcome ("not decided yet")
 *   unmarked  neither. Left to the confidence it was read with, as before.
 *
 * Wrongly reading a decision as proposed costs a tick: it is still offered,
 * unticked. Wrongly reading a proposal as decided puts something nobody
 * agreed to in the record. So when the words carry both, proposed wins.
 *
 * Dependency-free, so the iPhone app can share the label.
 * =============================================================================
 */

export type DecisionReading = 'decided' | 'proposed' | 'unmarked'

/** What Review calls a proposal, on the web and on the iPhone. */
export const PROPOSED_LABEL = 'Proposed, not decided'

/**
 * A proposal's confidence never reaches pre-selection. It stays above the
 * proposal floor, so it is still offered for the user to keep if they choose.
 */
export const PROPOSED_CONFIDENCE_CAP = 0.5

/** The outcome is not settled: said in so many words. */
const UNSETTLED = new RegExp(
  '\\b(?:' +
    [
      'not (?:yet )?(?:decided|agreed|settled|finali[sz]ed|final|confirmed|approved)',
      "(?:haven't|hasn't|hadn't|have not|has not|had not|didn't|did not|don't|do not|can't|cannot|couldn't|could not|won't|will not) (?:yet )?(?:decide|decided|agree|agreed|settle|settled|confirm|confirmed|approve|approved)",
      'undecided',
      'no decision',
      'yet to (?:decide|agree|settle|confirm|approve)',
      '(?:need|needs|have|has|had) to (?:decide|agree|settle|confirm|approve)',
      'to be (?:decided|determined|confirmed|agreed|settled|approved)',
      'tbd',
      'tbc',
      'decide (?:whether|if|on|between|later|next)',
      'whether (?:to|we|or not)',
      'up for (?:debate|discussion)',
      'still open',
      'left open',
      'open question',
    ].join('|') +
    ')\\b',
)

/**
 * Somebody put an option forward, or made it conditional. Counts wherever it
 * appears: "we agreed, so maybe we should go with vendor B" is not settled.
 */
const PROPOSAL = new RegExp(
  '\\b(?:' +
    [
      'suggest(?:s|ed|ing|ion|ions)?',
      'recommend(?:s|ed|ing|ation|ations)?',
      'propos(?:e|es|ed|ing|al|als)',
      'how about',
      'what about',
      'what if',
      'should we',
      'shall we',
      'could we',
      'can we',
      "why don't we",
      'why not',
      'maybe',
      'perhaps',
      'consider(?:s|ed|ing|ation)?',
      "let's (?:consider|think|explore|look|discuss|talk|see|revisit)",
      'think(?:ing)? about',
      'thinking of',
      'prefer(?:s|red|ence|able)?',
      'lean(?:s|ing|ed)? (?:towards?|to)',
      'in favou?r of',
      'open to',
      'an option',
      'one option',
      'the idea',
      'worth (?:trying|considering|exploring|looking|a look|a try)',
      'wonder(?:s|ing|ed)?',
      'not sure',
      'unsure',
      'ideally',
      'tentative(?:ly)?',
      'pencil(?:l)?ed in',
      'floated',
      'pitched',
      'hypothetical(?:ly)?',
      'in theory',
      'assuming',
      'if',
      'unless',
    ].join('|') +
    ')\\b',
)

/**
 * Words that soften. They hedge the decision itself -- "we agreed it might be
 * worth trying" -- but not a reason given for it after the fact: "we agreed
 * to go with vendor B because it could scale" was agreed.
 */
const SOFTENER = new RegExp(
  '\\b(?:' +
    [
      'could',
      'might',
      'would',
      'probably',
      'possibly',
      'potentially',
      "i'd",
      "we'd",
      "you'd",
      "they'd",
    ].join('|') +
    ')\\b',
)

/** Where the decision ends and a reason, result or concession about it begins. */
const REASON =
  /\b(?:because|since|so that|so|which|given that|given|in order to|although|though|even though|while)\b/

/** Words that settle an outcome. */
const SETTLED = new RegExp(
  '\\b(?:' +
    [
      'decided',
      'decision (?:is|was|has been) made',
      'agreed',
      'approved',
      'signed off',
      'settled (?:on|it)',
      "(?:it's|it is|that's|that is) settled",
      'finali[sz]ed',
      'final decision',
      'confirmed',
      'locked in',
      'green ?lit',
      'chose',
      'chosen',
      'picked',
      'committed to',
      "(?:we're|we are|i'm|i am) going (?:with|ahead)",
      'going ahead with',
      "(?:we'll|we will) go with",
      'went with',
      "it's a go",
      'moving forward with',
      '(?:is|are) moving to',
      'moves? to',
      'will move to',
    ].join('|') +
    ')\\b',
)

/**
 * The history of a settled decision, not a hedge on it: "we decided to go
 * with vendor B, as Ravi recommended" was decided. Only set aside when
 * settling words are present.
 */
const ATTRIBUTED =
  /\b(?:(?:as|because|since) (?:\w+ )?(?:suggested|recommended|proposed)(?: it)?|(?:\w+'s|his|her|their|my|our|your|the) (?:suggestion|recommendation|proposal)s?|(?:after|having) consider(?:ed|ing)\b[^,.;]*)/g

/**
 * A decision reported in the future tense: "we decided we would launch in
 * March" was decided. The softener after it belongs to the report.
 */
const REPORTED = /\b(decided|agreed)(?: that)? (?:we|they|you|i|he|she|it)(?:'d| would)\b/g

// Speaker labels ("Ravi Menon: …") are read along with the words. They are
// names, and stripping them would also strip a line that opens "Approved: …".
function words(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

/** How one piece of text reads: decided, proposed, or neither. */
export function readDecisionText(text: string | null | undefined): DecisionReading {
  const said = text ? words(text) : ''
  if (!said) return 'unmarked'
  if (UNSETTLED.test(said) || /\?\s*$/.test(said)) return 'proposed'

  const neutral = said.replace(ATTRIBUTED, ' ').replace(REPORTED, '$1')
  const settled = SETTLED.exec(neutral)
  if (!settled) return PROPOSAL.test(said) || SOFTENER.test(said) ? 'proposed' : 'unmarked'

  // The decision itself is everything up to a reason, result or concession
  // given after its settling words. Any hedge in it, or any proposal at all,
  // means it was not settled.
  const after = settled.index + settled[0].length
  const reason = REASON.exec(neutral.slice(after))
  const decision = reason ? neutral.slice(0, after + reason.index) : neutral
  if (PROPOSAL.test(neutral) || SOFTENER.test(decision)) return 'proposed'
  return 'decided'
}

/**
 * How an extracted decision reads, from the words it rests on and its own
 * text. Either one reading as a proposal is enough: a model can paraphrase
 * the hedge away, and the excerpt is the evidence.
 */
export function readDecision(decision: {
  description: string
  excerpt: string | null
}): DecisionReading {
  const readings = [readDecisionText(decision.excerpt), readDecisionText(decision.description)]
  if (readings.includes('proposed')) return 'proposed'
  if (readings.includes('decided')) return 'decided'
  return 'unmarked'
}

export function isProposedDecision(decision: {
  description: string
  excerpt: string | null
}): boolean {
  return readDecision(decision) === 'proposed'
}
