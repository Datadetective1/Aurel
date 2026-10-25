/**
 * What each evidence level means, in words. Shared by the web's evidence
 * badge and the app, so a claim reads the same on both. Icons and colours
 * belong to each platform; the words do not.
 */
export type EvidenceLevel = 'confirmed' | 'observed' | 'inferred' | 'unknown'

export const EVIDENCE_WORDS: Record<EvidenceLevel, { label: string; description: string }> = {
  confirmed: { label: 'Confirmed', description: 'They said it, or you confirmed it.' },
  observed: { label: 'Observed', description: 'Supported by interactions or sources on record.' },
  inferred: { label: 'Inferred', description: 'A reading of limited evidence. Worth checking.' },
  unknown: { label: 'Unknown', description: 'Not enough information to say.' },
}
