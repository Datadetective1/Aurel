import { describe, expect, it } from 'vitest'
import {
  describeDeletion,
  isPersonId,
  literalLike,
  matchDuplicate,
  mentions,
  namesFor,
  type DeletionPreview,
  type DuplicateCandidate,
} from './lifecycle'

const candidate = (over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id: 'p1',
  full_name: 'Dana Whitfield',
  preferred_name: null,
  email: null,
  profile_url: null,
  archived_at: null,
  organization: 'Northwind',
  ...over,
})

describe('a retained loop that still names someone', () => {
  const names = namesFor({ full_name: 'Dana Whitfield', preferred_name: 'Dee' })

  it('knows every name a note might use', () => {
    expect(names).toEqual(['Dana Whitfield', 'Dana', 'Dee'])
  })

  it('finds the full name, the first name, or the preferred name, in any case', () => {
    expect(mentions('Send the revised proposal to Dana Whitfield by Friday.', names)).toBe(true)
    expect(mentions('ask dana about the pilot', names)).toBe(true)
    expect(mentions('Dee will introduce the finance lead', names)).toBe(true)
  })

  it('matches whole words only', () => {
    expect(mentions('Update the Danalytics dashboard', names)).toBe(false)
    expect(mentions('Deep-dive on the renewal', names)).toBe(false)
  })

  it('does not flag text that does not name them', () => {
    expect(mentions('Share the hiring plan by Tuesday', names)).toBe(false)
    expect(mentions(null, names)).toBe(false)
  })

  it('treats a name with regex characters literally', () => {
    const odd = namesFor({ full_name: 'J.R. (Bob) Smith', preferred_name: null })
    expect(mentions('Call J.R. (Bob) Smith tomorrow', odd)).toBe(true)
    expect(mentions('Call JxRx Bob Smith', odd)).toBe(false)
  })

  it('ignores a first name too short to be meaningful', () => {
    expect(namesFor({ full_name: 'Al Lee', preferred_name: null })).toEqual(['Al Lee'])
  })
})

describe('the person you are adding probably already exists', () => {
  it('matches on email first, then profile link, then the identical name', () => {
    const byEmail = candidate({
      id: 'email',
      full_name: 'D. Whitfield',
      email: 'dana@northwind.com',
    })
    const byName = candidate({ id: 'name' })
    expect(
      matchDuplicate([byName, byEmail], {
        fullName: 'Dana Whitfield',
        email: 'DANA@northwind.com ',
      }),
    ).toMatchObject({ candidate: { id: 'email' }, reason: 'email' })
    expect(matchDuplicate([byName], { fullName: '  dana whitfield ' })).toMatchObject({
      candidate: { id: 'name' },
      reason: 'name',
    })
    expect(
      matchDuplicate([candidate({ profile_url: 'https://northwind.com/dana' })], {
        fullName: 'Someone Else',
        profileUrl: 'https://northwind.com/dana',
      }),
    ).toMatchObject({ reason: 'profile' })
  })

  it('prefers the active record over an archived one with the same name', () => {
    const archived = candidate({ id: 'old', archived_at: '2026-10-01T00:00:00Z' })
    const active = candidate({ id: 'current' })
    expect(matchDuplicate([archived, active], { fullName: 'Dana Whitfield' })?.candidate.id).toBe(
      'current',
    )
  })

  it('offers an archived record when it is the only match', () => {
    const archived = candidate({ id: 'old', archived_at: '2026-10-01T00:00:00Z' })
    expect(matchDuplicate([archived], { fullName: 'Dana Whitfield' })?.candidate.archived_at).toBe(
      '2026-10-01T00:00:00Z',
    )
  })

  it('does not treat empty email or link as a match', () => {
    expect(matchDuplicate([candidate()], { fullName: 'Another Person', email: '' })).toBeNull()
  })

  it('escapes LIKE wildcards so a name matches only itself', () => {
    expect(literalLike('100%_sure\\')).toBe('100\\%\\_sure\\\\')
  })
})

describe('ids from the client', () => {
  it('only a well-formed id reaches a query', () => {
    expect(isPersonId('7f0d3c1e-5a4b-4c8d-9e2f-1a2b3c4d5e6f')).toBe(true)
    expect(isPersonId('7f0d3c1e-5a4b-4c8d-9e2f-1a2b3c4d5e6f,owner_person_id.eq.x')).toBe(false)
    expect(isPersonId('')).toBe(false)
    expect(isPersonId(undefined)).toBe(false)
  })
})

describe('the deletion confirmation says exactly what happens', () => {
  const preview: DeletionPreview = {
    person: { id: 'p1', name: 'Dana', archivedAt: '2026-10-25T00:00:00Z' },
    deleted: { observations: 3, notes: 1, facts: 0, sources: 2, researchRuns: 1, photo: true },
    unlinked: {
      loops: 2,
      meetings: 1,
      conversations: 4,
      decisions: 0,
      notes: 1,
      briefCitations: 0,
    },
    retainedLoops: [
      { id: 'l1', description: 'Send Dana the proposal', status: 'open', mentionsPerson: true },
      { id: 'l2', description: 'Share the deck', status: 'done', mentionsPerson: false },
    ],
  }

  it('lists what goes, what stays unlinked, and how many retained loops still name them', () => {
    expect(describeDeletion(preview)).toEqual({
      deleted: [
        '3 things you noted about them',
        '1 note about them',
        '2 public sources about them',
        '1 research run',
        'their photo',
      ],
      unlinked: ['2 loops', '1 meeting', '4 conversations', '1 meeting or conversation note'],
      identifyingLoops: 1,
    })
  })

  it('leaves out anything at zero', () => {
    const empty: DeletionPreview = {
      ...preview,
      deleted: { observations: 0, notes: 0, facts: 0, sources: 0, researchRuns: 0, photo: false },
      unlinked: {
        loops: 0,
        meetings: 0,
        conversations: 0,
        decisions: 0,
        notes: 0,
        briefCitations: 0,
      },
      retainedLoops: [],
    }
    expect(describeDeletion(empty)).toEqual({ deleted: [], unlinked: [], identifyingLoops: 0 })
  })
})
