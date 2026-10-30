import { describe, expect, it } from 'vitest'
import type { ResearchFact } from '@/lib/mobile/contracts'
import { buildProfile, type ProfilePage } from './profile'

/**
 * ONE PROFILE FROM MANY PAGES
 * =============================================================================
 * From a live search on a public figure: five articles each listed the same
 * roles, a 2020 article's roles sat beside this year's, and every line said
 * the same thing again. Merged, each thing is said once, with how many pages
 * say it and how recently.
 * =============================================================================
 */

let n = 0
const fact = (kind: string, value: string, over: Partial<ResearchFact> = {}): ResearchFact => ({
  id: `f${n++}`,
  kind,
  label: kind,
  value,
  detail: null,
  evidence: 'observed',
  excerpt: null,
  current: kind !== 'prior_role',
  ...over,
})
const page = (
  id: string,
  date: string | null,
  facts: ResearchFact[],
  over: Partial<ProfilePage> = {},
): ProfilePage => ({
  id,
  state: 'waiting',
  date,
  facts,
  ...over,
})

describe('the merged profile', () => {
  it('says each thing once, with how many pages say it and the newest date', () => {
    const profile = buildProfile([
      page('a', '2026-09-03T00:00:00Z', [fact('current_role', 'CEO of Tesla')]),
      page('b', '2026-07-21T00:00:00Z', [fact('current_role', 'Tesla CEO')]),
      page('c', '2025-01-10T00:00:00Z', [fact('current_role', 'CEO, Tesla, Inc.')]),
    ])
    expect(profile).toHaveLength(1)
    expect(profile[0]).toMatchObject({
      kind: 'role',
      label: 'Role',
      value: 'CEO of Tesla',
      pages: 3,
      asOf: '2026-09-03T00:00:00.000Z',
      past: false,
      dated: false,
      onRecord: false,
    })
  })

  it('a role the newest page calls finished is past', () => {
    const [role] = buildProfile([
      page('old', '2020-05-01T00:00:00Z', [fact('current_role', 'Chairman of Tesla')]),
      page('new', '2026-08-01T00:00:00Z', [fact('prior_role', 'Chairman of Tesla')]),
    ])
    expect(role).toMatchObject({ label: 'Previously', past: true, pages: 2 })
  })

  it('a role seen only on a much older page is dated, not declared over', () => {
    const profile = buildProfile([
      page('cnbc-2020', '2020-03-01T00:00:00Z', [fact('current_role', 'Chief engineer at SpaceX')]),
      page('2026', '2026-09-03T00:00:00Z', [fact('current_role', 'CEO of Tesla')]),
    ])
    expect(profile.map((f) => [f.value, f.past, f.dated])).toEqual([
      ['CEO of Tesla', false, false],
      ['Chief engineer at SpaceX', false, true],
    ])
  })

  it('leaves out pages marked as someone else, and counts a page once', () => {
    const profile = buildProfile([
      page('theirs', '2026-01-01T00:00:00Z', [fact('location', 'Austin')], { state: 'rejected' }),
      page(
        'mine',
        '2026-01-01T00:00:00Z',
        [fact('location', 'Austin'), fact('location', 'austin')],
        {
          state: 'kept',
        },
      ),
    ])
    expect(profile).toEqual([
      expect.objectContaining({ value: 'Austin', pages: 1, onRecord: true }),
    ])
  })

  it('reads who they are before what they talk about, current before earlier', () => {
    const profile = buildProfile([
      page('a', '2026-01-01T00:00:00Z', [
        fact('theme', 'Electric vehicles'),
        fact('prior_role', 'Founder of Zip2'),
        fact('education', 'University of Pennsylvania'),
        fact('current_role', 'CEO of SpaceX'),
      ]),
    ])
    expect(profile.map((f) => f.value)).toEqual([
      'CEO of SpaceX',
      'Founder of Zip2',
      'University of Pennsylvania',
      'Electric vehicles',
    ])
  })

  it('flags what pages only imply', () => {
    const [f] = buildProfile([
      page('a', null, [fact('expertise', 'Rocketry', { evidence: 'inferred' })]),
    ])
    expect(f!.worthChecking).toBe(true)
    expect(f!.asOf).toBeNull()
  })
})
