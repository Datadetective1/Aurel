/**
 * RETIRED FOR NEW PROFILES.
 * =============================================================================
 * This forced-choice instrument no longer collects anything. New profiles use
 * the scenario instrument in ./scenarios.ts; this file and ./scoring.ts remain
 * so that assessments recorded before the change can still be read and rendered
 * as exactly what they were.
 *
 * It was retired because it did not work in practice. Ranking four unrelated
 * abstract statements MOST and LEAST like you is two judgements about four
 * things at once, and by the middle of a 24-round run people were choosing to
 * finish rather than to answer -- which produces confident-looking data that
 * means nothing.
 *
 * Do not add items here. Add scenarios.
 * =============================================================================
 */

/**
 * THE INTERACTION PROFILE — INSTRUMENT v1
 * =============================================================================
 * An original forced-choice instrument measuring eight *practical* interaction
 * tendencies: the things that actually change how you should approach a
 * conversation with someone.
 *
 * WHAT THIS IS NOT
 * This is not a clinical, diagnostic, psychometric or hiring instrument. It is a
 * personalisation tool. It makes no claim to measure personality, aptitude or
 * fitness for any role, and it must never be presented as doing so.
 *
 * DESIGN
 * 24 blocks of 4 statements. In each block the respondent picks the statement
 * MOST like them and the one LEAST like them. Each statement is keyed to exactly
 * one dimension with a direction. Forced choice reduces the acquiescence and
 * self-flattery bias you get from agree/disagree scales, because every option in
 * a block is a reasonable professional trait.
 *
 * BALANCE (asserted by unit tests in scoring.test.ts)
 *   - every block draws from 4 distinct dimensions
 *   - each dimension appears in exactly 12 slots
 *   - each dimension contributes exactly 6 positive- and 6 negative-keyed items
 * =============================================================================
 */

export const INSTRUMENT_VERSION = 'ip-1.0.0'

/** Number of forced-choice blocks presented. */
export const BLOCK_COUNT = 24

/**
 * How many blocks the first sitting asks.
 *
 * Six, taken from the front of the existing order rather than cherry-picked:
 * blocks rotate their dimensions by OFFSETS = [0,1,3,5] over eight dimensions,
 * so the first six already touch all eight. Reordering or hand-selecting them
 * would change the instrument to suit the UI, which is the one thing this
 * split must not do.
 *
 * Six blocks yield twelve keyed contributions across eight dimensions, so
 * coverage cannot reach the threshold that confidenceFrom requires for
 * anything above 'provisional'. The profile is honest about being provisional
 * because the arithmetic makes it so, not because a flag says it.
 */
export const INITIAL_BLOCK_COUNT = 6

/** Statements shown per block. */
export const ITEMS_PER_BLOCK = 4

export type DimensionId =
  | 'directness'
  | 'social_energy'
  | 'pace'
  | 'detail'
  | 'decision_style'
  | 'change_comfort'
  | 'conflict'
  | 'structure'

export interface Dimension {
  id: DimensionId
  /** Neutral name shown in the UI. */
  label: string
  /** What a score at/above the midpoint means. */
  highPole: { name: string; blurb: string }
  /** What a score below the midpoint means. */
  lowPole: { name: string; blurb: string }
  /** One sentence explaining why this dimension changes how you approach someone. */
  whyItMatters: string
}

/**
 * Dimensions are deliberately framed as two *equally valid* poles. Neither end is
 * "better", and the copy must never imply otherwise — this is the difference
 * between a personalisation tool and a judgement about a person.
 */
export const DIMENSIONS: readonly Dimension[] = [
  {
    id: 'directness',
    label: 'Directness',
    highPole: {
      name: 'Plainspoken',
      blurb: 'States positions openly and early, even when the message is difficult.',
    },
    lowPole: {
      name: 'Measured',
      blurb: 'Frames difficult messages carefully to keep the other person open to them.',
    },
    whyItMatters:
      'Determines whether to lead with the hard part or build to it, and how much cushioning a message needs.',
  },
  {
    id: 'social_energy',
    label: 'Social energy',
    highPole: {
      name: 'Outward',
      blurb: 'Thinks out loud, engages the room, and works a problem through conversation.',
    },
    lowPole: {
      name: 'Reserved',
      blurb: 'Forms a view before voicing it, and does the deepest thinking alone.',
    },
    whyItMatters:
      'Determines whether to send material ahead of time or work it out live in the room.',
  },
  {
    id: 'pace',
    label: 'Pace',
    highPole: {
      name: 'Fast',
      blurb: 'Commits early and adjusts, and finds open decisions uncomfortable.',
    },
    lowPole: {
      name: 'Deliberate',
      blurb: 'Wants to sit with a decision, and would rather be late than wrong.',
    },
    whyItMatters:
      'Determines whether to push for a decision in the meeting or leave deliberate room after it.',
  },
  {
    id: 'detail',
    label: 'Detail orientation',
    highPole: {
      name: 'Detail-first',
      blurb: 'Wants the underlying numbers and the edge cases before the conclusion.',
    },
    lowPole: {
      name: 'Big-picture',
      blurb: 'Wants the headline first and the supporting detail only on request.',
    },
    whyItMatters:
      'Determines whether to open with the recommendation or with the method behind it.',
  },
  {
    id: 'decision_style',
    label: 'Decision basis',
    highPole: {
      name: 'Evidence-led',
      blurb: 'Wants a comparison, a precedent or a measurement before committing.',
    },
    lowPole: {
      name: 'Judgment-led',
      blurb: 'Reads the situation and weighs who is making the case, not only the case.',
    },
    whyItMatters: 'Determines what will actually move this person: proof, or a credible read.',
  },
  {
    id: 'change_comfort',
    label: 'Change comfort',
    highPole: {
      name: 'Exploratory',
      blurb: 'Drawn to the untried option and comfortable with a wide range of outcomes.',
    },
    lowPole: {
      name: 'Risk-aware',
      blurb: 'Wants the downside mapped and a way back before stepping forward.',
    },
    whyItMatters: 'Determines whether to lead with the upside or with how the risk is contained.',
  },
  {
    id: 'conflict',
    label: 'Conflict approach',
    highPole: {
      name: 'Engaging',
      blurb: 'Will press a contested point and is comfortable being the lone objection.',
    },
    lowPole: {
      name: 'Harmonising',
      blurb: 'Looks for the version everyone can live with, and follows up privately.',
    },
    whyItMatters:
      'Determines whether to surface a disagreement in the room or handle it one-to-one first.',
  },
  {
    id: 'structure',
    label: 'Structure preference',
    highPole: {
      name: 'Structured',
      blurb: 'Works from an agenda and wants owners and dates written down.',
    },
    lowPole: {
      name: 'Adaptive',
      blurb: 'Reads the room over the agenda and shapes the conversation as it goes.',
    },
    whyItMatters:
      'Determines whether to send an agenda in advance or keep the conversation open.',
  },
] as const

export const DIMENSION_BY_ID: Record<DimensionId, Dimension> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, d]),
) as Record<DimensionId, Dimension>

export interface Item {
  id: string
  dimension: DimensionId
  /** +1 keys toward the high pole, -1 toward the low pole. */
  direction: 1 | -1
  text: string
}

/**
 * The item bank: 12 statements per dimension, 6 in each direction.
 * All statements are first-person, behavioural, and workplace-neutral. None
 * describes a trait the respondent would be embarrassed to claim, which is what
 * makes the forced choice informative.
 */
export const ITEMS: readonly Item[] = [
  // --- directness -----------------------------------------------------------
  { id: 'dir+1', dimension: 'directness', direction: 1, text: 'I say what I actually think, even when it lands awkwardly.' },
  { id: 'dir+2', dimension: 'directness', direction: 1, text: 'I lead with my recommendation rather than working up to it.' },
  { id: 'dir+3', dimension: 'directness', direction: 1, text: 'If I disagree, I say so in the room rather than afterwards.' },
  { id: 'dir+4', dimension: 'directness', direction: 1, text: 'I would rather be blunt than be misunderstood.' },
  { id: 'dir+5', dimension: 'directness', direction: 1, text: 'I give critical feedback without much cushioning.' },
  { id: 'dir+6', dimension: 'directness', direction: 1, text: 'I name the problem plainly when a discussion is drifting.' },
  { id: 'dir-1', dimension: 'directness', direction: -1, text: 'I soften how I phrase things so people stay open to the point.' },
  { id: 'dir-2', dimension: 'directness', direction: -1, text: 'I test a difficult message with someone before I deliver it.' },
  { id: 'dir-3', dimension: 'directness', direction: -1, text: "I look for a way to raise concerns that protects the other person's standing." },
  { id: 'dir-4', dimension: 'directness', direction: -1, text: 'I would rather be tactful than be the first to say it.' },
  { id: 'dir-5', dimension: 'directness', direction: -1, text: 'I let a point go if pressing it would cost goodwill.' },
  { id: 'dir-6', dimension: 'directness', direction: -1, text: 'I frame disagreement as a question rather than a statement.' },

  // --- social energy --------------------------------------------------------
  { id: 'soc+1', dimension: 'social_energy', direction: 1, text: 'I think out loud and refine my view while talking.' },
  { id: 'soc+2', dimension: 'social_energy', direction: 1, text: 'I naturally draw quieter people into the discussion.' },
  { id: 'soc+3', dimension: 'social_energy', direction: 1, text: 'I leave a busy meeting with more energy than I brought to it.' },
  { id: 'soc+4', dimension: 'social_energy', direction: 1, text: 'I would rather talk something through than write it up.' },
  { id: 'soc+5', dimension: 'social_energy', direction: 1, text: 'I introduce people to each other without being asked.' },
  { id: 'soc+6', dimension: 'social_energy', direction: 1, text: 'I fill a silence in a meeting rather than let it sit.' },
  { id: 'soc-1', dimension: 'social_energy', direction: -1, text: 'I prefer to think a position through before I voice it.' },
  { id: 'soc-2', dimension: 'social_energy', direction: -1, text: 'I do my best thinking away from the group.' },
  { id: 'soc-3', dimension: 'social_energy', direction: -1, text: 'I need recovery time after a day of back-to-back meetings.' },
  { id: 'soc-4', dimension: 'social_energy', direction: -1, text: 'I would rather send a considered note than make the call.' },
  { id: 'soc-5', dimension: 'social_energy', direction: -1, text: 'I stay quiet in large groups until I have something worth adding.' },
  { id: 'soc-6', dimension: 'social_energy', direction: -1, text: 'I let a silence run if people are still thinking.' },

  // --- pace -----------------------------------------------------------------
  { id: 'pac+1', dimension: 'pace', direction: 1, text: 'I would rather decide now and adjust than wait for more certainty.' },
  { id: 'pac+2', dimension: 'pace', direction: 1, text: 'I get restless when a decision sits open for another week.' },
  { id: 'pac+3', dimension: 'pace', direction: 1, text: 'I start on something before the plan is fully settled.' },
  { id: 'pac+4', dimension: 'pace', direction: 1, text: 'I push for a date on the calendar early in the conversation.' },
  { id: 'pac+5', dimension: 'pace', direction: 1, text: 'I make the call quickly when the group is stuck.' },
  { id: 'pac+6', dimension: 'pace', direction: 1, text: 'I would rather ship a rough version than delay a good one.' },
  { id: 'pac-1', dimension: 'pace', direction: -1, text: 'I want to sit with a decision before I commit to it.' },
  { id: 'pac-2', dimension: 'pace', direction: -1, text: 'I would rather be late and right than early and wrong.' },
  { id: 'pac-3', dimension: 'pace', direction: -1, text: 'I ask for time to review before agreeing in the room.' },
  { id: 'pac-4', dimension: 'pace', direction: -1, text: 'I slow a conversation down when it is moving faster than the evidence.' },
  { id: 'pac-5', dimension: 'pace', direction: -1, text: 'I revisit a choice once more before it becomes final.' },
  { id: 'pac-6', dimension: 'pace', direction: -1, text: 'I prefer a longer runway to a faster start.' },

  // --- detail ---------------------------------------------------------------
  { id: 'det+1', dimension: 'detail', direction: 1, text: 'I want to see the underlying numbers before I accept a conclusion.' },
  { id: 'det+2', dimension: 'detail', direction: 1, text: 'I notice the inconsistency in a document before I notice the argument.' },
  { id: 'det+3', dimension: 'detail', direction: 1, text: 'I ask about the edge cases early.' },
  { id: 'det+4', dimension: 'detail', direction: 1, text: 'I read the appendix.' },
  { id: 'det+5', dimension: 'detail', direction: 1, text: 'I would rather over-prepare than be caught without a detail.' },
  { id: 'det+6', dimension: 'detail', direction: 1, text: 'I check the assumptions behind a forecast before discussing the forecast.' },
  { id: 'det-1', dimension: 'detail', direction: -1, text: 'I want the headline first and the supporting detail only if I ask for it.' },
  { id: 'det-2', dimension: 'detail', direction: -1, text: 'I lose patience when a discussion stays in the weeds.' },
  { id: 'det-3', dimension: 'detail', direction: -1, text: 'I work from the shape of a problem rather than its specifics.' },
  { id: 'det-4', dimension: 'detail', direction: -1, text: 'I trust a summary from someone competent without auditing it.' },
  { id: 'det-5', dimension: 'detail', direction: -1, text: 'I would rather discuss where this goes than how it was built.' },
  { id: 'det-6', dimension: 'detail', direction: -1, text: 'I skip to the recommendation in a long document.' },

  // --- decision style -------------------------------------------------------
  { id: 'dec+1', dimension: 'decision_style', direction: 1, text: 'I want a comparison before I choose between two options.' },
  { id: 'dec+2', dimension: 'decision_style', direction: 1, text: 'I change my mind when the data says something different.' },
  { id: 'dec+3', dimension: 'decision_style', direction: 1, text: 'I ask what would have to be true for this to work.' },
  { id: 'dec+4', dimension: 'decision_style', direction: 1, text: 'I want to see how a similar decision played out before.' },
  { id: 'dec+5', dimension: 'decision_style', direction: 1, text: 'I am uncomfortable committing on a strong argument alone.' },
  { id: 'dec+6', dimension: 'decision_style', direction: 1, text: 'I look for the measurement before the discussion.' },
  { id: 'dec-1', dimension: 'decision_style', direction: -1, text: 'I can usually tell early which option is the right one.' },
  { id: 'dec-2', dimension: 'decision_style', direction: -1, text: 'I weigh who is making the case as much as the case itself.' },
  { id: 'dec-3', dimension: 'decision_style', direction: -1, text: 'I trust my read of a situation when the data is thin.' },
  { id: 'dec-4', dimension: 'decision_style', direction: -1, text: 'I decide on judgment and find the supporting evidence after.' },
  { id: 'dec-5', dimension: 'decision_style', direction: -1, text: 'I would rather move on a strong instinct than wait for proof.' },
  { id: 'dec-6', dimension: 'decision_style', direction: -1, text: 'I give weight to how a decision will feel to the people affected.' },

  // --- change comfort -------------------------------------------------------
  { id: 'chg+1', dimension: 'change_comfort', direction: 1, text: 'I am drawn to the option nobody has tried yet.' },
  { id: 'chg+2', dimension: 'change_comfort', direction: 1, text: 'I would rather rebuild it than patch it again.' },
  { id: 'chg+3', dimension: 'change_comfort', direction: 1, text: 'I volunteer for the ambiguous piece of work.' },
  { id: 'chg+4', dimension: 'change_comfort', direction: 1, text: 'I get interested when the plan changes.' },
  { id: 'chg+5', dimension: 'change_comfort', direction: 1, text: 'I am comfortable committing before all the risks are mapped.' },
  { id: 'chg+6', dimension: 'change_comfort', direction: 1, text: 'I would rather take the bigger swing with the wider range of outcomes.' },
  { id: 'chg-1', dimension: 'change_comfort', direction: -1, text: 'I want the downside understood before we commit.' },
  { id: 'chg-2', dimension: 'change_comfort', direction: -1, text: 'I protect what is already working before adding something new.' },
  { id: 'chg-3', dimension: 'change_comfort', direction: -1, text: 'I ask what happens if this fails.' },
  { id: 'chg-4', dimension: 'change_comfort', direction: -1, text: 'I prefer the proven approach to the interesting one.' },
  { id: 'chg-5', dimension: 'change_comfort', direction: -1, text: 'I want a way back before I take the step forward.' },
  { id: 'chg-6', dimension: 'change_comfort', direction: -1, text: 'I am wary of changing something that is not currently broken.' },

  // --- conflict -------------------------------------------------------------
  { id: 'cnf+1', dimension: 'conflict', direction: 1, text: 'I will keep pressing a point that I think is being avoided.' },
  { id: 'cnf+2', dimension: 'conflict', direction: 1, text: 'I am comfortable being the only objection in the room.' },
  { id: 'cnf+3', dimension: 'conflict', direction: 1, text: 'I would rather have the argument now than the resentment later.' },
  { id: 'cnf+4', dimension: 'conflict', direction: 1, text: 'I challenge an idea hard to find out whether it holds.' },
  { id: 'cnf+5', dimension: 'conflict', direction: 1, text: 'I raise the uncomfortable question when nobody else will.' },
  { id: 'cnf+6', dimension: 'conflict', direction: 1, text: 'I do not mind a tense conversation if it settles something.' },
  { id: 'cnf-1', dimension: 'conflict', direction: -1, text: 'I look for the version of a decision everyone can live with.' },
  { id: 'cnf-2', dimension: 'conflict', direction: -1, text: 'I would rather find common ground than win the point.' },
  { id: 'cnf-3', dimension: 'conflict', direction: -1, text: 'I step in to lower the temperature when a discussion sharpens.' },
  { id: 'cnf-4', dimension: 'conflict', direction: -1, text: 'I follow up privately rather than confront someone in a group.' },
  { id: 'cnf-5', dimension: 'conflict', direction: -1, text: 'I let a smaller disagreement go to protect the working relationship.' },
  { id: 'cnf-6', dimension: 'conflict', direction: -1, text: 'I am uncomfortable when a meeting turns adversarial.' },

  // --- structure ------------------------------------------------------------
  { id: 'str+1', dimension: 'structure', direction: 1, text: 'I write an agenda before a meeting that matters.' },
  { id: 'str+2', dimension: 'structure', direction: 1, text: 'I want owners and dates written down before we leave the room.' },
  { id: 'str+3', dimension: 'structure', direction: 1, text: 'I work from a plan and track against it.' },
  { id: 'str+4', dimension: 'structure', direction: 1, text: 'I prepare what I am going to say in advance.' },
  { id: 'str+5', dimension: 'structure', direction: 1, text: 'I set up a process so the same decision does not get relitigated.' },
  { id: 'str+6', dimension: 'structure', direction: 1, text: 'I keep a running list rather than hold it in my head.' },
  { id: 'str-1', dimension: 'structure', direction: -1, text: 'I would rather read the room than follow the agenda.' },
  { id: 'str-2', dimension: 'structure', direction: -1, text: 'I adapt the plan as I go rather than maintain it.' },
  { id: 'str-3', dimension: 'structure', direction: -1, text: 'I do my best work without a fixed structure.' },
  { id: 'str-4', dimension: 'structure', direction: -1, text: 'I find detailed process slows the actual work down.' },
  { id: 'str-5', dimension: 'structure', direction: -1, text: 'I decide the order of a conversation once it has started.' },
  { id: 'str-6', dimension: 'structure', direction: -1, text: 'I would rather keep options open than lock a plan.' },
] as const

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

export interface Block {
  id: string
  index: number
  items: Item[]
}

/**
 * Deterministic block construction.
 *
 * Block i draws dimensions at offsets {0, 1, 3, 5} from position i. Those offsets
 * are pairwise distinct modulo 8, so every block always contains four different
 * dimensions. Over 24 blocks (three full cycles of the eight dimensions) each
 * dimension lands in exactly 12 slots.
 *
 * Within a dimension, successive slots alternate between the positive- and
 * negative-keyed item pools, which yields exactly 6 of each. Nothing here is
 * random: the same 24 blocks are produced on every run and on every machine, so
 * scores stay comparable within an instrument version.
 */
function buildBlocks(): Block[] {
  const OFFSETS = [0, 1, 3, 5]
  const dimIds = DIMENSIONS.map((d) => d.id)

  const pools: Record<DimensionId, { pos: Item[]; neg: Item[] }> = Object.fromEntries(
    dimIds.map((id) => [
      id,
      {
        pos: ITEMS.filter((i) => i.dimension === id && i.direction === 1),
        neg: ITEMS.filter((i) => i.dimension === id && i.direction === -1),
      },
    ]),
  ) as Record<DimensionId, { pos: Item[]; neg: Item[] }>

  // How many times each dimension has been used so far; parity picks the pool.
  const used: Record<DimensionId, number> = Object.fromEntries(dimIds.map((id) => [id, 0])) as Record<
    DimensionId,
    number
  >

  const blocks: Block[] = []
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const items: Item[] = []
    for (const offset of OFFSETS) {
      const dim = dimIds[(i + offset) % dimIds.length]!
      const n = used[dim]
      const pool = n % 2 === 0 ? pools[dim].pos : pools[dim].neg
      const item = pool[Math.floor(n / 2)]
      /* istanbul ignore next -- guarded by the balance unit tests */
      if (!item) throw new Error(`[atturel] instrument exhausted pool for ${dim} at slot ${n}`)
      items.push(item)
      used[dim] = n + 1
    }
    blocks.push({ id: `b${String(i + 1).padStart(2, '0')}`, index: i, items })
  }
  return blocks
}

export const BLOCKS: readonly Block[] = buildBlocks()

export const BLOCK_BY_ID: Record<string, Block> = Object.fromEntries(BLOCKS.map((b) => [b.id, b]))
