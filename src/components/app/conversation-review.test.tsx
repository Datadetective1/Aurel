// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DecisionRecord } from '@/lib/conversations/queries'

/**
 * FINDING 8.7 ON THE WEB REVIEW
 * =============================================================================
 * The clear decision starts ticked and reads as a decision. Every proposal,
 * including one written before the fix at the old composer's 0.7, says
 * "Proposed, not decided", never "Likely", and starts unticked -- so keeping
 * the defaults submits only the decision.
 * =============================================================================
 */

vi.mock('@/app/(app)/conversations/actions', () => ({ submitReview: vi.fn() }))

const { ConversationReview } = await import('./conversation-review')

afterEach(cleanup)

function decision(id: string, description: string, confidence: number, excerpt: string) {
  return {
    id,
    description,
    context: null,
    decidedOn: '2026-09-10',
    reviewStatus: 'proposed',
    confidence,
    excerpt,
    interactionId: 'c-1',
    interactionTitle: 'Launch and vendor',
    people: [],
  } satisfies DecisionRecord
}

const DECISIONS: DecisionRecord[] = [
  decision(
    'd-decided',
    'We decided to move the launch to March.',
    0.7,
    'Alex Rivera: We decided to move the launch to March.',
  ),
  decision(
    'd-suggested',
    "I'd suggest going with vendor B.",
    0.5,
    "Ravi Menon: I'd suggest going with vendor B.",
  ),
  decision(
    'd-legacy',
    'Ravi recommended going with vendor B.',
    0.7,
    'Jason: Ravi recommended going with vendor B.',
  ),
]

async function show(decisions = DECISIONS) {
  const view = render(
    <ConversationReview interactionId="c-1" loops={[]} decisions={decisions} participants={[]} />,
  )
  return view.container.querySelector('form')!
}

describe('decisions and proposals in Review', () => {
  it('starts only the clear decision ticked', async () => {
    await show()
    const box = (id: string) =>
      screen.getAllByRole('checkbox').find((b) => (b as HTMLInputElement).value === id) as
        HTMLInputElement | undefined
    expect(box('d-decided')?.checked).toBe(true)
    expect(box('d-suggested')?.checked).toBe(false)
    expect(box('d-legacy')?.checked).toBe(false)
  })

  it('labels each proposal plainly, and never as likely', async () => {
    await show()
    expect(screen.getAllByText('Proposed, not decided')).toHaveLength(2)
    expect(screen.getAllByText('Likely')).toHaveLength(1)
    expect(screen.getAllByLabelText('What was proposed')).toHaveLength(2)
    expect(screen.getAllByLabelText('What was decided')).toHaveLength(1)
    expect(screen.getByText('Decisions and proposals')).toBeTruthy()
  })

  it('keeping the defaults submits only the decision', async () => {
    const form = await show()
    expect(new FormData(form).getAll('keepDecision')).toEqual(['d-decided'])
  })

  it('with no proposals, the section reads as before', async () => {
    await show([DECISIONS[0]!])
    expect(screen.getByText('A decision')).toBeTruthy()
    expect(screen.queryByText('Proposed, not decided')).toBeNull()
  })
})

describe('every kind of proposal, each stored as confidently as a decision', () => {
  // All at 0.9, as a model that got them wrong would leave them.
  const KINDS: [string, string][] = [
    ['suggestion', "I'd suggest going with vendor B."],
    ['recommendation', 'Ravi recommended going with vendor B.'],
    ['hypothetical', 'What if we moved the launch to March?'],
    ['condition', 'If the launch moves to March, marketing needs a new date.'],
    ['open question', 'Should we go with vendor B?'],
    ['not decided yet', "We haven't decided on the vendor yet."],
  ]
  const rows = [
    decision(
      'd-reasoned',
      'Go with vendor B',
      0.9,
      'We agreed to go with vendor B because it could scale.',
    ),
    ...KINDS.map(([kind, words]) => decision(`d-${kind}`, words, 0.9, words)),
  ]

  it('each starts unticked and says "Proposed, not decided"', async () => {
    await show(rows)
    for (const [kind] of KINDS) {
      const box = screen
        .getAllByRole('checkbox')
        .find((b) => (b as HTMLInputElement).value === `d-${kind}`) as HTMLInputElement
      expect(box.checked).toBe(false)
    }
    expect(screen.getAllByText('Proposed, not decided')).toHaveLength(KINDS.length)
  })

  it('a decision with a reason that softens nothing starts ticked, as a decision', async () => {
    const form = await show(rows)
    expect(new FormData(form).getAll('keepDecision')).toEqual(['d-reasoned'])
    expect(screen.getAllByLabelText('What was decided')).toHaveLength(1)
    expect(screen.getAllByText('Likely')).toHaveLength(1)
  })
})
