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
      assessIdentity(
        maya,
        {
          title: 'Maya Chen',
          text: 'Maya Chen at Acme Corporation VP Engineering',
          url: 'https://acme.com/a',
        },
        { userSuppliedUrl: true },
      ),
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

/**
 * Cases a substring check got wrong, in both directions. Each one was measured
 * against the previous implementation before it was fixed.
 */
describe('assessIdentity: names and employers written differently', () => {
  const jordan = {
    fullName: 'Jordan Avery',
    organization: 'Meridian Systems',
    jobTitle: 'VP Engineering',
  }

  it('does not link a person whose surname merely starts with theirs', () => {
    const result = assessIdentity(jordan, {
      title: 'Jordan Averyson profile',
      text: 'Jordan Averyson works at Meridian Systems.',
      url: 'https://example.com/a',
    })
    expect(shouldAutoLink(result)).toBe(false)
    expect(result.status).toBe('no_match')
  })

  it('recognises them with a middle initial', () => {
    const result = assessIdentity(jordan, {
      title: 'Jordan P. Avery',
      text: 'Jordan P. Avery, VP Engineering, Meridian Systems',
      url: 'https://conf.example.org/speakers',
    })
    expect(result.status).toBe('probable')
    expect(result.signals.nameVariant).toBe(true)
  })

  it('recognises "Last, First" and asks rather than dropping it', () => {
    const result = assessIdentity(jordan, {
      title: 'Speakers',
      text: 'Avery, Jordan — Meridian Systems, VP Engineering',
      url: 'https://conf.example.org/speakers',
    })
    expect(result.signals.exactNameInText).toBe(true)
    expect(result.status).not.toBe('no_match')
  })

  it('recognises a name saved without its accents', () => {
    const result = assessIdentity(
      { fullName: 'Jose Alvarez', organization: 'Meridian Systems' },
      {
        title: 'José Álvarez',
        text: 'José Álvarez at Meridian Systems',
        url: 'https://a.example.org',
      },
    )
    expect(result.status).toBe('probable')
  })

  it('accepts the short form of their employer on its own site', () => {
    // Was "conflicting": "at Meridian" did not contain "meridian systems".
    const result = assessIdentity(jordan, {
      title: 'Jordan Avery',
      text: 'Jordan Avery is VP Engineering at Meridian.',
      url: 'https://meridian.com/team',
    })
    expect(result.status).toBe('probable')
    expect(result.signals.organizationPartialMatch).toBe(true)
    expect(result.signals.organizationDomainMatch).toBe(true)
  })

  it('does not call a talk "a different organisation"', () => {
    // Any "at" followed by a letter used to count as a competing employer.
    const result = assessIdentity(jordan, {
      title: 'Jordan Avery on platform teams',
      text: 'Jordan Avery spoke at the summit about platform engineering.',
      url: 'https://events.example.org/x',
    })
    expect(result.status).toBe('ambiguous')
  })

  it('still flags a named role at another company', () => {
    const result = assessIdentity(jordan, {
      title: 'Jordan Avery',
      text: 'Jordan Avery is CTO at Northwind Labs.',
      url: 'https://northwind.io/team',
    })
    expect(result.status).toBe('conflicting')
  })
})
