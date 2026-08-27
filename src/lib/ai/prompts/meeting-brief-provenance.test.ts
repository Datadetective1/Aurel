import { describe, expect, it } from 'vitest'
import { meetingBriefPrompt } from './meeting-brief'

/**
 * Provenance is not the model's to decide.
 *
 * publicContext renders under "From public sources" and publicOnly prints
 * "this is who they are professionally, not how they work with you". Both are
 * claims about where evidence came from.
 *
 * The model is handed the user's own interaction history as context, so left to
 * itself it summarises that history into the public field. Observed on
 * production: a person with one logged interaction and zero accepted public
 * sources had that private meeting note displayed under "From public sources",
 * cited to the note itself, above a line saying the guidance was preliminary
 * until the user had met them. They had met them. It was the only evidence
 * there was.
 */

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    displayName: "Amary Coulibaly",
    jobTitle: null,
    relationshipType: "peer",
    relevance: 3,
    interactionCount: 1,
    lastInteractionAt: "2026-08-26T22:01:00Z",
    openCommitments: [],
    observations: [],
    professionalFacts: [],
    ...overrides,
  } as never
}

function input(people: unknown[]) {
  return {
    meeting: {
      title: "Databricks Training",
      kind: "internal",
      scheduledAt: "2026-09-09T14:00:00Z",
      durationMinutes: 120,
      importance: 3,
      objective: "Agree a shorter session.",
      stakes: null,
      extraContext: null,
      participants: people,
    },
    user: { coachingStyle: "direct" },
  } as never
}

/** What the model produced on production, reduced to the fields at issue. */
function modelOutput() {
  return {
    sixtySecond: "s",
    objective: "o",
    recommendedApproach: ["a", "b"],
    participants: [
      {
        personId: "p1",
        name: "Amary Coulibaly",
        relevance: "peer",
        whatMatters: [],
        guidance: [],
        knownConcerns: [],
        relationshipNote: "n",
        publicContext: [
          {
            statement: "Amary pushed back on a two-hour session and asked for cost per seat.",
            sourceLabel: "2026-08-26 Kickoff call on the Databricks rollout",
          },
        ],
        publicOnly: true,
      },
    ],
  } as never
}

describe("reconcile", () => {
  it("is defined -- generated output is not trusted for provenance", () => {
    expect(meetingBriefPrompt.reconcile).toBeDefined()
  })

  it("drops public context the record does not support", () => {
    // Zero professional facts, so there is no such thing as public context for
    // this person, whatever the model wrote.
    const result = meetingBriefPrompt.reconcile!(modelOutput(), input([person()]))
    expect(result.participants[0]!.publicContext).toEqual([])
  })

  it("never marks someone public-only when the user has met them", () => {
    const result = meetingBriefPrompt.reconcile!(modelOutput(), input([person()]))
    expect(result.participants[0]!.publicOnly).toBe(false)
  })

  it("never carries a private interaction into the public field", () => {
    const result = meetingBriefPrompt.reconcile!(modelOutput(), input([person()]))
    const labels = result.participants[0]!.publicContext.map((c) => c.sourceLabel ?? "")
    expect(labels.join(" ")).not.toContain("Kickoff call")
  })

  it("strips provenance for a participant it cannot match to the record", () => {
    // An unattributable public claim is the one least worth displaying.
    const result = meetingBriefPrompt.reconcile!(modelOutput(), input([]))
    expect(result.participants[0]!.publicContext).toEqual([])
    expect(result.participants[0]!.publicOnly).toBe(false)
  })

  it("leaves the rest of the brief alone", () => {
    const result = meetingBriefPrompt.reconcile!(modelOutput(), input([person()]))
    expect(result.participants[0]!.guidance).toEqual([])
    expect(result.recommendedApproach).toEqual(["a", "b"])
    expect(result.sixtySecond).toBe("s")
  })
})
