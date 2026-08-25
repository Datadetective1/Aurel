import 'server-only'
import { generateObject, type LanguageModel } from 'ai'
import { serverEnv, features } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { Generation, PromptModule } from './types'

/**
 * PROVIDER ABSTRACTION
 * =============================================================================
 * Atturel is not coupled to a single model vendor. A capability declares what it
 * needs (a schema, a prompt, a deterministic composer) and this module decides
 * how to satisfy it:
 *
 *   AI_PROVIDER=anthropic  ->  Claude via the Vercel AI SDK
 *   AI_PROVIDER=openai     ->  GPT via the Vercel AI SDK
 *   AI_PROVIDER=grounded   ->  deterministic composition from the user's evidence
 *
 * The grounded path is also the automatic fallback when a model call fails or
 * times out, so a provider outage degrades output quality rather than breaking
 * the product. Every result records which path produced it.
 *
 * Model SDKs are imported lazily so that a deployment with no AI key never pays
 * to load them, and so a missing optional dependency cannot break the build.
 * =============================================================================
 */

/** Hard ceiling on a single generation. Briefs stream progress, so this is generous. */
const GENERATION_TIMEOUT_MS = 45_000

/** Transient failures worth one more attempt. */
const MAX_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 600

export interface GenerateOptions {
  /** Overrides the configured model for this call. */
  model?: string
  /** Abort signal from the caller (e.g. a cancelled request). */
  signal?: AbortSignal
}

async function resolveModel(modelId: string): Promise<LanguageModel> {
  switch (serverEnv.AI_PROVIDER) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY })(modelId)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: serverEnv.OPENAI_API_KEY })(modelId)
    }
    default:
      throw new Error(`[atturel] no generative provider configured`)
  }
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('overloaded') ||
    message.includes('503') ||
    message.includes('econnreset') ||
    message.includes('fetch failed')
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run a capability and return validated, attributed output.
 *
 * This never throws for AI reasons: if generation is unavailable or fails, it
 * falls back to deterministic composition. It only throws if the composer itself
 * produces output that fails schema validation, which would be a code defect.
 */
export async function runPrompt<TInput, TOutput>(
  module: PromptModule<TInput, TOutput>,
  input: TInput,
  options: GenerateOptions = {},
): Promise<Generation<TOutput>> {
  const started = Date.now()
  const citations = module.cite(input)

  const composed = (reason: string): Generation<TOutput> => {
    const output = module.schema.parse(module.compose(input))
    return {
      output,
      citations,
      provenance: {
        provider: 'grounded',
        model: 'evidence-composer',
        promptVersion: module.version,
        latencyMs: Date.now() - started,
        groundedFallback: true,
        tokenUsage: null,
      },
    }
  }

  if (!features.generativeAI) {
    return composed('no provider configured')
  }

  const modelId = options.model ?? serverEnv.AI_MODEL
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS)
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout

    try {
      const model = await resolveModel(modelId)
      const result = await generateObject({
        model,
        schema: module.schema,
        system: module.system(input),
        prompt: module.user(input),
        abortSignal: signal,
        // Low temperature: this is advisory output about real people. We want
        // it stable and conservative, not creative.
        temperature: 0.3,
      })

      return {
        output: result.object,
        citations,
        provenance: {
          provider: serverEnv.AI_PROVIDER,
          model: modelId,
          promptVersion: module.version,
          latencyMs: Date.now() - started,
          groundedFallback: false,
          tokenUsage: {
            input: result.usage?.inputTokens ?? 0,
            output: result.usage?.outputTokens ?? 0,
          },
        },
      }
    } catch (error) {
      lastError = error
      // Deliberately logs the failure shape only. Prompt bodies contain private
      // relationship content and must never reach the logs.
      logger.warn('ai.generation_failed', {
        capability: module.id,
        promptVersion: module.version,
        provider: serverEnv.AI_PROVIDER,
        model: modelId,
        attempt,
        retryable: isRetryable(error),
        error: error instanceof Error ? error.name : 'unknown',
      })

      if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
        await sleep(RETRY_BASE_DELAY_MS * attempt)
        continue
      }
      break
    }
  }

  logger.warn('ai.fell_back_to_grounded', {
    capability: module.id,
    reason: lastError instanceof Error ? lastError.name : 'unknown',
  })
  return composed('generation failed')
}

/**
 * User-facing description of the current AI configuration. Surfaced in the UI so
 * a user always knows whether they are reading generated or composed output —
 * over-claiming here would undermine the whole evidence model.
 */
export function aiStatus() {
  return {
    generative: features.generativeAI,
    provider: features.generativeAI ? serverEnv.AI_PROVIDER : 'grounded',
    model: features.generativeAI ? serverEnv.AI_MODEL : 'evidence-composer',
    label: features.generativeAI
      ? 'Generated from your relationship record'
      : 'Composed directly from your relationship record',
  } as const
}
