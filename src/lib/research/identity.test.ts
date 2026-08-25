import { describe, expect, it } from 'vitest'
import { assessIdentity, needsReview, shouldAutoLink } from './identity'

/**
 * The wrong-person tests matter more than the right-person tests. Attributing
 * one John Smith's career to another is the failure that would make every
 * downstream brief confidently wrong about a real colleague.
 */

const maya = {
  fullName: 'Maya Chen',
  organization: 'Acme Corporation',
  jobTitle: 'VP Engineering',
  email: 'maya.chen@acme.com',
}

describe('assessIdentity', () => {
  it('treats a user-supplied URL as near-decisive', () => {
    const result = assessIdentity(
      maya,
      { title: 'Leadership', text: 'Our leadership team.', url: 'https://acme.com/leadership' },
      { userSuppliedUrl: true },
    )
    expect(result.status).toBe('probable')
    expect(shouldAutoLink(result)).toBe(true)
    expect(result.explanation).toMatch(/you provided this link/i)
  })

  it('links confidently when name, employer and domain all agree', () => {
    const result = assessIdentity(maya, {
      title: 'Maya Chen — VP Engineering',
      text: 'Maya Chen is VP Engineering at Acme Corporation.',
      url: 'https://acme.com/leadership/maya-chen',
      publisher: 'Acme Corporation',
    })
    expect(result.status).toBe('probable')
    expect(result.confidence).toBeGreaterThan(0.55)
    expect(result.signals.organizationDomainMatch).toBe(true)
  })

  it('refuses a source that never mentions the person', () => {
    const result = assessIdentity(maya, {
      title: 'Quarterly results',
      text: 'Acme Corporation announced quarterly results.',
      url: 'https://acme.com/press/q3',
    })
    expect(result.status).toBe('no_match')
    expect(shouldAutoLink(result)).toBe(false)
  })

  it('flags a same-name person at a different employer as conflicting', () => {
    // The John Smith problem, stated directly.
    const result = assessIdentity(
      { fullName: 'John Smith', organization: 'Boeing', jobTitle: 'Chief Engineer' },
      {
        title: 'John Smith joins Lockheed Martin',
        text: 'John Smith is Director of Programs at Lockheed Martin.',
        url: 'https://lockheedmartin.com/news/john-smith',
        publisher: 'Lockheed Martin',
      },
    )
    expect(result.status).toBe('conflicting')
    expect(shouldAutoLink(result)).toBe(false)
    expect(needsReview(result)).toBe(true)
  })

  it('marks a name-only match as ambiguous rather than linking it', () => {
    const result = assessIdentity(
      { fullName: 'Maya Chen', organization: 'Acme Corporation' },
      {
        title: 'Maya Chen on ceramics',
        text: 'Maya Chen discusses her ceramics practice.',
        url: 'https://artsblog.example/maya-chen',
      },
    )
    expect(shouldAutoLink(result)).toBe(false)
    expect(['ambiguous', 'no_match', 'conflicting']).toContain(result.status)
  })

  it('never auto-links on a name match alone', () => {
    const result = assessIdentity(
      { fullName: 'Maya Chen' },
      { title: 'Maya Chen', text: 'Maya Chen.', url: 'https://example.com/x' },
    )
    expect(shouldAutoLink(result)).toBe(false)
  })

  it('uses a corporate email domain as corroboration', () => {
    const result = assessIdentity(maya, {
      title: 'Maya Chen',
      text: 'Maya Chen leads engineering.',
      url: 'https://acme.com/team/maya',
    })
    expect(result.signals.emailDomainMatch).toBe(true)
  })

  it('ignores free-mail domains as an organisational signal', () => {
    const result = assessIdentity(
      { ...maya, email: 'maya.chen@gmail.com' },
      {
        title: 'Maya Chen',
        text: 'Maya Chen leads engineering at Acme Corporation.',
        url: 'https://gmail.com/maya',
      },
    )
    expect(result.signals.emailDomainMatch).toBeUndefined()
  })

  it('reports confidence within 0..1 for every outcome', () => {
    const cases = [
      assessIdentity(maya, { title: 'x', text: 'y', url: 'https://z.example' }),
      assessIdentity(maya, { title: 'Maya Chen', text: 'Maya Chen at Acme Corporation VP Engineering', url: 'https://acme.com/a' }, { userSuppliedUrl: true }),
    ]
    for (const result of cases) {
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('always explains itself', () => {
    const result = assessIdentity(maya, {
      title: 'Maya Chen — VP Engineering',
      text: 'Maya Chen is VP Engineering at Acme Corporation.',
      url: 'https://acme.com/leadership/maya-chen',
      publisher: 'Acme Corporation',
    })
    expect(result.explanation.length).toBeGreaterThan(10)
  })

  it('handles empty evidence without throwing', () => {
    expect(() => assessIdentity(maya, {})).not.toThrow()
    expect(assessIdentity(maya, {}).status).toBe('no_match')
  })
})
