import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Badge, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: brand.assessmentName,
  robots: { index: false, follow: false },
}

const CALIBRATION_LABEL: Record<string, string> = {
  very_accurate: 'Very accurate',
  mostly_accurate: 'Mostly accurate',
  partly_accurate: 'Partly accurate',
  not_accurate: 'Not accurate',
}

export default async function InteractionProfileSettingsPage() {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, archetype, completed_at, calibration, calibration_note')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div>
      <Eyebrow>{brand.assessmentName}</Eyebrow>

      {assessment ? (
        <>
          <p className="mt-4 font-display text-2xl text-ink">{assessment.archetype}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Completed {formatDate(assessment.completed_at)}.
          </p>

          {assessment.calibration ? (
            <div className="mt-6">
              <Eyebrow>Your verdict</Eyebrow>
              <div className="mt-2">
                <Badge tone="neutral">{CALIBRATION_LABEL[assessment.calibration]}</Badge>
              </div>
              {assessment.calibration_note ? (
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
                  &ldquo;{assessment.calibration_note}&rdquo;
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-muted">
                {brand.name} weights your correction above the instrument&rsquo;s own output.
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/onboarding/reveal">View my full profile</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/onboarding/assessment">Retake the assessment</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-secondary">
            You have not completed your {brand.assessmentName.toLowerCase()} yet. It takes about five
            minutes, and it lets guidance account for your own defaults rather than only the other
            person&rsquo;s.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/onboarding/assessment">Take it now</Link>
          </Button>
        </>
      )}

      <p className="mt-10 max-w-lg text-xs leading-relaxed text-ink-faint">
        The {brand.assessmentName} is a self-report personalisation tool for professional
        communication. It is not a clinical, diagnostic or psychometric instrument, and it must not
        be used to assess anyone&rsquo;s suitability for a role.
      </p>
    </div>
  )
}
