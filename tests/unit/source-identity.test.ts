import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SOURCE IDENTITY: TWO ACTIONS THAT MUST NOT BLUR
 * =============================================================================
 * Public search returns pages about other people with the same name. The user
 * has two ways to correct that, and they do genuinely different things:
 *
 *   "This is someone else"  keeps the page on file, flagged no_match, so
 *                           research will not attribute it to this person
 *                           again. Rejecting TEACHES.
 *
 *   "Delete"                removes the source row entirely. Research may
 *                           rediscover the same URL later. Deleting FORGETS.
 *
 * Both withdraw whatever rested on that source alone. A real user could not
 * tell them apart, which is what these tests exist to stop recurring.
 * =============================================================================
 */

const SRC = join(__dirname, '..', '..', 'src')
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ui = () => stripComments(read('components', 'app', 'source-controls.tsx'))
const actions = () => stripComments(read('app', '(app)', 'people', 'research-actions.ts'))

describe('the user is told which of the two things they are doing', () => {
  it('asks the identity question in words, naming the person', () => {
    // "Is this about Dana Whitfield?" beats inferring the question from two
    // button labels.
    expect(ui()).toMatch(/Is this about \{personName\}/)
  })

  it('states the consequence that distinguishes rejection from deletion', () => {
    const source = ui()
    // Rejection: the page is kept so it will not be used again.
    expect(source).toMatch(/keeps the page on file/i)
    // Deletion: gone, and findable again.
    expect(source).toMatch(/research may find it again/i)
  })

  it('counts what is withdrawn instead of describing it vaguely', () => {
    expect(ui()).toMatch(/withdrawn/)
    expect(ui()).toMatch(/factCount/)
    expect(ui()).toMatch(/observationCount/)
  })
})

describe('both destructive actions ask first', () => {
  it('confirms rejection, not only deletion', () => {
    // Rejection used to fire on the first click while the more
    // alarming-sounding "Delete" asked first -- so the gentler-sounding action
    // was the unguarded one.
    const source = ui()
    expect(source).toMatch(/confirmingReject/)
    expect(source).toMatch(/confirmingDelete/)
  })

  it('opening one confirmation closes the other', () => {
    // Two open confirmations side by side is four buttons and no clear answer
    // to "which am I confirming".
    const source = ui()
    expect(source).toMatch(/setConfirmingReject\(true\)[\s\S]{0,80}setConfirmingDelete\(false\)/)
    expect(source).toMatch(/setConfirmingDelete\(true\)[\s\S]{0,80}setConfirmingReject\(false\)/)
  })
})

describe('badges say what to do, not what the resolver decided', () => {
  const source = ui()

  it('drops the internal confidence vocabulary', () => {
    // "Probable match" / "Uncertain match" / "Conflicting" / "Unreviewed" are
    // four states of a model the user cannot see. "Conflicting" has no
    // referent on screen at all.
    expect(source).not.toMatch(/Probable match/)
    expect(source).not.toMatch(/Uncertain match/)
    expect(source).not.toMatch(/'Conflicting'|"Conflicting"|>Conflicting</)
    expect(source).not.toMatch(/'Unreviewed'|"Unreviewed"|>Unreviewed</)
  })

  it('says nothing at all when nothing needs doing', () => {
    // A row of green ticks trains people to stop reading badges.
    expect(source).toMatch(/confirmed:\s*null/)
    expect(source).toMatch(/probable:\s*null/)
  })

  it('asks one clear question when a human is actually needed', () => {
    expect(source).toMatch(/Check this is them/)
  })
})

describe('rejection and deletion withdraw the same things', () => {
  const src = actions()

  it('rejection withdraws proposals, not only facts', () => {
    // It did not, and deletion did. A page the user had explicitly said was
    // about somebody else left its proposed observations in the review queue,
    // ready to be accepted into the record of a person they were never about.
    const reject = src.slice(
      src.indexOf('export async function rejectSourceMatch'),
      src.indexOf('export async function confirmSourceMatch'),
    )
    expect(reject).toMatch(/removeOrphanedFacts/)
    expect(reject).toMatch(/removeProposedObservations/)
  })

  it('deletion does the same, through the same helper', () => {
    const del = src.slice(src.indexOf('export async function deleteSource'))
    expect(del).toMatch(/removeOrphanedFacts/)
    expect(del).toMatch(/removeProposedObservations/)
  })

  it('never withdraws an observation the user confirmed', () => {
    // Once somebody has vouched for a claim they are the evidence, not the
    // page it came from.
    expect(src).toMatch(/\.eq\('status', 'proposed'\)/)
  })

  it('keeps the source row on rejection and removes it on deletion', () => {
    // This is the whole difference. If rejection ever started deleting the
    // row, the copy above would silently become a lie.
    const reject = src.slice(
      src.indexOf('export async function rejectSourceMatch'),
      src.indexOf('export async function confirmSourceMatch'),
    )
    expect(reject).not.toMatch(/from\('sources'\)\s*\.delete\(\)/)
    expect(reject).toMatch(/identity_match_status: 'no_match'/)

    const del = src.slice(src.indexOf('export async function deleteSource'))
    expect(del).toMatch(/from\('sources'\)\.delete\(\)/)
  })
})

describe('identity decisions are reachable on a phone', () => {
  it('uses 44px targets, not the 32px small variant', () => {
    // These are irreversible decisions about whose record a claim belongs to.
    const buttons = ui().match(/<Button[\s\S]{0,220}?>/g) ?? []
    const actionButtons = buttons.filter((b) => /size="sm"/.test(b))
    expect(actionButtons.length).toBeGreaterThan(0)
    for (const button of actionButtons) {
      expect(button, `a source action button is below 44px:\n${button}`).toMatch(/min-h-11/)
    }
  })
})
