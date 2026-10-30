import { describe, expect, it } from 'vitest'
import {
  countsAsPublicSource,
  factLabel,
  hostOf,
  matchStrength,
  dropDuplicatePages,
  nameExcerpt,
  reviewReason,
  reviewState,
  updatedDate,
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

  it('shows the sentence of the article that names them', () => {
    expect(nameExcerpt(page, 'Dana Whitfield')).toBe(
      'Our sales team is led by Dana Whitfield, who joined from Halcyon in 2021.',
    )
  })

  it('cuts a long sentence at whole words around the name', () => {
    const long = `In a wide ranging piece ${'about many things that happened over the years '.repeat(6)}the board said Dana Whitfield will lead sales ${'across every region and every product line that exists today '.repeat(5)}from next spring.`
    const excerpt = nameExcerpt(long, 'Dana Whitfield', { maxLength: 200 })!
    expect(excerpt).toContain('Dana Whitfield will lead sales')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(202)
    // Both ends fall between words of the page, never inside one.
    const core = excerpt.replace(/^…|…$/g, '')
    const at = long.indexOf(core)
    expect(at).toBeGreaterThan(0)
    expect(long[at - 1]).toBe(' ')
    expect(long[at + core.length]).toBe(' ')
  })

  it('passes over menus, tickers and the headline for the article’s own words', () => {
    // Screenshots of a live search: CNBC's menu and a BREAKING strip were shown
    // as where the name appears.
    const text = [
      "Elon Musk's Companies: A Full List",
      'Skip Navigation Markets Business Investing Tech Politics Video Elon Musk',
      'BREAKING: DOJ requests records from Musk companies in new filing',
      'Markets | Tesla | SpaceX | Elon Musk',
      'Elon Musk is the chief executive of Tesla and SpaceX, and owns X.',
    ].join('\n')
    expect(
      nameExcerpt(text, 'Elon Musk', { title: "Elon Musk's Companies: A Full List | Built In" }),
    ).toBe('Elon Musk is the chief executive of Tesla and SpaceX, and owns X.')
  })

  it('strips a headline run into the first sentence', () => {
    const text =
      'Who Is Dana Whitfield? A Guide Dana Whitfield joined Northwind as VP Sales in 2024.'
    expect(nameExcerpt(text, 'Dana Whitfield', { title: 'Who Is Dana Whitfield? A Guide' })).toBe(
      'Dana Whitfield joined Northwind as VP Sales in 2024.',
    )
  })

  it('falls back to the family name, then to a short line like a speaker list', () => {
    expect(nameExcerpt('Ms Whitfield spoke on the panel.', 'Dana Whitfield')).toBe(
      'Ms Whitfield spoke on the panel.',
    )
    expect(nameExcerpt('Speakers\nDana Whitfield, VP Sales, Northwind', 'Dana Whitfield')).toBe(
      'Dana Whitfield, VP Sales, Northwind',
    )
  })

  it('offers nothing rather than page furniture', () => {
    expect(
      nameExcerpt('Skip to content Home About Dana Whitfield Contact Us', 'Dana Whitfield'),
    ).toBeNull()
    expect(nameExcerpt('A page about someone else entirely.', 'Dana Whitfield')).toBeNull()
    expect(nameExcerpt(null, 'Dana Whitfield')).toBeNull()
  })
})

describe('when the page was updated', () => {
  const now = new Date('2026-10-30T12:00:00Z')

  it('reads the update over the article, as the reader sees it', () => {
    // Built In: published 2 Jun 2025, printed "UPDATED by ... | Sep 03, 2026".
    const text =
      "Elon Musk's Companies\nUPDATED by Brennan Whitfield | Sep 03, 2026\nElon Musk runs..."
    expect(updatedDate(text, '2025-06-02T00:00:00Z', now)).toBe('2026-09-03T00:00:00.000Z')
    expect(updatedDate('Last updated: 3 September 2026', null, now)).toBe(
      '2026-09-03T00:00:00.000Z',
    )
    expect(updatedDate('Updated 2026-09-03', null, now)).toBe('2026-09-03T00:00:00.000Z')
  })

  it('takes no date that is earlier than publication, in the future, or not a date', () => {
    expect(updatedDate('Updated Jan 4, 2024', '2025-06-02T00:00:00Z', now)).toBeNull()
    expect(updatedDate('Updated Dec 1, 2026', null, now)).toBeNull()
    expect(updatedDate('Updated Feb 31, 2026', null, now)).toBeNull()
    expect(updatedDate('Updated Jun 2, 2025', '2025-06-02T00:00:00Z', now)).toBeNull()
  })

  it('reads only the opening of the page, where bylines are', () => {
    const text = `${'Body text about the company. '.repeat(100)}The rules were updated on Sep 3, 2026.`
    expect(updatedDate(text, null, now)).toBeNull()
  })
})

describe('one card per document', () => {
  const card = (
    id: string,
    over: Partial<Parameters<typeof dropDuplicatePages>[0][number]> = {},
  ) => ({
    id,
    url: `https://builtin.com/articles/${id}`,
    title: `Article ${id} | Built In`,
    host: 'builtin.com',
    state: 'waiting' as const,
    reviewed: false,
    confidence: 0.6,
    ...over,
  })

  it('drops the same page reached by another address', () => {
    const pages = [
      card('a'),
      card('b', { url: 'https://www.builtin.com/articles/a/?utm_source=x', title: 'Other title' }),
    ]
    expect(dropDuplicatePages(pages).map((p) => p.id)).toEqual(['a'])
  })

  it('drops one site’s article under two addresses, keeping the one decided on', () => {
    const pages = [
      card('a', { title: 'Who Is Elon Musk? | Built In' }),
      card('b', { title: 'Who Is Elon Musk? - Built In', state: 'kept', reviewed: true }),
    ]
    expect(dropDuplicatePages(pages).map((p) => p.id)).toEqual(['b'])
  })

  it('keeps two different articles from one site', () => {
    const pages = [
      card('a', { title: "Elon Musk's Companies: A Full List | Built In" }),
      card('b', { title: 'Who Is Elon Musk? A Guide | Built In' }),
    ]
    expect(dropDuplicatePages(pages)).toHaveLength(2)
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
  const cite = (status: string, over: { accessStatus?: string; signals?: object } = {}) =>
    countsAsPublicSource({ accessStatus: 'analyzed', status, signals: {}, ...over })

  it('a page accepted as them -- confirmed, or linked by research -- is cited', () => {
    expect(cite('confirmed')).toBe(true)
    expect(cite('probable')).toBe(true)
  })

  it('a page marked "not them" is never cited, even after it was read', () => {
    expect(cite('no_match')).toBe(false)
  })

  it('a page still waiting for a check is not cited', () => {
    for (const status of ['unreviewed', 'ambiguous', 'conflicting'])
      expect(cite(status), status).toBe(false)
  })

  it('a page held for review is not cited, even when it was read for someone else', () => {
    expect(cite('unreviewed', { signals: { exactNameInTitle: true, held: { facts: [] } } })).toBe(
      false,
    )
    expect(cite('probable', { signals: { held: { facts: [] } } })).toBe(false)
  })

  it('an unreadable page is not cited', () => {
    expect(cite('confirmed', { accessStatus: 'identity_uncertain' })).toBe(false)
  })
})
