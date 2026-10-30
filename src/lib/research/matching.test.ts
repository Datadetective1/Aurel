import { describe, expect, it } from 'vitest'
import {
  hostMatchesOrganization,
  isGenericEmailDomain,
  matchName,
  matchOrganization,
  namedEmployersNear,
  sameOrganization,
} from './matching'

describe('matchName', () => {
  it('finds the full name on whole words', () => {
    expect(matchName('Jordan Avery', 'Jordan Avery leads platform.')).toBe('exact')
  })

  it('does not take a longer surname for theirs', () => {
    // A substring check linked this page as Jordan Avery.
    expect(matchName('Jordan Avery', 'Jordan Averyson leads platform.')).toBeNull()
    expect(matchName('Jordan Avery', 'Jordan Avery-Stone leads platform.')).toBeNull()
  })

  it('accepts a middle name or initial', () => {
    expect(matchName('Jordan Avery', 'Jordan P. Avery, VP Engineering')).toBe('variant')
    expect(matchName('Jordan Avery', 'Jordan Patrick Avery spoke')).toBe('variant')
  })

  it('accepts the "Last, First" form directories use', () => {
    expect(matchName('Jordan Avery', 'Avery, Jordan — Meridian Systems')).toBe('variant')
  })

  it('does not reverse a name without the comma', () => {
    // "Avery Jordan" is a different name as often as it is a reversed one.
    expect(matchName('Jordan Avery', 'Avery Jordan joined the board')).toBeNull()
  })

  it('folds accents and case both ways', () => {
    expect(matchName('Jose Alvarez', 'José Álvarez spoke')).toBe('exact')
    expect(matchName('José Álvarez', 'JOSE ALVAREZ spoke')).toBe('exact')
  })

  it('matches a saved middle initial against the plain name', () => {
    expect(matchName('Jordan P. Avery', 'Jordan P. Avery spoke')).toBe('exact')
    expect(matchName('Jordan P. Avery', 'Avery, Jordan')).toBe('variant')
  })

  it('handles empty input', () => {
    expect(matchName('Jordan Avery', null)).toBeNull()
    expect(matchName('', 'anything')).toBeNull()
  })
})

describe('matchOrganization', () => {
  it('ignores legal suffixes', () => {
    expect(matchOrganization('Meridian Systems, Inc.', 'VP at Meridian Systems')).toBe('full')
    expect(matchOrganization('Acme Corporation', 'leads engineering at Acme.')).toBe('full')
  })

  it('treats the distinctive word alone as a partial match', () => {
    expect(matchOrganization('Meridian Systems', 'VP Engineering at Meridian.')).toBe('partial')
  })

  it('does not count a generic word', () => {
    expect(matchOrganization('Meridian Systems', 'Large systems need care.')).toBeNull()
  })

  it('needs whole words', () => {
    expect(matchOrganization('Acme', 'Acmeville city council')).toBeNull()
  })
})

describe('hostMatchesOrganization', () => {
  it('recognises the employer on its own site', () => {
    expect(hostMatchesOrganization('meridiansystems.com', 'Meridian Systems')).toBe(true)
    expect(hostMatchesOrganization('meridian.com', 'Meridian Systems')).toBe(true)
    expect(hostMatchesOrganization('careers.meridian.io', 'Meridian Systems')).toBe(true)
    expect(hostMatchesOrganization('textron.com', 'Bell Textron')).toBe(true)
  })

  it('does not match an unrelated site or the TLD', () => {
    expect(hostMatchesOrganization('northwind.io', 'Meridian Systems')).toBe(false)
    expect(hostMatchesOrganization('example.co', 'Acme Co')).toBe(false)
  })
})

describe('namedEmployersNear', () => {
  it('finds a role at a company near their name', () => {
    expect(
      namedEmployersNear('John Smith', 'John Smith is Director of Programs at Lockheed Martin.'),
    ).toEqual(['lockheed martin'])
  })

  it('ignores places someone only spoke at', () => {
    expect(namedEmployersNear('Jordan Avery', 'Jordan Avery spoke at the summit in May.')).toEqual(
      [],
    )
  })

  it('does not hang another person’s employer on them', () => {
    const page = `Jordan Avery leads platform. ${'Filler text. '.repeat(40)} Sam Lee is CTO at Northwind.`
    expect(namedEmployersNear('Jordan Avery', page)).toEqual([])
  })
})

describe('sameOrganization', () => {
  it('equates short and long forms', () => {
    expect(sameOrganization('meridian', 'Meridian Systems, Inc.')).toBe(true)
    expect(sameOrganization('Lockheed Martin', 'Boeing')).toBe(false)
  })
})

describe('isGenericEmailDomain', () => {
  it('knows free mail is not an employer', () => {
    expect(isGenericEmailDomain('gmail.com')).toBe(true)
    expect(isGenericEmailDomain('acme.com')).toBe(false)
  })
})
