import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { logger } from '@/lib/logger'

type Client = SupabaseClient<Database>

/**
 * DEMO DATA
 * =============================================================================
 * A realistic, entirely fictional relationship record so a new account can see
 * what the product looks like once it has been used for a few months.
 *
 * Design rules:
 *   - every row is flagged is_demo, so `clear_demo_data()` removes exactly this
 *     and nothing the user created
 *   - the people are invented; no real person is depicted
 *   - the evidence spread is realistic: some CONFIRMED, more OBSERVED, a couple
 *     INFERRED, and one PROPOSED awaiting review — so the memory loop has
 *     something to demonstrate
 *   - one commitment is deliberately overdue, because that is what makes Today
 *     and the brief show their most useful behaviour
 * =============================================================================
 */

const DAY = 86_400_000

interface SeedPerson {
  key: string
  fullName: string
  preferredName: string
  jobTitle: string
  organization: string
  relationshipType: Database['public']['Enums']['relationship_type']
  relevance: number
  notes: string
  observations: {
    content: string
    category: Database['public']['Enums']['observation_category']
    evidence: Database['public']['Enums']['evidence_level']
    status: Database['public']['Enums']['observation_status']
    reinforcement?: number
  }[]
}

const PEOPLE: SeedPerson[] = [
  {
    key: 'maya',
    fullName: 'Maya Chen',
    preferredName: 'Maya',
    jobTitle: 'VP Engineering',
    organization: 'Northwind',
    relationshipType: 'skip_level',
    relevance: 5,
    notes: 'Runs the platform org. Decides on headcount moves.',
    observations: [
      {
        content: 'Asks for the recommendation before the methodology.',
        category: 'communication',
        evidence: 'confirmed',
        status: 'active',
        reinforcement: 3,
      },
      {
        content:
          'Across three decision meetings, asked for utilization evidence before agreeing to a headcount change.',
        category: 'decision',
        evidence: 'observed',
        status: 'active',
        reinforcement: 3,
      },
      {
        content: 'Pushed back on the migration timeline in March, citing the compliance deadline.',
        category: 'friction',
        evidence: 'observed',
        status: 'active',
        reinforcement: 1,
      },
      {
        content: 'Responds well when the risk is quantified rather than described.',
        category: 'trust',
        evidence: 'inferred',
        status: 'active',
      },
    ],
  },
  {
    key: 'daniel',
    fullName: 'Daniel Brooks',
    preferredName: 'Daniel',
    jobTitle: 'Finance Director',
    organization: 'Northwind',
    relationshipType: 'cross_functional',
    relevance: 4,
    notes: 'Controls the budget line for platform work.',
    observations: [
      {
        content: 'Told you directly that he wants cost impact stated before the recommendation.',
        category: 'communication',
        evidence: 'confirmed',
        status: 'active',
        reinforcement: 2,
      },
      {
        content: 'Challenged the ROI model in the last two reviews.',
        category: 'friction',
        evidence: 'observed',
        status: 'active',
        reinforcement: 2,
      },
      {
        content: 'Prefers a written summary the day before rather than being walked through slides.',
        category: 'preference',
        evidence: 'observed',
        status: 'active',
      },
    ],
  },
  {
    key: 'priya',
    fullName: 'Priya Shah',
    preferredName: 'Priya',
    jobTitle: 'Program Manager',
    organization: 'Northwind',
    relationshipType: 'peer',
    relevance: 4,
    notes: 'Coordinates the migration program across three teams.',
    observations: [
      {
        content: 'Keeps the risk register and expects it referenced in status conversations.',
        category: 'priority',
        evidence: 'observed',
        status: 'active',
        reinforcement: 2,
      },
      {
        // The one awaiting review, so the memory loop has something to show.
        content: 'May be carrying the timeline risk personally rather than escalating it.',
        category: 'context',
        evidence: 'inferred',
        status: 'proposed',
      },
    ],
  },
  {
    key: 'lucas',
    fullName: 'Lucas Martin',
    preferredName: 'Lucas',
    jobTitle: 'Account Executive',
    organization: 'Vantage Systems',
    relationshipType: 'vendor',
    relevance: 3,
    notes: 'Our account contact for the observability contract.',
    observations: [
      {
        content: 'Opens with pricing before scope. Slow down and settle scope first.',
        category: 'communication',
        evidence: 'observed',
        status: 'active',
        reinforcement: 2,
      },
    ],
  },
  {
    key: 'elena',
    fullName: 'Elena Torres',
    preferredName: 'Elena',
    jobTitle: 'Technical Lead',
    organization: 'Northwind',
    relationshipType: 'report',
    relevance: 5,
    notes: 'Leads the migration workstream.',
    observations: [
      {
        content: 'Wants the decision rationale, not just the decision.',
        category: 'communication',
        evidence: 'confirmed',
        status: 'active',
        reinforcement: 2,
      },
      {
        content: 'Raises risks early and in writing, well before they become blocking.',
        category: 'trust',
        evidence: 'observed',
        status: 'active',
        reinforcement: 4,
      },
    ],
  },
]

/**
 * Seed a demonstration relationship record.
 * Idempotent: if demo data already exists for the user, it is left alone.
 */
export async function seedDemoData(
  supabase: Client,
  userId: string,
  workspaceId: string,
): Promise<{ ok: boolean; peopleCreated: number }> {
  const own = { workspace_id: workspaceId, user_id: userId, is_demo: true } as const
  const ownVis = { ...own, visibility: 'private' as const }

  const { data: existing } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('is_demo', true)
    .limit(1)

  if (existing && existing.length > 0) {
    return { ok: true, peopleCreated: 0 }
  }

  const now = Date.now()

  try {
    // --- organisations -------------------------------------------------------
    const orgIds = new Map<string, string>()
    for (const name of ['Northwind', 'Vantage Systems']) {
      const { data } = await supabase
        .from('organizations')
        .insert({ ...ownVis, name })
        .select('id')
        .single()
      if (data) orgIds.set(name, data.id)
    }

    // --- people + observations ------------------------------------------------
    const personIds = new Map<string, string>()

    for (const [index, person] of PEOPLE.entries()) {
      const lastInteraction = new Date(now - (4 + index * 9) * DAY).toISOString()

      const { data: created } = await supabase
        .from('people')
        .insert({
          ...ownVis,
          full_name: person.fullName,
          preferred_name: person.preferredName,
          job_title: person.jobTitle,
          organization_id: orgIds.get(person.organization) ?? null,
          relationship_type: person.relationshipType,
          relevance: person.relevance,
          notes: person.notes,
          first_interaction_at: new Date(now - 180 * DAY).toISOString(),
          last_interaction_at: lastInteraction,
        })
        .select('id')
        .single()

      if (!created) continue
      personIds.set(person.key, created.id)

      for (const observation of person.observations) {
        await supabase.from('observations').insert({
          ...ownVis,
          person_id: created.id,
          content: observation.content,
          category: observation.category,
          evidence_level: observation.evidence,
          status: observation.status,
          source_kind: observation.status === 'proposed' ? 'debrief' : 'user',
          reinforcement_count: observation.reinforcement ?? 1,
        })
      }
    }

    // --- past interactions ----------------------------------------------------
    const interactions = [
      {
        title: 'Q2 platform review',
        daysAgo: 62,
        summary:
          'Walked through the platform roadmap. Maya asked for utilization data before committing to the headcount move.',
        outcome: 'Deferred the headcount decision pending utilization evidence.',
        people: ['maya', 'daniel'],
        wentWell: 3,
      },
      {
        title: 'Migration kickoff',
        daysAgo: 41,
        summary: 'Set the migration scope with Elena and Priya. Agreed the risk register cadence.',
        outcome: 'Scope agreed. Elena owns the technical plan.',
        people: ['elena', 'priya'],
        wentWell: 4,
      },
      {
        title: 'Budget check-in',
        daysAgo: 22,
        summary:
          'Daniel challenged the ROI model again. The cost impact had not been stated up front and the conversation stalled on it.',
        outcome: 'Agreed to resubmit with cost impact first.',
        people: ['daniel'],
        wentWell: 2,
      },
      {
        title: 'Vantage contract call',
        daysAgo: 12,
        summary: 'Lucas led with pricing before scope was settled. Pulled the conversation back to scope.',
        outcome: 'Scope discussion scheduled separately.',
        people: ['lucas'],
        wentWell: 3,
      },
    ]

    for (const interaction of interactions) {
      const occurredAt = new Date(now - interaction.daysAgo * DAY).toISOString()
      const { data: created } = await supabase
        .from('interactions')
        .insert({
          ...ownVis,
          kind: 'meeting',
          title: interaction.title,
          occurred_at: occurredAt,
          summary: interaction.summary,
          outcome: interaction.outcome,
          went_well: interaction.wentWell,
        })
        .select('id')
        .single()

      if (!created) continue

      for (const key of interaction.people) {
        const personId = personIds.get(key)
        if (!personId) continue
        await supabase.from('interaction_participants').insert({
          workspace_id: workspaceId,
          user_id: userId,
          interaction_id: created.id,
          person_id: personId,
        })
      }
    }

    // --- commitments, one deliberately overdue --------------------------------
    const commitments = [
      {
        description: 'Send Maya the utilization numbers for the last two quarters',
        person: 'maya',
        owner: 'user' as const,
        dueOn: new Date(now - 6 * DAY).toISOString().slice(0, 10), // overdue
      },
      {
        description: 'Resubmit the budget case with cost impact stated first',
        person: 'daniel',
        owner: 'user' as const,
        dueOn: new Date(now + 3 * DAY).toISOString().slice(0, 10),
      },
      {
        description: 'Share the updated risk register',
        person: 'priya',
        owner: 'person' as const,
        dueOn: new Date(now + 8 * DAY).toISOString().slice(0, 10),
      },
    ]

    for (const commitment of commitments) {
      const personId = personIds.get(commitment.person)
      if (!personId) continue
      await supabase.from('commitments').insert({
        ...ownVis,
        person_id: personId,
        description: commitment.description,
        owner: commitment.owner,
        owner_person_id: commitment.owner === 'person' ? personId : null,
        due_on: commitment.dueOn,
      })
    }

    // --- an upcoming meeting worth preparing for -------------------------------
    const { data: meeting } = await supabase
      .from('meetings')
      .insert({
        ...ownVis,
        title: 'Q3 capacity review',
        kind: 'executive_review',
        scheduled_at: new Date(now + 1 * DAY).toISOString(),
        duration_minutes: 45,
        objective:
          'Get approval to move two engineers onto the migration before the quarter closes.',
        stakes: 'If this slips again we miss the compliance deadline.',
        importance: 5,
      })
      .select('id')
      .single()

    if (meeting) {
      const roles: [string, Database['public']['Enums']['attendee_role']][] = [
        ['maya', 'decision_maker'],
        ['daniel', 'influencer'],
        ['priya', 'contributor'],
      ]
      for (const [key, role] of roles) {
        const personId = personIds.get(key)
        if (!personId) continue
        await supabase.from('meeting_attendees').insert({
          workspace_id: workspaceId,
          user_id: userId,
          meeting_id: meeting.id,
          person_id: personId,
          role,
        })
      }
    }

    await supabase
      .from('profiles')
      .update({ demo_seeded_at: new Date().toISOString() })
      .eq('id', userId)

    return { ok: true, peopleCreated: personIds.size }
  } catch (error) {
    logger.error('demo.seed_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, peopleCreated: 0 }
  }
}
