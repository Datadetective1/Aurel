import { describe, expect, it } from 'vitest'
import {
  isCleanProse,
  matchCurrentRole,
  matchExpertise,
  matchRoleAtKnownOrg,
  sourceExtractionPrompt,
} from './source-extraction'
import { extractFromHtml } from '@/lib/sources/extract'

/**
 * Regression tests for source extraction quality.
 *
 * These pin real defects observed against a live page:
 *   1. A naive tag stripper broke on an attribute containing ">", spilling JSON
 *      and wiki markup into the extracted text.
 *   2. A loose role pattern read the headline "Satya Nadella Once Gave Up His
 *      Green Card For Love" as current_role "Once Gave Up His Green Card" at
 *      organisation "Love".
 *
 * Both produced confident, sourced, completely wrong claims about a real
 * person — the worst output this product can generate.
 */

function extract(
  text: string,
  fullName = 'Satya Nadella',
  organization: string | null = 'Microsoft',
) {
  return sourceExtractionPrompt.compose({
    person: { fullName, organization, jobTitle: 'Chairman and CEO' },
    source: {
      id: 's1',
      url: 'https://example.com/x',
      title: `${fullName} profile`,
      publisher: 'Example',
      publishedAt: null,
      sourceType: 'public_web',
      text,
    },
  })
}

describe('isCleanProse', () => {
  it('accepts ordinary prose', () => {
    expect(isCleanProse('Chief Executive Officer')).toBe(true)
    expect(isCleanProse('Engineering productivity and developer experience')).toBe(true)
  })

  it('rejects markup, JSON and template residue', () => {
    const garbage = [
      'Before joining the Microsoft Group in 1992}}</ref>"}}',
      '{"i":0}',
      'text with <div> in it',
      'see [1] [2]',
      'visit https://example.com now',
      '&nbsp;&amp;',
      'a || b',
    ]
    for (const value of garbage) {
      expect(isCleanProse(value), value).toBe(false)
    }
  })

  it('rejects values with no letters or too short', () => {
    expect(isCleanProse('')).toBe(false)
    expect(isCleanProse('  ')).toBe(false)
    expect(isCleanProse('12345')).toBe(false)
  })
})

describe('matchCurrentRole', () => {
  it('extracts a genuine role statement', () => {
    const result = matchCurrentRole(
      'Satya Nadella is Chairman and CEO of Microsoft Corporation.',
      'Satya Nadella',
    )
    expect(result).not.toBeNull()
    expect(result!.title.toLowerCase()).toContain('chairman')
    expect(result!.organization).toContain('Microsoft')
  })

  it('does NOT read a headline as a role', () => {
    // The exact string that produced current_role "Once Gave Up His Green Card".
    const result = matchCurrentRole(
      'Satya Nadella Once Gave Up His Green Card For Love',
      'Satya Nadella',
    )
    expect(result).toBeNull()
  })

  it('rejects a phrase with no job-title token', () => {
    expect(matchCurrentRole('Maya Chen is a fan of Acme Corporation.', 'Maya Chen')).toBeNull()
    expect(matchCurrentRole('Maya Chen became a resident of Springfield.', 'Maya Chen')).toBeNull()
  })

  it('does not accept "for" as an employment connector', () => {
    expect(matchCurrentRole('Maya Chen is Director For Love', 'Maya Chen')).toBeNull()
  })

  it('accepts "at" and "of"', () => {
    expect(
      matchCurrentRole('Maya Chen is VP Engineering at Acme Corp.', 'Maya Chen'),
    ).not.toBeNull()
    expect(matchCurrentRole('Maya Chen is Head of Platform at Acme.', 'Maya Chen')).not.toBeNull()
  })

  it('returns the supporting excerpt', () => {
    const result = matchCurrentRole('Maya Chen is VP Engineering at Acme Corp.', 'Maya Chen')
    expect(result!.excerpt).toContain('Maya Chen')
  })
})

describe('extractFromHtml with hostile markup', () => {
  it('does not leak JSON from an attribute containing ">"', () => {
    // A naive /<[^>]+>/ stripper ends the tag at the ">" inside the JSON.
    const html = `<html><body>
      <p data-payload='{"a":"b>c","i":0}'>Maya Chen is VP Engineering at Acme.</p>
      </body></html>`

    const result = extractFromHtml(html)
    expect(result.text).toContain('Maya Chen is VP Engineering at Acme.')
    expect(result.text).not.toContain('data-payload')
    expect(result.text).not.toContain('"i":0')
    expect(result.text).not.toContain('{')
  })

  it('keeps text clean when attributes contain quotes and angle brackets', () => {
    const html = `<div title="a > b" class='x>y'>Real content here.</div>`
    const result = extractFromHtml(html)
    expect(result.text.trim()).toBe('Real content here.')
  })
})

describe('composeExtraction end to end', () => {
  it('emits no fact containing markup residue', () => {
    const messy = `Satya Nadella is Chairman and CEO of Microsoft Corporation.
      Before joining the Microsoft Group in 1992}}</ref>"}},"i":0}}]}'> he worked elsewhere.
      He focuses on artificial intelligence and cloud migration.`

    const result = extract(messy)
    for (const fact of result.facts) {
      expect(isCleanProse(fact.value), `dirty fact value: ${fact.value}`).toBe(true)
    }
  })

  it('does not manufacture a role from a headline', () => {
    const result = extract('Satya Nadella Once Gave Up His Green Card For Love. A profile.')
    const roles = result.facts.filter((f) => f.kind === 'current_role')
    const orgs = result.facts.filter((f) => f.kind === 'current_organization')
    expect(roles).toEqual([])
    expect(orgs).toEqual([])
  })

  it('still extracts a real role when the text states one', () => {
    const result = extract('Satya Nadella is Chairman and CEO of Microsoft Corporation.')
    const role = result.facts.find((f) => f.kind === 'current_role')
    expect(role).toBeDefined()
    expect(role!.evidenceLevel).toBe('observed')
    expect(role!.excerpt).toBeTruthy()
  })

  it('reports mentionsTarget=false when the person is absent', () => {
    // The title must not carry the name either, since the title is also checked.
    const result = sourceExtractionPrompt.compose({
      person: { fullName: 'Satya Nadella', organization: 'Microsoft', jobTitle: null },
      source: {
        id: 's1',
        url: 'https://example.com/x',
        title: 'Quarterly earnings',
        publisher: 'Example',
        publishedAt: null,
        sourceType: 'public_web',
        text: 'This page is about quarterly earnings and nothing else.',
      },
    })
    expect(result.mentionsTarget).toBe(false)
    expect(result.facts).toEqual([])
  })

  it('marks a single theme mention as inferred, not observed', () => {
    const result = extract(
      'Satya Nadella is Chairman and CEO of Microsoft Corporation. He mentioned artificial intelligence.',
    )
    const theme = result.facts.find((f) => f.kind === 'theme')
    expect(theme?.evidenceLevel).toBe('inferred')
  })

  it('every emitted fact carries an excerpt or is explicitly a counted theme', () => {
    const result = extract(
      'Satya Nadella is Chairman and CEO of Microsoft Corporation. He focuses on cloud migration.',
    )
    for (const fact of result.facts) {
      if (fact.kind === 'theme') continue
      expect(fact.excerpt, `${fact.kind} has no excerpt`).toBeTruthy()
    }
  })

  it('validates against its schema', () => {
    const result = extract('Satya Nadella is Chairman and CEO of Microsoft Corporation.')
    expect(() => sourceExtractionPrompt.schema.parse(result)).not.toThrow()
  })
})

describe('matchCurrentRole recall on encyclopaedic prose', () => {
  it('matches across a middle name the user did not record', () => {
    const result = matchCurrentRole(
      'Satya Narayana Nadella (born 19 August 1967) is an Indian-American business executive who is the chairman and chief executive officer of Microsoft.',
      'Satya Nadella',
    )
    expect(result).not.toBeNull()
    expect(result!.title.toLowerCase()).toContain('chief executive')
    expect(result!.organization).toContain('Microsoft')
  })

  it('matches across a short parenthetical', () => {
    const result = matchCurrentRole(
      'Maya Chen (she/her) is the Vice President of Engineering at Acme Corporation.',
      'Maya Chen',
    )
    expect(result).not.toBeNull()
    expect(result!.organization).toContain('Acme')
  })

  it('still refuses to reach across a sentence boundary', () => {
    // The gap may not contain sentence-ending punctuation, so the role in the
    // SECOND sentence must not be attributed to the person in the first.
    const result = matchCurrentRole(
      'Maya Chen attended the summit. Daniel Brooks is Finance Director of Northwind.',
      'Maya Chen',
    )
    expect(result).toBeNull()
  })

  it('still rejects the headline that caused the original defect', () => {
    expect(
      matchCurrentRole('Satya Nadella Once Gave Up His Green Card For Love', 'Satya Nadella'),
    ).toBeNull()
  })
})

describe('publication date extraction', () => {
  it('accepts an explicit article publication meta tag', () => {
    const result = extractFromHtml(
      `<meta property="article:published_time" content="2026-03-14T09:00:00Z"><p>hi</p>`,
    )
    expect(result.publishedAt).toBe('2026-03-14T09:00:00.000Z')
  })

  it('ignores a bare time element in the body', () => {
    // An infobox birth date or a cited source must never become the freshness
    // date for facts extracted today — that presents new findings as stale.
    const result = extractFromHtml(`<p>Born <time datetime="1967-08-19">19 August 1967</time></p>`)
    expect(result.publishedAt).toBeNull()
  })

  it('accepts a time element explicitly marked as the publication date', () => {
    const result = extractFromHtml(
      `<time itemprop="datePublished" datetime="2026-01-05">5 Jan</time>`,
    )
    expect(result.publishedAt).toBe('2026-01-05T00:00:00.000Z')
  })
})

describe('matchRoleAtKnownOrg', () => {
  it('confirms an infobox-style role at the recorded organisation', () => {
    const result = matchRoleAtKnownOrg('Title - CEO of Microsoft (since 2014)', 'Microsoft')
    expect(result).not.toBeNull()
    expect(result!.title.toLowerCase()).toContain('ceo')
    expect(result!.organization).toBe('Microsoft')
  })

  it('does nothing without a recorded organisation', () => {
    expect(matchRoleAtKnownOrg('CEO of Microsoft', null)).toBeNull()
    expect(matchRoleAtKnownOrg('CEO of Microsoft', '')).toBeNull()
  })

  it('ignores a role at a DIFFERENT organisation', () => {
    // The key safety property: it can only confirm the employer the user gave.
    expect(matchRoleAtKnownOrg('Steve Ballmer, CEO of Acme Corp', 'Microsoft')).toBeNull()
  })

  it('still requires the phrase to look like a title', () => {
    expect(matchRoleAtKnownOrg('a fan of Microsoft', 'Microsoft')).toBeNull()
    expect(matchRoleAtKnownOrg('the history of Microsoft', 'Microsoft')).toBeNull()
  })
})

/**
 * Bounded capture.
 *
 * Both of these shipped to a rendered page: an organisation that ran past a
 * comma and got cut off mid-word, and an "expertise" that was really a whole
 * sentence about someone's job title.
 */
describe('bounded capture', () => {
  const bio =
    'Jordan Avery is VP Engineering at Meridian Systems, where she leads the platform ' +
    'and infrastructure organisation. Her public work focuses on migration strategy ' +
    'and on reducing operational risk during large infrastructure changes.'

  it('stops the organisation at the clause boundary', () => {
    const result = matchCurrentRole(bio, 'Jordan Avery')
    expect(result).not.toBeNull()
    expect(result!.title).toBe('VP Engineering')
    expect(result!.organization).toBe('Meridian Systems')
    // Previously captured ", where she leads the platform and infrastruc".
    expect(result!.organization).not.toMatch(/where|infrastruc/)
  })

  it('keeps a corporate suffix that genuinely contains a comma', () => {
    const result = matchCurrentRole(
      'Dana Reed is Chief Counsel at Wikimedia Foundation, Inc. and joined in 2021.',
      'Dana Reed',
    )
    // The trailing stop is stripped by cleanValue, deliberately: leaving it
    // produced "Inc.." wherever the value was used mid-sentence.
    expect(result?.organization).toBe('Wikimedia Foundation, Inc')
  })

  it('extracts the subject of an expertise phrase, not the sentence', () => {
    const subject = matchExpertise(
      'Her public work focuses on migration strategy and on reducing operational risk.',
    )
    expect(subject).toBe('migration strategy and on reducing operational risk')
    expect(subject).not.toMatch(/^Her public work/)
  })

  it('stops an expertise phrase at a relative clause', () => {
    const subject = matchExpertise(
      'She leads the platform organisation, which spans four teams across two regions.',
    )
    expect(subject).toBe('platform organisation')
    expect(subject).not.toMatch(/which|regions/)
  })

  it('returns nothing when the sentence declares no expertise', () => {
    expect(matchExpertise('Jordan holds a degree in Computer Science.')).toBeNull()
  })
})
