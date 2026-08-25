/**
 * Onboarding constants and pure helpers.
 *
 * Kept out of `actions.ts` because a `'use server'` module may only export async
 * functions — every non-async export there becomes a build error.
 */

export const ONBOARDING_STEPS = [
  'welcome',
  'about',
  'intent',
  'frameworks',
  'coaching',
  'appearance',
  'assessment',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Route for a given stage. */
export function stepPath(step: OnboardingStep): string {
  return step === 'welcome' ? '/onboarding' : `/onboarding/${step}`
}

export function nextStep(current: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(current)
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
