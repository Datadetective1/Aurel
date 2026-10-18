import { ENRICHMENT_STEPS, type EnrichmentStep } from '@/lib/onboarding'

/**
 * Progress through the optional tailoring steps.
 *
 * Says "optional" before it says anything else. These steps come after the
 * product has been used, and a progress bar that reads like a gate would undo
 * the point of moving them there. The count is shown because it is short and
 * honest: four steps, the last one six questions.
 */
export function OnboardingProgress({ step }: { step: EnrichmentStep | 'reveal' }) {
  const index = step === 'reveal' ? ENRICHMENT_STEPS.length : ENRICHMENT_STEPS.indexOf(step) + 1
  const total = ENRICHMENT_STEPS.length

  return (
    <div className="mb-6">
      <p className="label text-ink-muted">
        Optional · tailoring {Math.min(index, total)} of {total}
      </p>
      <div className="bg-line mt-2.5 h-px w-full overflow-hidden" aria-hidden="true">
        <div
          className="bg-accent-graphic h-full transition-[width] duration-500 ease-[var(--ease-out-quint)]"
          style={{ width: `${Math.round((Math.min(index, total) / total) * 100)}%` }}
        />
      </div>
    </div>
  )
}
