/**
 * AI CONNECTIVITY CHECK
 * =============================================================================
 * Answers one question: can this deployment actually reach a model and get a
 * schema-valid object back?
 *
 * A script rather than a route, deliberately. An endpoint that proves the key
 * works is also an endpoint that burns the key for anyone who finds it, and it
 * would have to live behind auth to be safe — at which point it is harder to
 * run than this.
 *
 *   npx tsx scripts/ai-check.ts
 *
 * Reads the same env the app does, so it exercises the real provider
 * resolution rather than a parallel copy of it. Prints no key material.
 * =============================================================================
 */
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

/** Flattens a provider error onto one line. No escape sequences: this file
 *  has been mangled by tooling before, and a broken `\n` is silent. */
const collapse = (message: string) =>
  message.slice(0, 400).split(/[\s]+/u).join(' ').trim()

async function main() {
  const { aiModel, aiProvider, features } = await import('../src/lib/env')

  console.log('provider resolved :', aiProvider)
  console.log('model resolved    :', aiModel)
  console.log('generative active :', features.generativeAI)
  console.log(
    'key present       :',
    aiProvider === 'openai'
      ? Boolean(process.env.OPENAI_API_KEY)
      : aiProvider === 'anthropic'
        ? Boolean(process.env.ANTHROPIC_API_KEY)
        : false,
  )

  if (!features.generativeAI) {
    console.log('No provider active — the deterministic composer is what runs.')
    console.log('Set OPENAI_API_KEY (or ANTHROPIC_API_KEY) and run again.')
    process.exit(0)
  }

  const { generateObject } = await import('ai')

  const model =
    aiProvider === 'openai'
      ? (await import('@ai-sdk/openai')).createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(
          aiModel,
        )
      : (await import('@ai-sdk/anthropic')).createAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        })(aiModel)

  // The real schemas, not a toy one. A hand-written test object proves only
  // that the network works; these are the shapes that actually decide whether
  // a brief generates or silently falls back to the composer, and OpenAI's
  // strict mode rejects schemas the SDK will happily construct.
  const { meetingBriefSchema } = await import('../src/lib/ai/prompts/meeting-brief')
  const { debriefSchema } = await import('../src/lib/ai/prompts/debrief')
  const { sourceExtractionSchema } = await import('../src/lib/ai/prompts/source-extraction')

  console.log('')
  const cases = [
    {
      name: 'meeting_brief',
      schema: meetingBriefSchema,
      prompt:
        'Draft a brief for a 30-minute check-in with one participant, Dana Okoye, ' +
        'Head of Platform at Northwind. The only recorded evidence is that she ' +
        'asked for utilisation numbers last week. Do not invent anything else.',
    },
    {
      name: 'debrief',
      schema: debriefSchema,
      prompt:
        'Extract structured notes from: "Spoke with Dana. She pushed back on the ' +
        'timeline citing the compliance deadline. I owe her the utilisation ' +
        'numbers by Friday."',
    },
    {
      name: 'source_extraction',
      schema: sourceExtractionSchema,
      prompt:
        'Extract professional facts from: "Dana Okoye has been Head of Platform ' +
        'at Northwind since 2021. She previously led infrastructure at Aerial."',
    },
  ]

  let failed = 0

  for (const testCase of cases) {
    const started = Date.now()
    try {
      const result = await generateObject({
        model,
        schema: testCase.schema,
        system:
          'You produce structured output only. Never state as fact anything not ' +
          'present in the input.',
        prompt: testCase.prompt,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(60_000),
      })

      const usage = result.usage
      console.log(
        `  PASS  ${testCase.name.padEnd(18)} ${String(Date.now() - started).padStart(6)}ms  ` +
          `in ${usage?.inputTokens ?? 0} / out ${usage?.outputTokens ?? 0}`,
      )
    } catch (error) {
      failed += 1
      // Name and message only. Provider errors can echo the request body back,
      // and the request body is the user's relationship data.
      console.error(
        `  FAIL  ${testCase.name.padEnd(18)} ${error instanceof Error ? error.name : 'unknown'}`,
      )
      console.error(
        `        ${error instanceof Error ? collapse(error.message) : ''}`,
      )
    }
  }

  if (failed > 0) {
    console.error('')
    console.error(
      `${failed} of ${cases.length} schemas failed. In production these would not ` +
        `surface as errors — each one falls back to the deterministic composer, ` +
        `so the product keeps working and the AI quietly does not.`,
    )
    process.exit(1)
  }

  console.log('')
  console.log(
    `PASS — ${aiProvider}/${aiModel} reachable, and every production schema ` +
      `round-trips under strict validation.`,
  )
}

void main()
