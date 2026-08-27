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
  // ATTUREL_EMAIL_* are the names the production deployment uses.
  // EMAIL_FROM_ADDRESS is the older name, still read so an existing deployment
  // does not silently lose its sender on upgrade.
  ATTUREL_EMAIL_FROM: optional,
  ATTUREL_EMAIL_REPLY_TO: optional,
  EMAIL_FROM_ADDRESS: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  STRIPE_PRICE_PRO_YEARLY: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  MICROSOFT_CLIENT_ID: optional,
  MICROSOFT_CLIENT_SECRET: optional,
  // Multitenant by default. Set to a specific tenant id only to restrict the
  // app to one Entra organisation.
  MICROSOFT_TENANT: z.preprocess(blankToUndefined, z.string().trim().min(1).default('common')),
  // Encrypts OAuth tokens at rest. Any random string of 32+ characters; it is
  // hashed to a key, so it does not need to be exactly 32 bytes. Without it,
  // calendar connection refuses to store a token rather than storing it in the
  // clear -- see lib/crypto.ts.
  TOKEN_ENCRYPTION_KEY: optional,
  MICROSOFT_TENANT_ID: z.preprocess(blankToUndefined, z.string().trim().min(1).catch('common')),
  SENTRY_DSN: optional,
  ALLOW_DB_SEED: z.string().catch('false'),

  // --- research providers ---
  // Discovery (name -> candidate URLs) needs a paid key. Analysing a URL the
  // user supplies does not, which is why research still works without these.
  // 'mock' is a deterministic development provider for tests; it refuses to
  // run in production, so it can never fabricate evidence for a real user.
  //
  // SEARCH_PROVIDER is OPTIONAL and normally left unset: the provider is
  // inferred from whichever key is present. Set it to force a choice when more
  // than one key exists, or to 'none' to switch discovery off while leaving the
  // keys in place. Requiring the name and the key to agree was a foot-gun -- the
  // same one that left OPENAI_API_KEY doing nothing for a day.
  SEARCH_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(['exa', 'brave', 'serper', 'mock', 'none']).optional(),
  ),
  EXA_API_KEY: optional,
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

/**
 * The sender addresses transactional mail actually goes out with.
 *
 * Resolved here rather than read at each call site, because getting this wrong
 * is invisible until nothing arrives: a `from` on a domain the provider has not
 * verified is rejected with a 403, and the Capabilities screen would still say
 * Email was connected. It happened — the deployment set ATTUREL_EMAIL_FROM on
 * atturel.com while the code only read EMAIL_FROM_ADDRESS and fell back to a
 * hardcoded address on a domain that was never registered.
 *
 * Both accept either a bare address or a full `Name <address>` string.
 */
export const emailFromOverride: string | undefined =
  serverEnv.ATTUREL_EMAIL_FROM ?? serverEnv.EMAIL_FROM_ADDRESS

export const emailReplyToOverride: string | undefined = serverEnv.ATTUREL_EMAIL_REPLY_TO

export type SearchProviderId = 'exa' | 'brave' | 'serper' | 'mock' | 'none'

/**
 * Which search provider is actually active.
 *
 * Inferred from the keys rather than requiring SEARCH_PROVIDER to agree with
 * them, for the same reason the AI provider is: a key that silently does
 * nothing, under a screen reporting the capability as unconfigured, is the
 * worst of both worlds.
 *
 * Exa is preferred when several keys are present because it is the provider
 * this pipeline is tuned for -- see `exaSearch` in research/providers.ts.
 * An explicit SEARCH_PROVIDER always wins, so 'none' remains a real off switch,
 * and naming a provider whose key is absent degrades to no discovery rather
 * than booting into certain failure.
 */
export function resolveSearchProviderId(input: {
  provider?: SearchProviderId
  exaKey?: string
  braveKey?: string
  serperKey?: string
}): SearchProviderId {
  if (input.provider === 'none') return 'none'
  // The deterministic development provider needs no key, and refuses to run in
  // production on its own account.
  if (input.provider === 'mock') return 'mock'
  if (input.provider === 'exa') return input.exaKey ? 'exa' : 'none'
  if (input.provider === 'brave') return input.braveKey ? 'brave' : 'none'
  if (input.provider === 'serper') return input.serperKey ? 'serper' : 'none'

  if (input.exaKey) return 'exa'
  if (input.braveKey) return 'brave'
  if (input.serperKey) return 'serper'
  return 'none'
}

export const searchProvider: SearchProviderId = resolveSearchProviderId({
  provider: serverEnv.SEARCH_PROVIDER,
  exaKey: serverEnv.EXA_API_KEY,
  braveKey: serverEnv.BRAVE_SEARCH_API_KEY,
  serperKey: serverEnv.SERPER_API_KEY,
})

/** Capability flags — the UI uses these to degrade honestly instead of erroring. */
export const features = {
  /** True when a real model is reachable; false means the grounded fallback. */
  generativeAI: aiProvider !== 'grounded',
  emailDelivery: Boolean(serverEnv.RESEND_API_KEY),
  billing: Boolean(serverEnv.STRIPE_SECRET_KEY),
  billingWebhooks: Boolean(serverEnv.STRIPE_SECRET_KEY && serverEnv.STRIPE_WEBHOOK_SECRET),
  // Calendar support is NOT a flag here. providerConfigured() in
  // lib/calendar/provider.ts is the single answer to "can this deployment
  // offer a calendar", because it is the one that agrees with lib/crypto about
  // what counts as a usable encryption key. These two flags duplicated it with
  // a looser presence check, went unused by anything, and would have drifted.
  /** Privileged server operations (webhooks, hard account deletion). */
  serviceRole: Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY),
  /** Automatic discovery of sources from a name alone. */
  researchDiscovery: searchProvider !== 'none',
  /** Analysing a user-supplied URL. Requires no credentials. */
  researchUrls: true,
} as const

export type Features = typeof features
