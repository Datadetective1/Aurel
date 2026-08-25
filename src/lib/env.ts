import { z } from 'zod'

/**
 * Environment validation.
 *
 * Two schemas, because the client bundle only ever sees NEXT_PUBLIC_* values and
 * Next.js inlines those at build time — they must be referenced as full literal
 * property accesses, never via a computed key.
 *
 * Failures are loud at boot rather than mysterious at request time.
 */

/**
 * An unset variable in a .env file is an empty string, not `undefined`, so a
 * bare `.optional()` would reject every commented-out integration key. Empty and
 * whitespace-only values are normalised to undefined before validation.
 */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const optional = z.preprocess(blankToUndefined, z.string().trim().min(1).optional())

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optional,
  // Left unset on purpose in most deployments: the provider is inferred from
  // whichever key is present (see `aiProvider` below). Set it explicitly only
  // to force a choice when more than one key exists, or to 'grounded' to turn
  // generation off while leaving the keys in place.
  AI_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['anthropic', 'openai', 'grounded']).optional(),
  ),
  // No default here. A single default cannot be right for both providers —
  // 'claude-opus-5' sent to OpenAI is simply a 404 — so the fallback is chosen
  // per provider once the provider is known.
  AI_MODEL: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  AI_EMBEDDING_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['anthropic', 'openai', 'none']).catch('none'),
  ),
  AI_EMBEDDING_MODEL: optional,
  ANTHROPIC_API_KEY: optional,
  OPENAI_API_KEY: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM_ADDRESS: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  STRIPE_PRICE_PRO_YEARLY: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  MICROSOFT_CLIENT_ID: optional,
  MICROSOFT_CLIENT_SECRET: optional,
  MICROSOFT_TENANT_ID: z.preprocess(blankToUndefined, z.string().trim().min(1).catch('common')),
  SENTRY_DSN: optional,
  ALLOW_DB_SEED: z.string().catch('false'),

  // --- research providers ---
  // Discovery (name -> candidate URLs) needs a paid key. Analysing a URL the
  // user supplies does not, which is why research still works without these.
  // 'mock' is a deterministic development provider for tests; it refuses to
  // run in production, so it can never fabricate evidence for a real user.
  SEARCH_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['brave', 'serper', 'mock', 'none']).catch('none'),
  ),
  BRAVE_SEARCH_API_KEY: optional,
  SERPER_API_KEY: optional,
})

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_SITE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optional,
  NEXT_PUBLIC_ANALYTICS_ENABLED: optional,
})

/** Client-safe config. Literal accesses so Next.js can inline them. */
export const publicEnv = (() => {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_ANALYTICS_ENABLED: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
  })

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(
      `[atturel] Missing or invalid public environment variables: ${missing}. ` +
        `Copy .env.example to .env.local and fill in the [CORE] values.`,
    )
  }
  return parsed.data
})()

/** Server-only config. Accessing this from a client component is a build error. */
export const serverEnv = serverSchema.parse(process.env)

/** The model used when a provider is active but AI_MODEL was not set. */
const DEFAULT_MODEL = {
  // Structured extraction at low temperature over evidence we supply — not
  // open-ended reasoning. A fast, inexpensive, temperature-respecting model
  // suits this better than a reasoning model, and keeps a brief quick enough
  // to read before a meeting. Override with AI_MODEL to change it.
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-opus-5',
} as const

/**
 * Which generative provider is actually active, and on which model.
 *
 * Pure and exported so the resolution can be tested without reloading the
 * module under a mutated environment.
 *
 * The provider is inferred from the keys rather than requiring AI_PROVIDER to
 * agree with them. Requiring both was a foot-gun: setting only OPENAI_API_KEY
 * left the product silently running the deterministic composer, with nothing
 * to indicate the key was doing nothing.
 *
 * An explicit AI_PROVIDER still wins, so 'grounded' remains the way to switch
 * generation off without removing credentials — and naming a provider whose
 * key is absent falls back rather than booting into certain failure.
 */
export function resolveAI(input: {
  provider?: 'anthropic' | 'openai' | 'grounded'
  model?: string
  anthropicKey?: string
  openaiKey?: string
}): { provider: 'anthropic' | 'openai' | 'grounded'; model: string } {
  const provider = ((): 'anthropic' | 'openai' | 'grounded' => {
    if (input.provider === 'grounded') return 'grounded'
    if (input.provider === 'anthropic') return input.anthropicKey ? 'anthropic' : 'grounded'
    if (input.provider === 'openai') return input.openaiKey ? 'openai' : 'grounded'

    if (input.anthropicKey) return 'anthropic'
    if (input.openaiKey) return 'openai'
    return 'grounded'
  })()

  return {
    provider,
    // Never a Claude id on OpenAI, or the reverse.
    model: provider === 'grounded' ? 'evidence-composer' : (input.model ?? DEFAULT_MODEL[provider]),
  }
}

const resolvedAI = resolveAI({
  provider: serverEnv.AI_PROVIDER,
  model: serverEnv.AI_MODEL,
  anthropicKey: serverEnv.ANTHROPIC_API_KEY,
  openaiKey: serverEnv.OPENAI_API_KEY,
})

export const aiProvider = resolvedAI.provider
export const aiModel = resolvedAI.model

/** Capability flags — the UI uses these to degrade honestly instead of erroring. */
export const features = {
  /** True when a real model is reachable; false means the grounded fallback. */
  generativeAI: aiProvider !== 'grounded',
  emailDelivery: Boolean(serverEnv.RESEND_API_KEY),
  billing: Boolean(serverEnv.STRIPE_SECRET_KEY),
  billingWebhooks: Boolean(serverEnv.STRIPE_SECRET_KEY && serverEnv.STRIPE_WEBHOOK_SECRET),
  googleCalendar: Boolean(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET),
  microsoftCalendar: Boolean(serverEnv.MICROSOFT_CLIENT_ID && serverEnv.MICROSOFT_CLIENT_SECRET),
  /** Privileged server operations (webhooks, hard account deletion). */
  serviceRole: Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY),
  /** Automatic discovery of sources from a name alone. */
  researchDiscovery:
    (serverEnv.SEARCH_PROVIDER === 'brave' && Boolean(serverEnv.BRAVE_SEARCH_API_KEY)) ||
    (serverEnv.SEARCH_PROVIDER === 'serper' && Boolean(serverEnv.SERPER_API_KEY)),
  /** Analysing a user-supplied URL. Requires no credentials. */
  researchUrls: true,
} as const

export type Features = typeof features
