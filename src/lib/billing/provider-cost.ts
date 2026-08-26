/**
 * PROVIDER COST ESTIMATION
 * =============================================================================
 * What a unit of work cost us, in millionths of a dollar.
 *
 * Estimates, and labelled as such everywhere. Real invoices include cached
 * input discounts, batch pricing and rounding we do not model, so treat these
 * as the right order of magnitude for unit economics rather than an accounting
 * record. The point is to answer "can we afford this plan" before a pilot, not
 * to reconcile a bill.
 *
 * Prices are per MILLION tokens, matching how the vendors publish them, and are
 * the figures current when automatic research shipped. They will drift. When
 * they do, only new rows change: `estimated_cost_micros` is written at the time
 * the work runs, so history keeps the cost it actually incurred.
 *
 * INTERNAL ONLY. No user-facing surface reads any of this. A user sees quotas
 * and plan limits; what a provider charged us is not their business and telling
 * them invites exactly the wrong conversation.
 * =============================================================================
 */

interface ModelPrice {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

const MODEL_PRICING: Record<string, ModelPrice> = {
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-opus-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
}

/**
 * Charged per request, not per result.
 *
 * Exa bills the call whether it returns ten strong sources or nothing, which is
 * why the research ladder stops early rather than walking every rung — see
 * MAX_SEARCH_REQUESTS in research/queries.ts.
 */
const SEARCH_PRICING: Record<string, number> = {
  exa: 0.005,
  brave: 0.005,
  serper: 0.001,
  mock: 0,
  none: 0,
}

/** The deterministic composer costs nothing, and must not look like it does. */
const FREE_MODELS = new Set(['evidence-composer', 'grounded'])

export interface CostInput {
  provider?: string | null
  model?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  searchRequests?: number | null
  searchProvider?: string | null
}

/**
 * Estimated cost in USD millionths.
 *
 * Integer micros rather than a float: a brief costs a fraction of a cent, and
 * summing thousands of small floats loses precision exactly where the answer
 * matters. Unknown models cost 0 rather than throwing — a missing price should
 * understate the bill visibly, not lose the usage row that came with it.
 */
export function estimateCostMicros(input: CostInput): number {
  let micros = 0

  const model = input.model ?? ''
  if (model && !FREE_MODELS.has(model)) {
    const price = MODEL_PRICING[model]
    if (price) {
      micros += ((input.inputTokens ?? 0) * price.input) / 1_000_000
      micros += ((input.outputTokens ?? 0) * price.output) / 1_000_000
    }
  }

  const searches = input.searchRequests ?? 0
  if (searches > 0) {
    const rate = SEARCH_PRICING[input.searchProvider ?? input.provider ?? ''] ?? 0
    micros += searches * rate
  }

  // Dollars so far; convert to micros and never return a fraction of one.
  return Math.round(micros * 1_000_000)
}

/** Whether a model has a price on file, so unpriced usage can be spotted. */
export function hasKnownPrice(model: string | null | undefined): boolean {
  if (!model) return false
  return FREE_MODELS.has(model) || model in MODEL_PRICING
}
