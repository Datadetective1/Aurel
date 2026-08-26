import { describe, expect, it } from 'vitest'
import {
  MAX_ANALYSED,
  MAX_CANDIDATES,
  MAX_SEARCH_REQUESTS,
  hasEnough,
  planQueries,
} from './queries'

/**
 * Query strategy.
 *
 * This is a paid-per-request feature, so the tests that matter are the ones
 * about how *few* requests it makes. A ladder that always walks every rung is
 * a broad search with extra steps and three times the bill.
 */

const jordan = {
  name: 'Jordan Avery',
  organization: 'Meridian Systems',
  jobTitle: 'VP Engineering',
  domain: 'meridiansystems.com',
}

describe('planQueries', () => {
  it('asks the most specific question first', () => {
    // Name plus employer is the rung that usually answers it. Anything more
    // speculative running first spends a request to learn less.
    const plan = planQueries(jordan)
    expect(plan[0]?.stage).toBe('anchored')
    expect(plan[0]?.query.organization).toBe('Meridian Systems')
  })

  it('uses the domain to pin results to the employer', () => {
    const domainRung = planQueries(jordan).find((p) => p.query.domain)
    expect(domainRung).toBeDefined()
    expect(domainRung?.query.domain).toBe('meridiansystems.com')
  })

  it('skips rungs whose inputs are missing rather than degrading them', () => {
    // A "role" query with no title is a name search wearing a costume, and
    // running it spends a request re-asking the previous question.
    const plan = planQueries({ name: 'Jordan Avery' })
    expect(plan.some((p) => p.stage === 'role')).toBe(false)
    expect(plan.some((p) => p.query.organization)).toBe(false)
  })

  it('falls back to a bare name only when there was nothing to anchor on', () => {
    expect(planQueries({ name: 'Jordan Avery' }).some((p) => p.stage === 'name_only')).toBe(true)
    // With an employer, a bare-name search would mostly return other people.
    expect(planQueries(jordan).some((p) => p.stage === 'name_only')).toBe(false)
  })

  it('never plans a query without the name', () => {
    for (const planned of planQueries(jordan)) {
      expect(planned.query.name).toBe('Jordan Avery')
    }
  })
})

describe('hasEnough', () => {
  const anchored = planQueries(jordan)[0]!

  it('stops once the first rung has answered the question', () => {
    expect(hasEnough(anchored, 3, 3, MAX_CANDIDATES)).toBe(true)
  })

  it('keeps going when the rung returned too little to be sure', () => {
    expect(hasEnough(anchored, 1, 1, MAX_CANDIDATES)).toBe(false)
  })

  it('stops at the overall candidate ceiling however thin each rung was', () => {
    // Otherwise a provider returning two weak results per rung walks the whole
    // ladder every time.
    expect(hasEnough(anchored, 1, MAX_CANDIDATES, MAX_CANDIDATES)).toBe(true)
  })

  it('counts ranked candidates, not raw hits', () => {
    // Ten aggregator pages that ranking discards are not evidence the question
    // is settled — the caller passes post-ranking counts, so zero means zero.
    expect(hasEnough(anchored, 0, 0, MAX_CANDIDATES)).toBe(false)
  })
})

describe('cost ceilings', () => {
  it('caps requests below the number of rungs a full profile generates', () => {
    // A person with an organisation, a domain and a title plans five rungs. If
    // the cap were not lower than that, a provider returning nothing useful
    // would walk all five on every run.
    expect(planQueries(jordan).length).toBeGreaterThan(MAX_SEARCH_REQUESTS)
    expect(MAX_SEARCH_REQUESTS).toBeLessThanOrEqual(3)
  })

  it('analyses fewer pages than it collects candidates', () => {
    // Every analysed page is a fetch plus a model call. Weak sources do not
    // just cost money, they cost accuracy — a page that is not really about the
    // person is what produces a confidently wrong brief.
    expect(MAX_ANALYSED).toBeLessThan(MAX_CANDIDATES)
  })
})
