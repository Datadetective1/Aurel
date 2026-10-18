/**
 * Onboarding constants and pure helpers.
 *
 * Kept out of `actions.ts` because a `'use server'` module may only export async
 * functions — every non-async export there becomes a build error.
 */

/**
 * Every onboarding stage this build knows.
 *
 * Kept whole because `onboarding_stage` is a stored text column: accounts that
 * signed up under the longer flow can be parked on any of these, and each must
 * still resolve to a real route. What is *required* is a separate, much shorter
 * list -- see REQUIRED_STEPS.
 *
 * `appearance` used to sit here, between coaching and the assessment. It asked
 * for a theme and a coaching style — a preference about screens the user had
 * not seen yet. Both fields default sensibly in the database and both are
 * editable at Settings → Appearance & voice.
 */
export const ONBOARDING_STEPS = [
  'welcome',
  'about',
  'intent',
  'frameworks',
  'coaching',
  'assessment',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/**
 * What a new account must do before it reaches the product: one screen.
 *
 * A fresh-user walkthrough counted seven screens and six questions between
 * confirming an email and seeing Today -- goals, past assessments, coaching
 * history, the Interaction Profile and a long result -- before the user had
 * prepared for a single meeting. The welcome screen now *is* the identity
 * step: a name and a time zone (detected), with role and company optional.
 * Everything after it is enrichment.
 */
export const REQUIRED_STEPS = ['welcome'] as const satisfies readonly OnboardingStep[]

/**
 * Optional tailoring, offered after the product has done something useful and
 * skippable as a group at every step ("Finish later").
 *
 * Not deleted: nothing else in the product collects goals, prior frameworks or
 * coaching context, and the Interaction Profile is a real capability. Answers
 * already given are kept exactly as they are.
 */
export const ENRICHMENT_STEPS = [
  'intent',
  'frameworks',
  'coaching',
  'assessment',
] as const satisfies readonly OnboardingStep[]

export type EnrichmentStep = (typeof ENRICHMENT_STEPS)[number]

export function isEnrichmentStep(step: string): step is EnrichmentStep {
  return (ENRICHMENT_STEPS as readonly string[]).includes(step)
}

/** The next tailoring step, or null once the group is done. */
export function nextEnrichmentStep(current: EnrichmentStep): EnrichmentStep | null {
  const index = ENRICHMENT_STEPS.indexOf(current)
  return ENRICHMENT_STEPS[index + 1] ?? null
}

/** Route for a given stage. */
export function stepPath(step: OnboardingStep): string {
  return step === 'welcome' ? '/onboarding' : `/onboarding/${step}`
}

/**
 * The step after this one, in the full historical sequence.
 *
 * Retained for resuming accounts parked mid-way through the old flow. A retired
 * or unknown stage is a stage the user already passed, so it advances to the
 * last one rather than back to the welcome screen.
 */
export function nextStep(current: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(current)
  if (index === -1) return ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]!
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]!
}

/** Shared shape returned by every onboarding step action. */
export interface StepState {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export const INTENTS = [
  { value: 'prepare_meetings', label: 'Prepare for important meetings' },
  { value: 'communicate_coworkers', label: 'Communicate better with the people I work with' },
  { value: 'better_manager', label: 'Become a better manager' },
  { value: 'difficult_conversations', label: 'Navigate difficult conversations' },
  { value: 'strengthen_relationships', label: 'Strengthen key professional relationships' },
  { value: 'executive_communication', label: 'Improve how I communicate with executives' },
  { value: 'sell_negotiate', label: 'Sell and negotiate better' },
  { value: 'customer_relationships', label: 'Improve customer relationships' },
  { value: 'understand_workstyle', label: 'Understand my own workstyle' },
  { value: 'other', label: 'Something else' },
] as const

export const FRAMEWORKS = [
  { value: 'disc', label: 'DISC' },
  { value: 'big_five', label: 'Big Five' },
  { value: 'mbti', label: 'Myers-Briggs (MBTI)' },
  { value: 'enneagram', label: 'Enneagram' },
  { value: 'clifton', label: 'CliftonStrengths' },
  { value: 'other', label: 'Something else' },
  { value: 'none', label: 'None of these' },
] as const

export const COACHING_CONTEXTS = [
  { value: 'current_coach', label: 'I work with a professional coach now' },
  { value: 'past_coach', label: 'I have worked with a coach before' },
  { value: 'company_coaching', label: 'My company provides coaching' },
  { value: 'mentor', label: 'I have a mentor, nothing formal' },
  { value: 'ai_coaching', label: 'I use AI tools for advice' },
  { value: 'none', label: 'I have not used coaching' },
] as const

export const COACHING_STYLES = [
  { value: 'concise', label: 'Concise', hint: 'The shortest useful answer.' },
  { value: 'balanced', label: 'Balanced', hint: 'A line or two per point.' },
  { value: 'detailed', label: 'Detailed', hint: 'Fuller reasoning and examples.' },
  { value: 'challenging', label: 'Challenging', hint: 'Names the weakest part of your plan.' },
  { value: 'supportive', label: 'Supportive', hint: 'Leads with what you have going for you.' },
] as const
