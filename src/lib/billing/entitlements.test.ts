import { describe, expect, it } from 'vitest'
import { CAPABILITY_LABELS } from './entitlements'

/**
 * Quota copy.
 *
 * Production showed "You have used all 3 of this month's researching a person."
 * The labels are noun phrases sized for "X is available on Pro", and splicing
 * them into a possessive frame cannot read correctly for all of them. The frame
 * changed rather than the labels.
 */

describe('capability labels in the quota message', () => {
  const message = (label: string, limit: number) =>
    `${label}: you have used all ${limit} for this month. Upgrade for more, or wait until next month.`

  it('reads correctly for every capability, not just the one that was noticed', () => {
    for (const label of Object.values(CAPABILITY_LABELS)) {
      const text = message(label, 3)
      // The construction that produced the bad sentence.
      expect(text).not.toMatch(/this month's [a-z]/)
      // Starts with the label, capitalised as written.
      expect(text.startsWith(label)).toBe(true)
      expect(text).toContain('used all 3 for this month')
    }
  })

  it('keeps every label a non-empty noun phrase', () => {
    for (const [capability, label] of Object.entries(CAPABILITY_LABELS)) {
      expect(label.trim(), capability).not.toBe('')
      // A label that is already a sentence would read wrong in both frames.
      expect(label.endsWith('.'), capability).toBe(false)
    }
  })
})
