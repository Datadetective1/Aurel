/**
 * MARKETING FIXTURES
 * =============================================================================
 * Invented people, organisations and meetings for the public homepage. None of
 * them is a real person, a real customer or anyone in the product's database.
 *
 * Their portraits are AI-generated images of people who do not exist, made for
 * this page and served from `public/people`. They are never anyone's uploaded
 * photo; provenance is recorded in `public/people/README.md`.
 *
 * The homepage never reads production data. Everything it shows comes from
 * this file, and nothing here is shared with `app/dev/preview`, whose
 * fixtures reuse first names the public page must not carry.
 * =============================================================================
 */

export interface DemoPerson {
  id: string
  name: string
  role: string
  org: string
  /** How they sit in this meeting, as the app labels it. */
  context: string
  /** A generated portrait of a fictional person, from `public/people`. */
  photo: string
}

export const ELENA: DemoPerson = {
  id: 'elena',
  name: 'Elena Marsh',
  role: 'VP Operations',
  org: 'Larkspur Health',
  context: 'Decision maker',
  photo: '/people/elena-marsh.webp',
}

export const THEO: DemoPerson = {
  id: 'theo',
  name: 'Theo Lindqvist',
  role: 'Finance Director',
  org: 'Larkspur Health',
  context: 'Influencer',
  photo: '/people/theo-lindqvist.webp',
}

export const NADIA: DemoPerson = {
  id: 'nadia',
  name: 'Nadia Osei',
  role: 'Program Lead',
  org: 'Fernway Partners',
  context: 'Contributor',
  photo: '/people/nadia-osei.webp',
}

export const ROOM = [ELENA, THEO, NADIA]

export const MEETING = {
  title: 'Platform renewal review',
  when: 'Thursday · 10:00',
  countdown: 'In 2 h 15 min',
  objective: 'Agree the renewal scope and leave with a dated plan.',
}

export const REMEMBER = [
  {
    text: 'Elena wants adoption by team before she expands.',
    basis: 'Last meeting · Pilot review',
  },
  {
    text: 'Theo asks for the cost impact before the recommendation.',
    basis: 'Confirmed · what matters to Theo',
  },
  {
    text: 'Nadia sees onboarding capacity as the main risk.',
    basis: 'Observed in two conversations',
  },
]

export const OPEN_LOOP = {
  text: 'Send Elena the adoption breakdown by team',
  meta: 'I owe them · due today',
}

export const firstName = (p: DemoPerson) => p.name.split(' ')[0]!
