import { CONNECTION_META, type Connection, type ConnectionKind } from './commonality'

/**
 * WARM PATH
 * =============================================================================
 * Who, among the people the user already knows, could introduce them to
 * someone. Read from the same evidence-backed connections as the Atlas, so a
 * suggested introducer is someone the record shows actually shares something
 * with the person: a company, a former employer, a school, a meeting, a
 * conversation. Never "people you may know".
 *
 * Ranked by how close the user is to the introducer (a stranger cannot
 * introduce you to anyone) and then by how strong the tie to the person is.
 * An introducer the user has never spoken with is left out: the path has to
 * start with someone who would take the user's call.
 *
 * Pure.
 * =============================================================================
 */

export const MAX_INTRODUCERS = 3

export interface Introducer {
  id: string
  relevance: number
  lastInteractionAt: string | null
}

export interface WarmPath {
  introducerId: string
  /** "Both at Northwind", "Met together · 2 times": every tie on record. */
  ties: string[]
  evidence: 'confirmed' | 'observed'
}

const KIND_WEIGHT: Record<ConnectionKind, number> = {
  shared_conversation: 5,
  shared_meeting: 4,
  same_organization: 3,
  former_employer: 2,
  education: 1,
}

function tie(c: Connection): string {
  const base = CONNECTION_META[c.kind].label(c.label)
  return (c.kind === 'shared_meeting' || c.kind === 'shared_conversation') && c.count > 1
    ? `${base} · ${c.count} times`
    : base
}

export function warmPaths(
  targetId: string,
  connections: Connection[],
  people: Introducer[],
  now: Date = new Date(),
): WarmPath[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const grouped = new Map<string, Connection[]>()
  for (const c of connections) {
    if (c.a !== targetId && c.b !== targetId) continue
    const other = c.a === targetId ? c.b : c.a
    grouped.set(other, [...(grouped.get(other) ?? []), c])
  }

  const scored = [...grouped.entries()].flatMap(([id, ties]) => {
    const person = byId.get(id)
    if (!person || !person.lastInteractionAt) return []
    const days = (now.getTime() - new Date(person.lastInteractionAt).getTime()) / 86_400_000
    // Closeness: how important, and how recently spoken to.
    const closeness = person.relevance * 2 + (days <= 30 ? 3 : days <= 90 ? 2 : days <= 365 ? 1 : 0)
    const strength = ties.reduce((sum, c) => sum + KIND_WEIGHT[c.kind] * Math.min(c.count, 3), 0)
    const sorted = [...ties].sort((x, y) => KIND_WEIGHT[y.kind] - KIND_WEIGHT[x.kind])
    return [
      {
        path: {
          introducerId: id,
          ties: sorted.map(tie),
          evidence: ties.some((c) => c.evidence === 'confirmed')
            ? ('confirmed' as const)
            : ('observed' as const),
        },
        score: closeness * 10 + strength,
      },
    ]
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INTRODUCERS)
    .map((s) => s.path)
}
