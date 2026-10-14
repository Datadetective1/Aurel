/**
 * EVIDENCE-BACKED CONNECTIONS
 * =============================================================================
 * What two people in the user's record verifiably have in common, and nothing
 * else. Atturel is professional relationship intelligence, not people search:
 * this module draws a line between two people only when the record itself
 * holds both ends of it.
 *
 *   same_organization   both are recorded at the same organisation
 *   former_employer     both carry the same prior employer as a sourced fact
 *   education           both carry the same institution as a sourced fact
 *   shared_meeting      both were attendees of the same meeting
 *   shared_conversation both took part in the same kept conversation
 *
 * Facts count only at `confirmed` or `observed`. An inferred fact cannot hold
 * up a connection: a line on a map reads as a claim, and "inferred" is not a
 * claim the product will draw.
 *
 * Matching is exact after normalising case, punctuation and whitespace.
 * "Stanford" and "Stanford University" are NOT joined -- a missed connection
 * costs nothing, a wrong one is a false statement about two real people.
 *
 * Never inferred, by construction: family, romance, address or location
 * proximity, private associations, "possible associates". The input types
 * have no field that could carry them.
 * =============================================================================
 */

export type ConnectionKind =
  'same_organization' | 'former_employer' | 'education' | 'shared_meeting' | 'shared_conversation'

export interface Connection {
  a: string
  b: string
  kind: ConnectionKind
  /** The shared thing, as the record names it: "Bell", "Stanford University". */
  label: string
  /** How many times, for shared meetings and conversations. */
  count: number
  evidence: 'confirmed' | 'observed'
}

export interface ConnectionPerson {
  id: string
  organizationId: string | null
  organizationName: string | null
}

export interface ConnectionFact {
  personId: string
  kind: 'prior_role' | 'education' | string
  /** For prior roles, the organisation; for education, the institution. */
  value: string
  evidence: 'confirmed' | 'observed' | 'inferred' | 'unknown'
}

export interface ConnectionInput {
  people: ConnectionPerson[]
  facts?: ConnectionFact[]
  /** Meeting id -> attendee person ids. */
  meetings?: { id: string; personIds: string[] }[]
  /** Conversation id -> participant person ids. */
  conversations?: { id: string; personIds: string[] }[]
}

export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export const CONNECTION_META: Record<ConnectionKind, { label: (shared: string) => string }> = {
  same_organization: { label: (s) => `Both at ${s}` },
  former_employer: { label: (s) => `Both previously at ${s}` },
  education: { label: (s) => `Both studied at ${s}` },
  shared_meeting: { label: () => 'Met together' },
  shared_conversation: { label: () => 'In a conversation together' },
}

export function findConnections(input: ConnectionInput): Connection[] {
  const known = new Set(input.people.map((p) => p.id))
  const out = new Map<string, Connection>()

  const add = (c: Connection) => {
    const [a, b] = pairKey(c.a, c.b)
    if (a === b || !known.has(a) || !known.has(b)) return
    const key = `${a}|${b}|${c.kind}|${normaliseName(c.label)}`
    const existing = out.get(key)
    if (existing) {
      existing.count += c.count
      if (c.evidence === 'confirmed') existing.evidence = 'confirmed'
      return
    }
    out.set(key, { ...c, a, b })
  }

  // --- same organisation, from the person records themselves ---------------
  const byOrg = new Map<string, ConnectionPerson[]>()
  for (const p of input.people) {
    if (!p.organizationId || !p.organizationName) continue
    byOrg.set(p.organizationId, [...(byOrg.get(p.organizationId) ?? []), p])
  }
  for (const members of byOrg.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        add({
          a: members[i]!.id,
          b: members[j]!.id,
          kind: 'same_organization',
          label: members[i]!.organizationName!,
          count: 1,
          evidence: 'confirmed',
        })
      }
    }
  }

  // --- sourced facts: prior employer, education -----------------------------
  const factGroups = new Map<
    string,
    { kind: ConnectionKind; label: string; members: Map<string, ConnectionFact['evidence']> }
  >()
  for (const f of input.facts ?? []) {
    if (f.evidence !== 'confirmed' && f.evidence !== 'observed') continue
    const kind: ConnectionKind | null =
      f.kind === 'prior_role' ? 'former_employer' : f.kind === 'education' ? 'education' : null
    if (!kind) continue
    const norm = normaliseName(f.value)
    if (norm.length < 2) continue
    const key = `${kind}|${norm}`
    const group = factGroups.get(key) ?? { kind, label: f.value.trim(), members: new Map() }
    const prior = group.members.get(f.personId)
    if (!prior || f.evidence === 'confirmed') group.members.set(f.personId, f.evidence)
    factGroups.set(key, group)
  }
  for (const group of factGroups.values()) {
    const ids = [...group.members.keys()]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const both =
          group.members.get(ids[i]!) === 'confirmed' && group.members.get(ids[j]!) === 'confirmed'
        add({
          a: ids[i]!,
          b: ids[j]!,
          kind: group.kind,
          label: group.label,
          count: 1,
          evidence: both ? 'confirmed' : 'observed',
        })
      }
    }
  }

  // --- shared history: meetings and conversations ---------------------------
  const together = (
    rows: { id: string; personIds: string[] }[] | undefined,
    kind: 'shared_meeting' | 'shared_conversation',
  ) => {
    for (const row of rows ?? []) {
      const ids = [...new Set(row.personIds)]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          add({ a: ids[i]!, b: ids[j]!, kind, label: '', count: 1, evidence: 'confirmed' })
        }
      }
    }
  }
  together(input.meetings, 'shared_meeting')
  together(input.conversations, 'shared_conversation')

  return [...out.values()]
}

/** Every connection touching one person, strongest kinds first. */
export function connectionsFor(personId: string, connections: Connection[]): Connection[] {
  const order: ConnectionKind[] = [
    'shared_conversation',
    'shared_meeting',
    'same_organization',
    'former_employer',
    'education',
  ]
  return connections
    .filter((c) => c.a === personId || c.b === personId)
    .sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || y.count - x.count)
}

export function describeConnection(c: Connection): string {
  const base = CONNECTION_META[c.kind].label(c.label)
  if ((c.kind === 'shared_meeting' || c.kind === 'shared_conversation') && c.count > 1) {
    return `${base} · ${c.count} times`
  }
  return base
}
