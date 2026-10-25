// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * FINDING 5.7: ENTERING A PROFILE LINK NEVER STARTS RESEARCH
 * =============================================================================
 * Adding someone on the website with a profile link used to open their page
 * with `?research=1`, and research ran on arrival. The page now opens and
 * waits: research runs only from its button.
 * =============================================================================
 */

const redirect = vi.fn()
const researchPerson = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/people/p-new',
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/billing/entitlements', () => ({ checkPersonLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/organizations', () => ({ resolveOrganization: async () => 'org-1' }))
vi.mock('@/lib/workspace', () => ({
  ownership: async () => ({ user_id: 'u-1', workspace_id: 'ws-1', visibility: 'private' }),
  ownershipNoVisibility: async () => ({ user_id: 'u-1', workspace_id: 'ws-1' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'eq', 'is', 'ilike', 'or', 'limit', 'order', 'in'])
      chain[m] = () => chain
    chain.single = async () => ({ data: { id: 'p-new' }, error: null })
    chain.maybeSingle = async () => ({ data: null, error: null })
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
    return { from: () => chain }
  },
}))
vi.mock('@/app/(app)/people/research-actions', () => ({
  researchPerson: (...a: unknown[]) => researchPerson(...a),
  refineIdentityAndResearch: vi.fn(),
}))

afterEach(cleanup)

describe('adding someone with a profile link', () => {
  it('opens their page without asking for research', async () => {
    const { createPerson } = await import('./actions')
    const form = new FormData()
    form.set('fullName', 'Dana Whitfield')
    form.set('profileUrl', 'https://northwind.example/dana')
    await createPerson({}, form)
    expect(redirect).toHaveBeenCalledWith('/people/p-new')
    expect(researchPerson).not.toHaveBeenCalled()
  })

  it('their page does not run research on arrival; the button is there to press', async () => {
    const { ResearchPanel } = await import('@/components/app/research-panel')
    render(
      <ResearchPanel
        personId="p-new"
        personName="Dana Whitfield"
        canDiscover
        discoveryHint={null}
        hasProfileUrl
        lastResearchedAt={null}
        sourceCount={0}
        timeZone="UTC"
      />,
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(researchPerson).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /research/i })).toBeTruthy()
  })
})
