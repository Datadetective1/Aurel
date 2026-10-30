import type { ResearchFact, ResearchProfileFact } from '@/lib/mobile/contracts'
import { foldText } from './matching'
import { factLabel, type ReviewState } from './review'

/**
 * ONE PROFILE FROM MANY PAGES
 * =============================================================================
 * Five articles about one person say "CEO of Tesla" five times, in five ways,
 * some of them years apart. Shown card by card that reads as noise, and an
 * old article's role sits beside today's as if both were current.
 *
 * So the facts of every page not set aside are merged: one line per thing
 * said, with how many pages say it and the newest date among them. A role
 * the newest page mentioning it calls finished is past. A role last seen on
 * pages much older than the newest one is marked as dated rather than past:
 * an article about one company does not end someone's job at another.
 *
 * Pure, so it is tested directly.
 * =============================================================================
 */

export interface ProfilePage {
  id: string
  state: ReviewState
  /** The date the reader sees: when it was last updated, else published. */
  date: string | null
  facts: ResearchFact[]
}

/** Older than the newest page by this much, and a role is only "as of" its date. */
const DATED_AFTER_MS = 2 * 365.25 * 24 * 60 * 60 * 1000

/** Kinds that are one thing whether a page calls it current or earlier. */
const SAME_KIND: Record<string, string> = {
  current_role: 'role',
  prior_role: 'role',
}

/** The order a profile reads in: who they are first, what they talk about last. */
const KIND_ORDER = [
  'role',
  'current_organization',
  'location',
  'education',
  'expertise',
  'publication',
  'appearance',
  'theme',
  'communication_signal',
]

/** Words that change nothing about which fact it is. */
const FILLER = new Set(['a', 'an', 'the', 'of', 'at', 'and', 'for', 'in', 'on', 'with'])

/** "CEO of Tesla, Inc." and "Tesla CEO" are one fact. */
function valueKey(value: string): string {
  return foldText(value)
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(
      (word) => word && !FILLER.has(word) && !['inc', 'llc', 'ltd', 'corp', 'co'].includes(word),
    )
    .sort()
    .join(' ')
}

function time(date: string | null): number | null {
  if (!date) return null
  const ms = Date.parse(date)
  return Number.isNaN(ms) ? null : ms
}

interface Mention {
  pageId: string
  state: ReviewState
  at: number | null
  fact: ResearchFact
}

export function buildProfile(pages: ProfilePage[]): ResearchProfileFact[] {
  const used = pages.filter((page) => page.state !== 'rejected')
  const groups = new Map<string, Mention[]>()
  for (const page of used) {
    const at = time(page.date)
    for (const fact of page.facts) {
      const key = valueKey(fact.value)
      if (!key) continue
      const id = `${SAME_KIND[fact.kind] ?? fact.kind}:${key}`
      const mentions = groups.get(id) ?? []
      // One page saying it twice is still one page.
      if (!mentions.some((m) => m.pageId === page.id)) {
        mentions.push({ pageId: page.id, state: page.state, at, fact })
      }
      groups.set(id, mentions)
    }
  }

  const dates = used.map((page) => time(page.date)).filter((at): at is number => at !== null)
  const newest = dates.length ? Math.max(...dates) : null

  const profile = [...groups.entries()].map(([id, mentions]) => {
    const kind = id.slice(0, id.indexOf(':'))
    // The newest mention speaks for the fact; undated ones count after dated.
    const latest = [...mentions].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity))[0]!
    const asOf = latest.at
    const isRole = kind === 'role' || kind === 'current_organization'
    const past = isRole && (latest.fact.kind === 'prior_role' || !latest.fact.current)
    const dated =
      isRole && !past && asOf !== null && newest !== null && newest - asOf >= DATED_AFTER_MS
    return {
      kind,
      label: past ? factLabel('prior_role') : factLabel(latest.fact.kind),
      value: latest.fact.value,
      pages: mentions.length,
      asOf: asOf === null ? null : new Date(asOf).toISOString(),
      past,
      dated,
      onRecord: mentions.some((m) => m.state === 'kept'),
      worthChecking: mentions.every((m) => m.fact.evidence === 'inferred'),
    } satisfies ResearchProfileFact
  })

  const order = (kind: string) => {
    const at = KIND_ORDER.indexOf(kind)
    return at === -1 ? KIND_ORDER.length : at
  }
  return profile.sort(
    (a, b) =>
      order(a.kind) - order(b.kind) ||
      Number(a.past || a.dated) - Number(b.past || b.dated) ||
      b.pages - a.pages ||
      (b.asOf ?? '').localeCompare(a.asOf ?? ''),
  )
}
