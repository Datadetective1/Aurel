import { describe, expect, it } from 'vitest'
import {
  countsAsPublicSource,
  factLabel,
  hostOf,
  matchStrength,
  nameExcerpt,
  reviewReason,
  reviewState,
} from './review'

/**
 * REVIEWING WHAT RESEARCH FOUND
 * =============================================================================
 * The app shows every page research found with where it stands. A page the
 * identity check only thinks may be them is waiting, never shown as in the
 * record; a page the user marked as someone else stays visible as theirs to
 * undo; a page set aside by the check alone is not offered at all.
 * =============================================================================
 */

const subject = { fullName: 'Dana Whitfield', organization: 'Northwind', jobTitle: 'VP Sales' }

describe('where a page stands', () => {
  it('a page held for review, or one the check was unsure of, is waiting', () => {
    for (const status of ['unreviewed', 'ambiguous', 'conflicting']) {
      expect(
        reviewState({ status, reviewed: false, accessStatus: 'identity_uncertain' }),
        status,
      ).toBe('waiting')
    }
  })

  it('a confirmed or linked page that was read is in the record', () => {
    expect(reviewState({ status: 'confirmed', reviewed: true, accessStatus: 'analyzed' })).toBe(
      'kept',
    )
    expect(reviewState({ status: 'probable', reviewed: false, accessStatus: 'analyzed' })).toBe(
      'kept',
    )
  })

  it('"not them" from the user stays visible; from the check alone it is not offered', () => {
    expect(reviewState({ status: 'no_match', reviewed: true, accessStatus: 'analyzed' })).toBe(
      'rejected',
    )
    expect(
      reviewState({ status: 'no_match', reviewed: false, accessStatus: 'identity_uncertain' }),
    ).toBeNull()
  })

  it('a page that could not be read is not offered as evidence', () => {
    for (const accessStatus of ['limited_access', 'login_required', 'paywall', 'error', null]) {
      expect(reviewState({ status: 'unreviewed', reviewed: false, accessStatus })).toBeNull()
    }
  })
})

describe('how strong the match looked', () => {
  it('is strong only where the check would have linked it by itself', () => {
    expect(matchStrength(0.55)).toBe('strong')
    expect(matchStrength(0.54)).toBe('possible')
    expect(matchStrength(null)).toBe('possible')
  })
})

describe('why it may be them', () => {
  it('a waiting page gives the identity check its own reasons', () => {
    const why = reviewReason(subject, {
      state: 'waiting',
      reviewed: false,
      signals: { exactNameInTitle: true, organizationDomainMatch: true, held: { facts: [] } },
    })
    expect(why).toBe(
      'Matched because their name is in the page title and it is published by Northwind.',
    )
  })

  it('says when the user decided, rather than repeating the guess', () => {
    expect(reviewReason(subject, { state: 'kept', reviewed: true, signals: {} })).toBe(
      'You confirmed this is them.',
    )
    expect(reviewReason(subject, { state: 'rejected', reviewed: true, signals: {} })).toBe(
      'You said this is someone else.',
    )
  })

  it('a page linked by research without the user is labelled as such', () => {
    expect(
      reviewReason(subject, {
        state: 'kept',
        reviewed: false,
        signals: { exactNameInText: true, jobTitleMatch: true },
      }),
    ).toBe(
      'Linked by research: matched because their name appears in the page and it mentions VP Sales.',
    )
  })

  it('a link the user typed is said as theirs, not as proof', () => {
    expect(
      reviewReason(subject, {
        state: 'waiting',
        reviewed: false,
        signals: { userProvidedForPerson: true },
      }),
    ).toBe('You added this link for them.')
  })
})

describe('where the name appears', () => {
  const page = `${'Intro text about the company and its history. '.repeat(8)}Our sales team is led by Dana Whitfield, who joined from Halcyon in 2021. ${'More about the firm and its many offices. '.repeat(8)}`

  it('shows the words around the full name, cut at whole words', () => {
    const excerpt = nameExcerpt(page, 'Dana Whitfield')!
    expect(excerpt).toContain('led by Dana Whitfield, who joined from Halcyon')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThan(330)
    // Both ends fall between words of the page, never inside one.
    const core = excerpt.replace(/^…|…$/g, '')
    const at = page.indexOf(core)
    expect(at).toBeGreaterThan(0)
    expect(page[at - 1]).toBe(' ')
    expect(page[at + core.length]).toBe(' ')
  })

  it('falls back to the family name, and says nothing when neither is there', () => {
    expect(nameExcerpt('Ms Whitfield spoke on the panel.', 'Dana Whitfield')).toBe(
      'Ms Whitfield spoke on the panel.',
    )
    expect(nameExcerpt('A page about someone else entirely.', 'Dana Whitfield')).toBeNull()
    expect(nameExcerpt(null, 'Dana Whitfield')).toBeNull()
  })
})

describe('labels', () => {
  it('names facts in the brief’s words and hosts without www', () => {
    expect(factLabel('current_role')).toBe('Role')
    expect(factLabel('prior_role')).toBe('Previously')
    expect(factLabel('something_new')).toBe('Other')
    expect(hostOf('https://www.northwind.example/team')).toBe('northwind.example')
    expect(hostOf('not a url')).toBeNull()
  })
})

describe('what Ask and briefs may cite as a public source', () => {
  it('a page held for review is not cited, even when it was read for someone else', () => {
    expect(
      countsAsPublicSource({
        accessStatus: 'analyzed',
        signals: { exactNameInTitle: true, held: { facts: [] } },
      }),
    ).toBe(false)
  })

  it('a read page with nothing held is cited, as before; an unreadable one is not', () => {
    expect(
      countsAsPublicSource({ accessStatus: 'analyzed', signals: { exactNameInTitle: true } }),
    ).toBe(true)
    expect(countsAsPublicSource({ accessStatus: 'identity_uncertain', signals: {} })).toBe(false)
  })
})
