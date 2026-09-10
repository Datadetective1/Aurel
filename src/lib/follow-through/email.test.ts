import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { followThroughEmail, type FollowThroughItem } from '@/lib/email/templates'
import { toPlainText } from '@/lib/email/layout'

/**
 * The follow-through email, rendered.
 *
 * Nothing critical may depend on an image: a client that blocks pictures
 * still has to show who each line is about, what is owed, and where it
 * leads. And the wording must keep saying who owes what once it is HTML.
 */

function item(over: Partial<FollowThroughItem> = {}): FollowThroughItem {
  return {
    phrase: "You said you'd send the proposal.",
    timing: { label: 'Due today', tone: 'today' },
    source: 'Promised in Budget sync, 24 Aug',
    person: { name: 'Jason Ortiz', initials: 'JO', photoUrl: null },
    href: 'https://example.invalid/loops?focus=abc',
    personHref: 'https://example.invalid/people/p1',
    sourceHref: 'https://example.invalid/conversations/c1',
    ...over,
  }
}

const build = (items: FollowThroughItem[], more = 0) =>
  followThroughEmail({
    firstName: 'Alex',
    headline: '3 things worth following up on today.',
    subject: '1 promise past due',
    items,
    more,
    loopsUrl: 'https://example.invalid/loops',
  })

describe('followThroughEmail', () => {
  it('shows initials without any image, and the photo only on top of them', () => {
    const plain = build([item()]).html
    expect(plain).toContain('>JO<')
    expect(plain).not.toContain('<img')

    const withPhoto = build([item({ person: { name: 'Jason Ortiz', initials: 'JO', photoUrl: 'https://cdn.invalid/j.jpg' } })]).html
    expect(withPhoto).toContain('<img src="https://cdn.invalid/j.jpg" alt="JO"')
  })

  it('links every line to its own loop, its person and its conversation', () => {
    const html = build([item()]).html
    expect(html).toContain('href="https://example.invalid/loops?focus=abc"')
    expect(html).toContain('href="https://example.invalid/people/p1"')
    expect(html).toContain('href="https://example.invalid/conversations/c1"')
    expect(html).toContain('href="https://example.invalid/loops"')
  })

  it('keeps who-owes-what wording and the timing intact', () => {
    const html = build([
      item(),
      item({
        phrase: "Ravi said they'd confirm the pricing assumptions.",
        timing: { label: 'Overdue by 1 day', tone: 'overdue' },
        person: { name: 'Ravi Menon', initials: 'RM', photoUrl: null },
      }),
      item({
        phrase: 'Still unanswered: Who owns the migration budget?',
        timing: { label: 'Unanswered', tone: 'open' },
        person: null,
        source: null,
      }),
    ]).html
    expect(html).toContain("You said you&#39;d send the proposal.")
    expect(html).toContain("Ravi said they&#39;d confirm the pricing assumptions.")
    expect(html).toContain('Still unanswered: Who owns the migration budget?')
    expect(html).toContain('Overdue by 1 day')
    // A person's name is never HTML-injected.
    expect(build([item({ person: { name: '<b>x</b>', initials: 'X', photoUrl: null } })]).html).not.toContain('<b>x</b>')
  })

  it('reads as a short plain-text list, links included', () => {
    const text = toPlainText(build([item()], 2).html)
    expect(text).toContain('3 things worth following up on today.')
    expect(text).toContain("You said you'd send the proposal. (https://example.invalid/loops?focus=abc)")
    expect(text).toContain('2 more loops are open beyond these.')
    expect(text).toContain('Turn these emails off')
  })

  it('carries an unsubscribe path and never a loop in the preheader', () => {
    const html = build([item({ phrase: "You said you'd send the SECRET DEAL terms." })]).html
    const preheader = html.match(/<span style="display:none[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''
    expect(preheader).toContain('3 things worth following up on today.')
    expect(preheader).not.toContain('SECRET DEAL')
    expect(html).toContain('/settings/appearance')
  })
})

describe('the scheduled job', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'cron', 'follow-through', 'route.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

  it('checks the cron secret before anything else, and refuses without one', () => {
    const body = source.slice(source.indexOf('export async function GET'))
    const secretAt = body.indexOf('CRON_SECRET')
    const clientAt = body.indexOf('createServiceRoleClient()')
    expect(secretAt).toBeGreaterThan(-1)
    expect(secretAt).toBeLessThan(clientAt)
    expect(body).toMatch(/!secret \|\| header !== `Bearer \$\{secret\}`/)
  })

  it('reserves the day through the ledger rather than trusting its own memory', () => {
    const send = readFileSync(join(process.cwd(), 'src', 'lib', 'follow-through', 'send.ts'), 'utf8')
    // Reserve, then send, then record: the insert precedes sendEmail.
    expect(send.indexOf("from('follow_through_deliveries')")).toBeLessThan(send.indexOf('await sendEmail('))
    // A duplicate reservation is the unique-violation code, treated as already sent.
    expect(send).toContain("'23505'")
  })
})
