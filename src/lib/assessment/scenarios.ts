/**
 * INTERACTION PROFILE — SCENARIO INSTRUMENT (v2)
 * =============================================================================
 * Plain workplace situations with two named responses and an honest way out.
 *
 * WHY THIS REPLACED THE FORCED-CHOICE INSTRUMENT
 *
 * v1 asked the user to rank four statements MOST and LEAST like them. The
 * statements were abstract, often unrelated to one another, and occasionally
 * had an obviously more responsible-sounding answer ("I decide on judgment and
 * find the supporting evidence after"). By the middle of a 24-round run people
 * were clicking to finish rather than answering, which produces confident-
 * looking data that means nothing — worse than no data, because the product
 * then personalises on it.
 *
 * Three deliberate changes:
 *
 *   1. A SITUATION, NOT A TRAIT. "A decision needs to be made but some
 *      information is still missing" is something a professional has lived.
 *      "I decide on judgment and find the supporting evidence after" is a
 *      self-assessment of a disposition, which is a much harder question
 *      wearing the costume of an easy one.
 *
 *   2. TWO OPTIONS THAT ARE ACTUALLY OPPOSITES. Both are legitimate, both are
 *      what a competent person does, and neither is the responsible one. If
 *      one option reads as the right answer, the question is broken and the
 *      data it collects is a measure of self-image.
 *
 *   3. "IT DEPENDS" IS A REAL ANSWER. It usually is the true answer, and
 *      forcing a lean produces false precision. It records that the question
 *      was seen and contributes NOTHING to the score — see scoring-v2.
 *
 * WHY SIX DIMENSIONS AND NOT EIGHT
 *
 * The profile reaches a brief as at most FIVE leanings, ranked by
 * distinctiveness, with anything near the midpoint dropped. Eight dimensions
 * therefore guaranteed that three were collected and discarded. The two cut
 * were the two that overlapped others most: decision basis (evidence versus
 * reading the room) sits between detail and pace, and change comfort sits
 * beside pace. Nothing that changes what a brief says was lost.
 * =============================================================================
 */

export const SCENARIO_VERSION = 'scenario-1.0.0'

export const SCENARIO_DIMENSIONS = [
  'directness',
  'pace',
  'detail',
  'conflict',
  'structure',
  'social_energy',
] as const

export type ScenarioDimension = (typeof SCENARIO_DIMENSIONS)[number]

export interface ScenarioOption {
  id: string
  label: string
  /** +1 leans to the high pole, -1 to the low. `depends` contributes nothing. */
  direction: 1 | -1 | 0
}

export interface Scenario {
  id: string
  dimension: ScenarioDimension
  /** The situation. Two sentences at most, no jargon. */
  prompt: string
  options: ScenarioOption[]
}

/** The shared third option. Never a throwaway — for many people it is the truth. */
function depends(id: string, label = 'It depends'): ScenarioOption {
  return { id, label, direction: 0 }
}

/**
 * The opening six: one per dimension, so a first sitting reaches every
 * dimension rather than three of them deeply.
 */
export const CORE_SCENARIOS: readonly Scenario[] = [
  {
    id: 'dir-core',
    dimension: 'directness',
    prompt: 'You disagree with something said in a meeting. What feels more natural?',
    options: [
      { id: 'dir-core-a', label: 'Say the concern directly', direction: 1 },
      { id: 'dir-core-b', label: 'Ask questions first, then raise it', direction: -1 },
      depends('dir-core-c'),
    ],
  },
  {
    id: 'pac-core',
    dimension: 'pace',
    prompt: 'A decision needs to be made, but some information is still missing.',
    options: [
      { id: 'pac-core-a', label: 'Decide with what we know and adjust later', direction: 1 },
      { id: 'pac-core-b', label: 'Get more information before deciding', direction: -1 },
      depends('pac-core-c'),
    ],
  },
  {
    id: 'det-core',
    dimension: 'detail',
    prompt: 'Someone brings you a recommendation. What do you want first?',
    options: [
      { id: 'det-core-a', label: 'The reasoning and the numbers behind it', direction: 1 },
      { id: 'det-core-b', label: 'The recommendation, with detail if I ask', direction: -1 },
      depends('det-core-c'),
    ],
  },
  {
    id: 'con-core',
    dimension: 'conflict',
    prompt: 'A meeting is moving toward a decision you think is wrong, and nobody else has objected.',
    options: [
      { id: 'con-core-a', label: 'Keep pressing the point', direction: 1 },
      { id: 'con-core-b', label: 'Look for something everyone can live with', direction: -1 },
      depends('con-core-c'),
    ],
  },
  {
    id: 'str-core',
    dimension: 'structure',
    prompt: 'A meeting is booked with no agenda.',
    options: [
      { id: 'str-core-a', label: 'Send one, or ask for one', direction: 1 },
      { id: 'str-core-b', label: 'Fine — talk it through and see where it goes', direction: -1 },
      depends('str-core-c'),
    ],
  },
  {
    id: 'soc-core',
    dimension: 'social_energy',
    prompt: 'You are working through a hard problem. What helps more?',
    options: [
      { id: 'soc-core-a', label: 'Talking it through with someone', direction: 1 },
      { id: 'soc-core-b', label: 'Thinking it through on my own first', direction: -1 },
      depends('soc-core-c'),
    ],
  },
]

/**
 * Refinement: two more per dimension, asked one at a time later.
 *
 * Same rules as the core six. Each is a different situation touching the same
 * tendency, so a second answer is corroboration rather than the same question
 * reworded — which is what makes a third answer worth anything.
 */
export const REFINEMENT_SCENARIOS: readonly Scenario[] = [
  {
    id: 'dir-2',
    dimension: 'directness',
    prompt: 'You have to give someone feedback they will not enjoy hearing.',
    options: [
      { id: 'dir-2-a', label: 'Say it plainly and early in the conversation', direction: 1 },
      { id: 'dir-2-b', label: 'Build up to it so it lands better', direction: -1 },
      depends('dir-2-c'),
    ],
  },
  {
    id: 'dir-3',
    dimension: 'directness',
    prompt: 'A plan has a problem nobody has mentioned yet.',
    options: [
      { id: 'dir-3-a', label: 'Name it in the room', direction: 1 },
      { id: 'dir-3-b', label: 'Raise it with the owner afterwards', direction: -1 },
      depends('dir-3-c'),
    ],
  },
  {
    id: 'pac-2',
    dimension: 'pace',
    prompt: 'A choice has been open for two weeks and the group keeps circling it.',
    options: [
      { id: 'pac-2-a', label: 'Call it and move on', direction: 1 },
      { id: 'pac-2-b', label: 'Work out what is actually blocking it first', direction: -1 },
      depends('pac-2-c'),
    ],
  },
  {
    id: 'pac-3',
    dimension: 'pace',
    prompt: 'You could start now on a rough plan, or start next week on a settled one.',
    options: [
      { id: 'pac-3-a', label: 'Start now', direction: 1 },
      { id: 'pac-3-b', label: 'Wait for the settled plan', direction: -1 },
      depends('pac-3-c'),
    ],
  },
  {
    id: 'det-2',
    dimension: 'detail',
    prompt: 'You are writing an update for someone senior.',
    options: [
      { id: 'det-2-a', label: 'Include the workings so they can check them', direction: 1 },
      { id: 'det-2-b', label: 'Keep it short and attach the detail', direction: -1 },
      depends('det-2-c'),
    ],
  },
  {
    id: 'det-3',
    dimension: 'detail',
    prompt: 'A number in someone else’s analysis looks slightly off.',
    options: [
      { id: 'det-3-a', label: 'Work out where it came from before moving on', direction: 1 },
      { id: 'det-3-b', label: 'Flag it and keep the discussion going', direction: -1 },
      depends('det-3-c'),
    ],
  },
  {
    id: 'con-2',
    dimension: 'conflict',
    prompt: 'Two people you work with disagree, and it is slowing things down.',
    options: [
      { id: 'con-2-a', label: 'Get the disagreement into the open', direction: 1 },
      { id: 'con-2-b', label: 'Talk to each of them separately', direction: -1 },
      depends('con-2-c'),
    ],
  },
  {
    id: 'con-3',
    dimension: 'conflict',
    prompt: 'Someone pushes back hard on your proposal in front of others.',
    options: [
      { id: 'con-3-a', label: 'Defend it there and then', direction: 1 },
      { id: 'con-3-b', label: 'Take it offline and come back to it', direction: -1 },
      depends('con-3-c'),
    ],
  },
  {
    id: 'str-2',
    dimension: 'structure',
    prompt: 'A conversation ends with everyone broadly agreeing.',
    options: [
      { id: 'str-2-a', label: 'Write down who is doing what by when', direction: 1 },
      { id: 'str-2-b', label: 'Leave it — people know what to do', direction: -1 },
      depends('str-2-c'),
    ],
  },
  {
    id: 'str-3',
    dimension: 'structure',
    prompt: 'A project is starting.',
    options: [
      { id: 'str-3-a', label: 'Map the steps before anyone begins', direction: 1 },
      { id: 'str-3-b', label: 'Begin and let the shape emerge', direction: -1 },
      depends('str-3-c'),
    ],
  },
  {
    id: 'soc-2',
    dimension: 'social_energy',
    prompt: 'You have a full day of back-to-back meetings.',
    options: [
      { id: 'soc-2-a', label: 'I finish the day with energy', direction: 1 },
      { id: 'soc-2-b', label: 'I need quiet afterwards to recover', direction: -1 },
      depends('soc-2-c'),
    ],
  },
  {
    id: 'soc-3',
    dimension: 'social_energy',
    prompt: 'You have formed a view but have not said it yet.',
    options: [
      { id: 'soc-3-a', label: 'Say it and refine it out loud', direction: 1 },
      { id: 'soc-3-b', label: 'Finish thinking, then say it', direction: -1 },
      depends('soc-3-c'),
    ],
  },
]

export const ALL_SCENARIOS: readonly Scenario[] = [...CORE_SCENARIOS, ...REFINEMENT_SCENARIOS]

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(
  ALL_SCENARIOS.map((s) => [s.id, s]),
)

export const CORE_COUNT = CORE_SCENARIOS.length
export const TOTAL_COUNT = ALL_SCENARIOS.length

/** Poles, for describing a leaning in the user's own terms. */
export const SCENARIO_POLES: Record<
  ScenarioDimension,
  { label: string; high: { pole: string; blurb: string }; low: { pole: string; blurb: string } }
> = {
  directness: {
    label: 'Directness',
    high: { pole: 'Direct', blurb: 'Says the difficult thing early and in the room.' },
    low: { pole: 'Diplomatic', blurb: 'Works up to a difficult point so it stays hearable.' },
  },
  pace: {
    label: 'Pace',
    high: { pole: 'Decisive', blurb: 'Commits on what is known and adjusts as it goes.' },
    low: { pole: 'Deliberate', blurb: 'Wants the missing piece before committing.' },
  },
  detail: {
    label: 'Detail',
    high: { pole: 'Detail-first', blurb: 'Wants the reasoning and the numbers, not just the answer.' },
    low: { pole: 'Headline-first', blurb: 'Wants the conclusion, and the detail on request.' },
  },
  conflict: {
    label: 'Conflict',
    high: { pole: 'Confronting', blurb: 'Will press a contested point in the open.' },
    low: { pole: 'Accommodating', blurb: 'Looks for the version everyone can live with.' },
  },
  structure: {
    label: 'Structure',
    high: { pole: 'Structured', blurb: 'Wants agendas, owners and dates written down.' },
    low: { pole: 'Fluid', blurb: 'Comfortable letting a conversation find its own shape.' },
  },
  social_energy: {
    label: 'Social energy',
    high: { pole: 'Outward', blurb: 'Thinks by talking, and gains energy from the room.' },
    low: { pole: 'Reflective', blurb: 'Forms the view alone first, then brings it.' },
  },
}
