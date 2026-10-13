import { Compass, CalendarDays, Sparkles } from 'lucide-react'
import { QuietEmpty } from '@/components/visual/quiet-empty'
import { CAPABILITY_LABELS } from '@/lib/billing/entitlements'
import type { Capability } from '@/lib/billing/plans'

/**
 * A capability the account's plan does not include, said once and plainly:
 * what it is, that it is part of Pro, and the one place to change that. The
 * server has already refused the work; this is only the explanation.
 */
const ICON: Partial<Record<Capability, typeof Compass>> = {
  relationshipAtlas: Compass,
  calendarIntegration: CalendarDays,
}

export function PlanRequired({
  capability,
  className,
}: {
  capability: Capability
  className?: string
}) {
  return (
    <QuietEmpty
      className={className}
      icon={ICON[capability] ?? Sparkles}
      title={`${CAPABILITY_LABELS[capability]} is part of Pro`}
      body="Your record stays exactly as it is on every plan."
      action={{ label: 'See Pro', href: '/settings/billing' }}
    />
  )
}
