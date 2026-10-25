import { describe, expect, it } from 'vitest'
import { allowanceRows } from './allowances'

/**
 * The pricing page's allowance table is read from the plans the paywall
 * enforces, and lists only what has shipped. Allowances are unchanged by the
 * trial work (owner decision, 25 Oct 2026); this pins them.
 */
describe('the allowances the pricing page shows', () => {
  const rows = Object.fromEntries(allowanceRows().map((r) => [r.label, [r.free, r.pro]]))

  it('are the enforced Free and Pro allowances, unchanged', () => {
    expect(rows).toEqual({
      'Active people': ['5', 'Unlimited'],
      'AI meeting briefs a month': ['3', '150'],
      'Quick Briefs': ['Unlimited', 'Unlimited'],
      'People researched a month': ['3', '60'],
      'Conversations kept a month': ['10', '60'],
      'Voice transcription a month': ['60 min', '600 min'],
      'Questions to Ask Atturel a month': ['20', '600'],
      'Messages adapted a month': ['5', '200'],
      'Documents read a month': ['2', '100'],
      'Links and sources read a month': ['15', '500'],
      'Relationship Atlas': ['—', 'Included'],
      'Calendar connection': ['Included', 'Included'],
      'Export or delete everything': ['Included', 'Included'],
    })
  })

  it('advertise nothing that has not shipped', () => {
    const labels = allowanceRows().map((r) => r.label.toLowerCase())
    for (const unbuilt of ['deep research', 'weekly', 'advanced memory', 'team', 'api']) {
      expect(labels.some((l) => l.includes(unbuilt))).toBe(false)
    }
  })
})
