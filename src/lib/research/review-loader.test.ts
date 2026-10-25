import { describe, expect, it, vi } from 'vitest'
import { fakeClient, type Row } from '../../../tests/stubs/fake-supabase'

/**
 * WHAT THE APP'S RESEARCH SCREEN IS GIVEN
 * =============================================================================
 * Only this account's pages for this person. A held page shows what it would
 * add and never appears as in the record; a page in the record shows only
 * this person's facts; the user's own "not them" stays visible; pages the
 * check set aside, or could not read, are only counted.
 * =============================================================================
 */

vi.mock('./providers', () => ({
  researchCapability: () => ({ canDiscover: true, discoveryHint: null }),
}))

const { loadResearchReview } = await import('./review.server')

const PERSON = {
  id: 'p-1',
  user_id: 'u-1',
  archived_at: null,
  full_name: 'Dana Whitfield',
  preferred_name: 'Dana',
  job_title: 'VP Sales',
  profile_url: null,
  last_researched_at: '2026-10-25T00:00:00Z',
  organizations: { name: 'Northwind' },
}
const page = (id: string, over: Row = {}): Row => ({
  id,
  source_title: `Page ${id}`,
  source_url: `https://example.com/${id}`,
  publisher: null,
  published_at: null,
  retrieved_at: '2026-10-25T00:00:00Z',
  access_status: 'analyzed',
  ...over,
})
const link = (src: Row, over: Row = {}): Row => ({
  user_id: 'u-1',
  person_id: 'p-1',
  identity_match_status: 'probable',
  identity_match_confidence: 0.7,
  match_signals: { exactNameInTitle: true },
  reviewed_by_user: false,
  sources: src,
  ...over,
})

const HELD = {
  facts: [
    {
      kind: 'current_role',
      value: 'VP Sales',
      detail: null,
      excerpt: 'is VP Sales',
      evidenceLevel: 'observed',
      isCurrent: true,
    },
  ],
  observations: [{ content: 'Writes plainly.', excerpt: null, evidenceLevel: 'inferred' }],
  asOf: null,
}

function load(tables: Record<string, Row[]>) {
  return loadResearchReview(fakeClient({ people: [PERSON], ...tables }).client, 'u-1', 'p-1')
}

describe('the research review', () => {
  it('a held page shows what it would add, and is waiting -- not in the record', async () => {
    const review = await load({
      source_person_links: [
        link(page('held', { access_status: 'identity_uncertain' }), {
          identity_match_status: 'unreviewed',
          identity_match_confidence: 0.83,
          match_signals: { exactNameInTitle: true, organizationDomainMatch: true, held: HELD },
        }),
      ],
      sources: [
        {
          id: 'held',
          user_id: 'u-1',
          extracted_text: 'The team. Dana Whitfield leads sales at Northwind.',
        },
      ],
    })
    const [held] = review!.sources
    expect(held).toMatchObject({
      state: 'waiting',
      match: 'strong',
      why: 'Matched because their name is in the page title and it is published by Northwind.',
      nameExcerpt: 'The team. Dana Whitfield leads sales at Northwind.',
      proposals: 1,
    })
    expect(held!.facts).toEqual([
      {
        id: 'held:0',
        kind: 'current_role',
        label: 'Role',
        value: 'VP Sales',
        detail: null,
        evidence: 'observed',
        excerpt: 'is VP Sales',
        current: true,
      },
    ])
  })

  it('a page in the record shows only this person’s facts, with their evidence', async () => {
    const review = await load({
      source_person_links: [link(page('kept'))],
      fact_sources: [
        { user_id: 'u-1', source_id: 'kept', fact_id: 'f-dana', excerpt: 'Dana leads sales' },
        { user_id: 'u-1', source_id: 'kept', fact_id: 'f-sam', excerpt: 'Sam runs support' },
      ],
      professional_facts: [
        {
          id: 'f-dana',
          user_id: 'u-1',
          person_id: 'p-1',
          kind: 'current_role',
          value: 'VP Sales',
          detail: null,
          evidence_level: 'observed',
          is_current: true,
        },
        {
          id: 'f-sam',
          user_id: 'u-1',
          person_id: 'p-2',
          kind: 'current_role',
          value: 'Support lead',
          detail: null,
          evidence_level: 'observed',
          is_current: true,
        },
      ],
      observation_sources: [],
    })
    const [kept] = review!.sources
    expect(kept!.state).toBe('kept')
    expect(kept!.why).toBe('Linked by research: matched because their name is in the page title.')
    expect(kept!.facts.map((f) => f.value)).toEqual(['VP Sales'])
  })

  it('keeps the user’s own "not them", and only counts what the check set aside or could not read', async () => {
    const review = await load({
      source_person_links: [
        link(page('mine'), { identity_match_status: 'no_match', reviewed_by_user: true }),
        link(page('auto'), { identity_match_status: 'no_match' }),
        link(page('walled', { access_status: 'login_required' }), {
          identity_match_status: 'unreviewed',
        }),
        // A note the user pasted is their own record, not a public footprint.
        link(page('note', { source_url: null, access_status: 'analyzed' }), {
          identity_match_status: 'confirmed',
        }),
      ],
    })
    expect(review!.sources.map((s) => [s.id, s.state])).toEqual([['mine', 'rejected']])
    expect(review!.notUsed).toBe(2)
  })

  it('another account’s pages for the same person never appear', async () => {
    const review = await load({
      source_person_links: [link(page('theirs'), { user_id: 'u-2' })],
    })
    expect(review!.sources).toEqual([])
  })

  it('someone archived, or not on this account, has no research to show', async () => {
    const archived = await loadResearchReview(
      fakeClient({ people: [{ ...PERSON, archived_at: '2026-10-01T00:00:00Z' }] }).client,
      'u-1',
      'p-1',
    )
    expect(archived).toBeNull()
    const elsewhere = await loadResearchReview(
      fakeClient({ people: [{ ...PERSON, user_id: 'u-2' }] }).client,
      'u-1',
      'p-1',
    )
    expect(elsewhere).toBeNull()
  })
})
