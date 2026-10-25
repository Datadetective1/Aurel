import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * COMMERCIAL INTEGRITY
 * =============================================================================
 * What has to stay true for Atturel to take money honestly: paid capabilities
 * are refused by the server, not merely hidden; checkout charges what the page
 * shows; deletion stops billing first; the public pages carry no placeholder
 * and no unapproved promise.
 *
 * Source-reading assertions, like tests/unit/pilot-blockers: the behaviour
 * behind each is unit-tested in lib/billing, lib/account and lib/capture;
 * these make sure every door actually goes through it.
 * =============================================================================
 */

const SRC = join(__dirname, '..', '..', 'src')
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

/** The capability check comes before the first read of the record. */
function checksBefore(source: string, capability: string, firstRead: RegExp) {
  const s = code(source)
  const check = s.indexOf(`checkCapability('${capability}')`)
  const read = s.search(firstRead)
  expect(check, `checkCapability('${capability}') missing`).toBeGreaterThan(-1)
  expect(read).toBeGreaterThan(check)
}

describe('Pro capabilities are refused by the server, not just hidden', () => {
  it('the Atlas page checks the plan before reading the record', () => {
    checksBefore(
      read('app', '(app)', 'atlas', 'page.tsx'),
      'relationshipAtlas',
      /\.from\('people'\)/,
    )
  })

  it('the mobile Atlas route checks the plan before reading the record', () => {
    checksBefore(
      read('app', 'api', 'mobile', 'atlas', 'route.ts'),
      'relationshipAtlas',
      /\.from\('people'\)/,
    )
  })

  it('every calendar door goes through the capability check: connect, callback and sync', () => {
    // Calendar is on Free and Pro; the check stays so plan policy remains a
    // single line in lib/billing/plans.
    checksBefore(
      read('app', 'api', 'calendar', '[provider]', 'connect', 'route.ts'),
      'calendarIntegration',
      /authorizationUrl\(/,
    )
    checksBefore(
      read('app', 'api', 'calendar', '[provider]', 'callback', 'route.ts'),
      'calendarIntegration',
      /exchangeCode\(/,
    )
    checksBefore(
      read('app', '(app)', 'calendar-actions.ts'),
      'calendarIntegration',
      /syncCalendar\(supabase/,
    )
  })

  it('a pasted transcript on a person counts against the same allowance as a conversation', () => {
    const s = code(read('app', '(app)', 'people', 'research-actions.ts'))
    expect(s).toMatch(/kind === 'transcript' \? 'debrief' : 'researchPerson'/)
  })

  it('people, briefs, research, Ask and conversations stay metered on the server', () => {
    expect(code(read('app', '(app)', 'people', 'actions.ts'))).toContain('checkPersonLimit()')
    expect(code(read('app', '(app)', 'meetings', 'actions.ts'))).toContain(
      "checkCapability('meetingBrief', 'meeting_brief')",
    )
    expect(code(read('app', '(app)', 'people', 'research-actions.ts'))).toContain(
      "checkCapability('researchPerson', 'person_research')",
    )
    expect(code(read('app', '(app)', 'coach', 'actions.ts'))).toContain(
      "checkCapability('aiCoach', 'ai_coach_message')",
    )
    expect(code(read('app', '(app)', 'conversations', 'actions.ts'))).toContain(
      "checkCapability('debrief', 'transcript_analysis')",
    )
  })

  it('the mobile routes reuse the web actions, and so their checks', () => {
    expect(read('app', 'api', 'mobile', 'ask', 'route.ts')).toContain(
      "from '@/app/(app)/coach/actions'",
    )
    expect(read('app', 'api', 'mobile', 'conversations', 'route.ts')).toContain(
      'createConversationCore',
    )
  })
})

describe('checkout charges exactly what the page shows', () => {
  const actions = code(read('app', '(app)', 'settings', 'billing', 'actions.ts'))

  it('verifies the Stripe price against the offer before creating a session', () => {
    const verify = actions.indexOf('priceMatchesOffer(price, PRO_PRICE)')
    const create = actions.indexOf('checkout.sessions.create(')
    expect(verify).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(verify)
  })

  it('never writes an entitlement itself', () => {
    expect(actions).not.toMatch(/plan:\s*'pro'/)
  })

  it('offers no annual plan', () => {
    expect(actions).not.toMatch(/yearly|annual/i)
  })

  it('accepts no promotion codes until one is approved', () => {
    expect(actions).toContain('allow_promotion_codes: false')
  })
})

describe('the 14-day trial', () => {
  const claim = code(read('lib', 'billing', 'trial-claim.ts'))
  const actions = code(read('app', '(app)', 'settings', 'billing', 'actions.ts'))

  it('is the only entitlement written outside the webhook, onto an unused Free row, never as a paid plan', () => {
    expect(claim).toContain("status: 'trialing'")
    // `plan` stays Free: only the webhook writes a paid plan.
    expect(claim).not.toMatch(/plan:\s*'pro'/)
    for (const guard of [
      ".eq('plan', 'free')",
      ".is('trial_ends_at', null)",
      ".is('stripe_subscription_id', null)",
    ]) {
      expect(claim).toContain(guard)
    }
  })

  it('never touches Stripe: no card, and nothing there that a card update could start', () => {
    expect(claim).not.toMatch(/stripe\(\)/)
    const start = actions.slice(
      actions.indexOf('export async function startProTrial'),
      actions.indexOf('export async function startCheckout'),
    )
    expect(start).not.toMatch(/stripe\(\)|checkout\.sessions|customers\.create/)
  })

  it('has one expiry rule, and the offer switch can never end a running trial', () => {
    const trial = code(read('lib', 'billing', 'trial.ts'))
    const sources = code(read('lib', 'billing', 'sources.ts'))
    const entitlements = code(read('lib', 'billing', 'entitlements.ts'))
    expect(trial).toContain('export function trialRunning(')
    expect(sources).toContain('trialRunning(')
    // Access is computed from trial_ends_at alone: the rollback switch only
    // stops new trials (PRO_TRIAL_OFFER=off), it is not read where access is.
    for (const source of [trial, sources, entitlements]) {
      expect(source).not.toMatch(/proTrialOffer|trialOfferOpen|PRO_TRIAL_OFFER/)
    }
  })

  it('subscribing during it keeps the rest of it and states the terms on Stripe’s page', () => {
    expect(actions).toContain('trial_end:')
    expect(actions).toContain('custom_text:')
  })
})

describe('the webhook', () => {
  const route = code(read('app', 'api', 'stripe', 'webhook', 'route.ts'))

  it('verifies the signature on the raw body, then hands off to the ledgered core', () => {
    expect(route.indexOf('constructEventAsync(')).toBeLessThan(route.indexOf('processStripeEvent('))
    expect(route).toContain('await request.text()')
  })

  it('fails closed when the ledger is unavailable', () => {
    expect(route).toMatch(/billing\.webhook_ledger_unavailable[\s\S]{0,200}status: 500/)
  })
})

describe('deletion stops billing first, from every door', () => {
  it('the web action and the app route share one workflow', () => {
    expect(code(read('app', '(app)', 'settings', 'actions.ts'))).toContain(
      "deleteCurrentAccount({\n    via: 'web'",
    )
    const mobile = code(read('app', 'api', 'mobile', 'account', 'route.ts'))
    expect(mobile).toContain("via: 'ios'")
    expect(mobile).toMatch(/!== 'delete'/)
  })

  it('the app route is reachable before onboarding is finished', () => {
    expect(code(read('app', 'api', 'mobile', 'account', 'route.ts'))).not.toContain(
      'mobileContext()',
    )
  })

  it('the old in-place deletion is gone: no auth deletion outside the workflow', () => {
    expect(code(read('app', '(app)', 'settings', 'actions.ts'))).not.toContain('deleteUser(')
  })
})

describe('public pages make no unapproved claim and show no placeholder', () => {
  it('legal identity fields are unset rather than bracketed placeholders', () => {
    const brand = read('lib', 'brand', 'index.ts')
    expect(brand).not.toMatch(/\[Registered address|\[Governing jurisdiction/)
  })

  it('the pricing page shows founding scarcity, a "was" price or a lock only when configured', () => {
    const pricing = code(read('app', '(marketing)', 'pricing', 'page.tsx'))
    expect(pricing).not.toMatch(/first \d+ members/)
    expect(pricing).toMatch(/FOUNDING_OFFER\.referencePriceCents \?/)
    expect(pricing).not.toMatch(/a year, saving/)
  })

  it('settings no longer promises a weekly summary that is never sent', () => {
    expect(read('components', 'app', 'settings-forms.tsx')).not.toMatch(
      /weekly relationship summary/,
    )
  })
})

describe('customers do not see infrastructure', () => {
  const customerFacing = [
    ['app', '(app)', 'settings', 'actions.ts'],
    ['app', 'api', 'conversations', 'transcribe', 'route.ts'],
    ['app', 'api', 'debrief', 'transcribe', 'route.ts'],
    ['lib', 'capture', 'transcribe.server.ts'],
    ['components', 'app', 'calendar-connections.tsx'],
    ['app', '(app)', 'settings', 'billing', 'actions.ts'],
  ]
  it.each(customerFacing)(
    '%s/%s/%s has no deployment or configuration wording in its messages',
    (...parts) => {
      const strings =
        code(read(...(parts as string[]))).match(/'[^'\n]{12,}'|"[^"\n]{12,}"|`[^`\n]{12,}`/g) ?? []
      for (const s of strings) {
        if (/^['"`](billing|account|transcribe|capture|entitlements|usage)\.[a-z_]+['"`]$/.test(s))
          continue
        expect(s).not.toMatch(
          /this deployment|is not configured|not configured on|at the provider|Payments are not connected/i,
        )
      }
    },
  )
})

describe('the transcription allowance is enforced on the server, before audio leaves', () => {
  const meter = code(read('lib', 'capture', 'transcribe.server.ts'))

  it('checks the allowance against the measured duration before calling the provider', () => {
    const check = meter.indexOf('checkTranscriptionAllowance(duration.seconds)')
    const call = meter.indexOf('transcribeAudio({')
    expect(check).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(check)
  })

  it('every transcription route goes through the metered path and answers in product language', () => {
    for (const parts of [
      ['app', 'api', 'conversations', 'transcribe', 'route.ts'],
      ['app', 'api', 'debrief', 'transcribe', 'route.ts'],
      ['app', 'api', 'capture', 'segments', '[id]', 'transcribe', 'route.ts'],
    ]) {
      const s = code(read(...parts))
      expect(s).toContain('transcribeAndMeter(')
      expect(s).not.toContain('transcribeAudio(')
    }
    expect(code(read('app', 'api', 'conversations', 'transcribe', 'route.ts'))).toMatch(
      /code: 'allowance'/,
    )
  })

  it('a segmented upload is refused before any byte is stored when the month is used up', () => {
    const s = code(read('app', 'api', 'capture', 'segments', 'route.ts'))
    expect(s.indexOf('checkTranscriptionAllowance(')).toBeLessThan(
      s.indexOf('requestSegmentUpload('),
    )
  })

  it('uses one supported model, with no deprecated fallback', () => {
    const t = code(read('lib', 'ai', 'transcribe.ts'))
    expect(t).toContain("TRANSCRIPTION_MODEL = 'gpt-transcribe'")
    expect(t).not.toMatch(/'gpt-4o-transcribe'/)
  })
})
