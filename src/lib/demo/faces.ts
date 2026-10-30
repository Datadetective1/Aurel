/**
 * The sample people's portraits are photos of invented people, shipped in
 * public/demo/faces (provenance in its README). Accounts seeded before the
 * photos stored the old drawings' `.svg` paths, so those are read as the
 * matching photo rather than rewritten in the database.
 */
const SAMPLE = /^\/demo\/faces\/([a-z]+)\.svg$/

export function sampleFace(src: string): string {
  const match = SAMPLE.exec(src)
  return match ? `/demo/faces/${match[1]}.webp` : src
}
