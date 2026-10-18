import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * RESEARCH IDENTITY RECOVERY
 * =============================================================================
 * Research correctly refused sources it could not confirm were about the
 * person. The fix is recovery, not a lower bar: ask for one identifying detail
 * and research again -- and never let a page the user marked "someone else" back
 * in by retyping its link.
 * =============================================================================
 */

const peopleUpdates: Record<string, unknown>[] = []
let rejectedLinks: { sources: { source_url: string } | null }[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'user-1' }) }))
vi.mock('@/lib/workspace', () => ({ getWorkspace: async () => ({ id: 'ws-1' }) }))
vi.mock('@/lib/organizations', () => ({ resolveOrganization: async () => 'org-1' }))
// Research itself is refused at the entitlement check, so these tests stop at
// the boundary they are about and never reach a provider.
vi.mock('@/lib/billing/entitlements', () => ({
  checkCapability: async () => ({ allowed: false, message: 'Research limit reached.' }),
  recordUsage: vi.fn(),
}))

function chain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) node[method] = () => node
  node.then = (resolve: (value: unknown) => unknown) => resolve(result)
  return node
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'source_person_links') return chain({ data: rejectedLinks, error: null })
      if (table === 'people') {
        return {
          update: (patch: Record<string, unknown>) => {
            peopleUpdates.push(patch)
            return chain({ error: null })
          },
        }
      }
      return chain({ data: null, error: null })
    },
  }),
}))

const { refineIdentityAndResearch } = await import('./research-actions')
const PERSON = '7f0d3c1e-5a4b-4c8d-9e2f-1a2b3c4d5e6f'

beforeEach(() => {
  peopleUpdates.length = 0
  rejectedLinks = []
})

describe('refineIdentityAndResearch', () => {
  it('asks for something before retrying', async () => {
    const result = await refineIdentityAndResearch({ personId: PERSON })
    expect(result.error).toMatch(/company, a role or a profile link/i)
    expect(peopleUpdates).toHaveLength(0)
  })

  it('writes only the details entered, then runs research again', async () => {
    const result = await refineIdentityAndResearch({ personId: PERSON, jobTitle: 'VP Engineering' })
    expect(peopleUpdates).toEqual([{ job_title: 'VP Engineering' }])
    // The research run happened, and was refused at its own gate -- proof the
    // retry goes through the same path, quotas included.
    expect(result.error).toBe('Research limit reached.')
  })

  it('resolves a company to an organization rather than storing free text on the person', async () => {
    await refineIdentityAndResearch({ personId: PERSON, organizationName: 'Ansys' })
    expect(peopleUpdates).toEqual([{ organization_id: 'org-1' }])
  })

  it('refuses a page the user already marked as somebody else, even written differently', async () => {
    rejectedLinks = [{ sources: { source_url: 'https://example.com/team/maya-chen' } }]
    const result = await refineIdentityAndResearch({
      personId: PERSON,
      profileUrl: 'https://example.com/team/maya-chen/',
    })
    expect(result.error).toMatch(/someone else/i)
    expect(peopleUpdates).toHaveLength(0)
  })

  it('rejects something that is not a web address', async () => {
    const result = await refineIdentityAndResearch({ personId: PERSON, profileUrl: 'maya chen' })
    expect(result.error).toMatch(/full web address/i)
    expect(peopleUpdates).toHaveLength(0)
  })
})
