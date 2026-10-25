// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceRowData } from './source-controls'

/**
 * A SOURCE ROW ON THE WEB PERSON PAGE
 * =============================================================================
 * A held page is reviewed on its facts, each with its evidence level, before
 * anyone says it is them. A page the user marked as someone else stays that
 * way; "Reconsider" is offered on it, and only on it.
 * =============================================================================
 */

const reconsiderSourceMatch = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(app)/people/research-actions', () => ({
  confirmSourceMatch: vi.fn(),
  rejectSourceMatch: vi.fn(),
  deleteSource: vi.fn(),
  reconsiderSourceMatch: (...args: unknown[]) => reconsiderSourceMatch(...args),
}))

const { SourceRow } = await import('./source-controls')

afterEach(() => {
  cleanup()
  reconsiderSourceMatch.mockReset()
})

const BASE: SourceRowData = {
  id: 's-1',
  title: 'Dana Whitfield, VP Sales',
  url: 'https://northwind.example/dana',
  publisher: 'Northwind',
  author: null,
  sourceType: 'web_page',
  retrievedAt: '2026-10-25T09:00:00Z',
  publishedAt: null,
  accessStatus: 'identity_uncertain',
  identityStatus: 'unreviewed',
  factCount: 0,
  observationCount: 0,
}

const row = (source: Partial<SourceRowData>) =>
  render(
    <ul>
      <SourceRow source={{ ...BASE, ...source }} personId="p-1" personName="Dana Whitfield" />
    </ul>,
  )

describe('a page held for review', () => {
  it('shows what it would add, each with its evidence level, and asks first', async () => {
    await row({
      heldFacts: [
        {
          label: 'Current role',
          value: 'VP Sales',
          evidence: 'observed',
          excerpt: 'Dana is VP Sales',
        },
        { label: 'Prior role', value: 'Halcyon', evidence: 'inferred', excerpt: null },
      ],
    })
    expect(screen.getByText('Is this about Dana Whitfield?')).toBeTruthy()
    expect(screen.getByText('If it is them, this adds:')).toBeTruthy()
    expect(screen.getByText('Current role: VP Sales')).toBeTruthy()
    expect(screen.getByText('Observed')).toBeTruthy()
    expect(screen.getByText('Prior role: Halcyon')).toBeTruthy()
    expect(screen.getByText('Inferred')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Yes, this is them/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reconsider/ })).toBeNull()
  })
})

describe('a page marked as someone else', () => {
  it('stays marked; Reconsider is the one way back, and says what it does', async () => {
    reconsiderSourceMatch.mockResolvedValue({
      ok: true,
      message:
        'Read again. Check it here: nothing from it is in their record until you say it is them.',
    })
    await row({ identityStatus: 'no_match', reviewedByUser: true })

    expect(screen.getByText('Marked as someone else')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Yes, this is them/ })).toBeNull()
    expect(screen.getByText(/unless you reconsider it/)).toBeTruthy()
    expect(screen.getByText(/uses one source read from your plan/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Reconsider this page/ }))
    await waitFor(() => expect(reconsiderSourceMatch).toHaveBeenCalledWith('s-1', 'p-1'))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/until you say it is them/)
  })

  it('is not offered for a page research set aside on its own', async () => {
    await row({ identityStatus: 'no_match', reviewedByUser: false })
    expect(screen.queryByRole('button', { name: /Reconsider/ })).toBeNull()
  })

  it('is not offered for a page in the record', async () => {
    await row({ identityStatus: 'confirmed', reviewedByUser: true, accessStatus: 'analyzed' })
    expect(screen.queryByRole('button', { name: /Reconsider/ })).toBeNull()
  })
})
