import { describe, expect, it } from 'vitest'
import {
  detectSpeakerLabels,
  excerptSpeaker,
  isSelfLabel,
  labelIsPerson,
  matchPerson,
  rankPeople,
  unknownSpeakers,
} from './speakers'

/**
 * Who is in a transcript, and whether we already know them.
 *
 * The first production conversation was between Amary and Adama. The picker
 * offered only existing people, so Jonathan was attached instead. These pin
 * the detection that now says "Adama appears in this conversation", the
 * matching that shows a probable existing person first, and the label reading
 * that lets a late-added person collect their own promises.
 */

const TRANSCRIPT = [
  'Amary: I’ll send you the revised proposal by September 11, 2026.',
  '',
  'Adama: I’ll send you the updated requirements by September 14, 2026.',
  '',
  'Amary: We decided to use Option B for the pilot.',
  'Adama: Can you confirm who owns the migration plan?',
  'Note: the dashboard review was parked.',
].join('\n')

const people = [
  { id: 'j', fullName: 'Jonathan Mitchell', preferredName: null },
  { id: 'c', fullName: 'Columbus Brown', preferredName: null },
  { id: 'r', fullName: 'Ravi Menon', preferredName: 'Rav' },
]

describe('detectSpeakerLabels', () => {
  it('finds the speakers, most talkative first, and ignores headings', () => {
    expect(detectSpeakerLabels(TRANSCRIPT)).toEqual([
      { label: 'Amary', lines: 2 },
      { label: 'Adama', lines: 2 },
    ])
  })

  it('reads two-word names, bracketed timestamps and CRLF', () => {
    const text = '[00:01] Ravi Menon: fine.\r\nSpeaker 1: hello.\r\nRavi Menon - and again.'
    expect(detectSpeakerLabels(text)).toEqual([{ label: 'Ravi Menon', lines: 2 }])
  })
})

describe('isSelfLabel', () => {
  it('recognises the account holder by full, preferred or first name', () => {
    const names = ['Amary Coulibaly', 'Amary']
    expect(isSelfLabel('Amary', names)).toBe(true)
    expect(isSelfLabel('Amary Coulibaly', names)).toBe(true)
    expect(isSelfLabel('Me', names)).toBe(true)
    expect(isSelfLabel('Adama', names)).toBe(false)
  })
})

describe('matchPerson', () => {
  it('matches an exact full or preferred name', () => {
    expect(matchPerson('jonathan mitchell', people)).toMatchObject({
      kind: 'exact',
      person: { id: 'j' },
    })
    expect(matchPerson('Rav', people)).toMatchObject({ kind: 'exact', person: { id: 'r' } })
  })

  it('offers a probable match on first name, never as certain', () => {
    expect(matchPerson('Jonathan', people)).toMatchObject({ kind: 'probable', person: { id: 'j' } })
    expect(matchPerson('Ravi M.', people)).toMatchObject({ kind: 'probable', person: { id: 'r' } })
  })

  it('finds nothing for a new name', () => {
    expect(matchPerson('Adama', people)).toEqual({ kind: 'none' })
  })
})

describe('unknownSpeakers', () => {
  it('names the speakers who are not the user and not yet in the room', () => {
    const out = unknownSpeakers(TRANSCRIPT, {
      userNames: ['Amary Coulibaly', 'Amary'],
      participants: [],
      people,
    })
    expect(out).toEqual([{ label: 'Adama', lines: 2, match: { kind: 'none' } }])
  })

  it('stops suggesting once the person is a participant, and offers a probable match', () => {
    const text = 'Jonathan: I will check.\nAdama: thanks.'
    const out = unknownSpeakers(text, {
      userNames: ['Amary'],
      participants: [people[1]!],
      people,
    })
    expect(out.map((s) => s.label)).toEqual(['Jonathan', 'Adama'])
    expect(out[0]!.match).toMatchObject({ kind: 'probable', person: { id: 'j' } })
    const withJonathan = unknownSpeakers(text, {
      userNames: ['Amary'],
      participants: [people[0]!],
      people,
    })
    expect(withJonathan.map((s) => s.label)).toEqual(['Adama'])
  })
})

describe('rankPeople and labels', () => {
  it('ranks an exact match, then probable, then contains', () => {
    expect(rankPeople('Jon', people).map((r) => `${r.person.id}:${r.match}`)).toEqual([
      'j:contains',
    ])
    expect(rankPeople('Jonathan', people).map((r) => `${r.person.id}:${r.match}`)).toEqual([
      'j:probable',
    ])
    expect(rankPeople('', people)).toHaveLength(3)
  })

  it('reads the speaker back out of an excerpt', () => {
    expect(excerptSpeaker("Adama: I'll send the requirements")).toBe('Adama')
    expect(excerptSpeaker("I'll send the requirements")).toBeNull()
    expect(labelIsPerson('Adama', { id: 'a', fullName: 'Adama Diallo', preferredName: null })).toBe(
      true,
    )
    expect(labelIsPerson('Adama', people[0]!)).toBe(false)
  })
})
