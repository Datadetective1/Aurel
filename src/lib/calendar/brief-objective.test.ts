import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Links that lead back to where you already are.
 *
 * /meetings/[id] is not a page -- it redirects unconditionally to
 * /meetings/[id]/brief. The brief panel linked to it twice, so a user sitting
 * on the brief was told the brief would be sharper with an objective, offered a
 * link, and returned to the brief with nothing changed. A meeting created from
 * a calendar event has no other surface, so there was no way to set one at all.
 *
 * The existing internal-links test only asks whether a route exists. This one
 * asks whether it goes anywhere, which is the property that broke.
 */

const redirectOnly = readFileSync(
  join(process.cwd(), 'src', 'app', '(app)', 'meetings', '[id]', 'page.tsx'),
  'utf8',
)
const panel = readFileSync(
  join(process.cwd(), 'src', 'components', 'app', 'generate-brief.tsx'),
  'utf8',
)

describe('the brief panel does not link to itself', () => {
  it('confirms /meetings/[id] is still only a redirect', () => {
    // If this ever becomes a real page, the rule below can relax.
    expect(redirectOnly).toContain('redirect(')
    expect(redirectOnly).toContain('/brief')
  })

  it('sets the objective in place rather than linking away', () => {
    expect(panel).toContain('updateMeetingObjective')
    expect(panel).not.toMatch(/add it/)
  })

  it('adds participants in place rather than linking away', () => {
    // Same loop, same fix. Both CTAs on this panel pointed at /meetings/[id].
    expect(panel).toContain('AddParticipants')
  })

  it('no longer links anywhere that redirects straight back here', () => {
    // The property that actually broke, stated once for both.
    expect(panel).not.toMatch(/href=\{`\/meetings\/\$\{meetingId\}`\}/)
  })
})
