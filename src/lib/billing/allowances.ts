import { brand } from '@/lib/brand'
import { PLANS, type PlanDefinition } from './plans'

/**
 * WHAT EACH PLAN ACTUALLY ALLOWS, FOR THE PRICING PAGE
 * =============================================================================
 * Read from the plan definitions the product enforces, so the page cannot
 * promise a number the paywall does not honour. Only shipped capabilities are
 * listed: deep research, weekly intelligence and advanced memory are defined
 * in the plans but not built, so they are not advertised (owner decision,
 * 25 Oct 2026).
 * =============================================================================
 */

export interface AllowanceRow {
  label: string
  free: string
  pro: string
}

type Cell = (plan: PlanDefinition) => string

const count =
  (meter: keyof PlanDefinition['quotas'], unit = ''): Cell =>
  (plan) => {
    const value = plan.quotas[meter]
    if (value === null) return 'Unlimited'
    if (!value) return '—'
    return meter === 'transcription_seconds' ? `${value / 60} min` : `${value}${unit}`
  }

const included =
  (capability: keyof PlanDefinition['capabilities']): Cell =>
  (plan) =>
    plan.capabilities[capability] ? 'Included' : '—'

const ROWS: { label: string; cell: Cell }[] = [
  {
    label: 'Active people',
    cell: (plan) => (plan.limits.people === null ? 'Unlimited' : String(plan.limits.people)),
  },
  { label: 'AI meeting briefs a month', cell: count('meeting_brief') },
  { label: 'Quick Briefs', cell: count('quick_brief') },
  { label: 'People researched a month', cell: count('person_research') },
  { label: 'Conversations kept a month', cell: count('transcript_analysis') },
  { label: 'Voice transcription a month', cell: count('transcription_seconds') },
  { label: `Questions to ${brand.assistantName} a month`, cell: count('ai_coach_message') },
  { label: 'Messages adapted a month', cell: count('message_adaptation') },
  { label: 'Documents read a month', cell: count('document_analysis') },
  { label: 'Links and sources read a month', cell: count('source_ingest') },
  { label: 'Relationship Atlas', cell: included('relationshipAtlas') },
  { label: 'Calendar connection', cell: included('calendarIntegration') },
  { label: 'Export or delete everything', cell: included('dataExport') },
]

export function allowanceRows(): AllowanceRow[] {
  return ROWS.map(({ label, cell }) => ({
    label,
    free: cell(PLANS.free),
    pro: cell(PLANS.pro),
  }))
}
