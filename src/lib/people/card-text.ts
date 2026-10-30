/**
 * BUSINESS CARD AND BADGE TEXT
 * =============================================================================
 * The lines the phone read off a business card or a conference badge, sorted
 * into the fields of a new person. Recognition happens on the device; this
 * only decides which line is which, so it is cheap, private and testable.
 *
 * It guesses, and says nothing is certain: every field it fills is shown to
 * the user to check and correct before anything is saved. A line it cannot
 * place is left out rather than put in the wrong field.
 *
 * Pure.
 * =============================================================================
 */

export interface CardFields {
  fullName: string
  jobTitle: string
  organizationName: string
  email: string
  profileUrl: string
  /** A phone number and website, which have no field of their own. */
  notes: string
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const URL_LIKE =
  /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s]*)?)/i
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/

const TITLE_WORDS =
  /\b(director|manager|engineer|vp|vice president|president|ceo|cto|cfo|coo|cio|cmo|founder|co-founder|head|lead|officer|analyst|consultant|partner|specialist|coordinator|designer|developer|architect|associate|principal|chief|owner|sales|marketing|recruiter|professor|advisor|adviser|scientist|researcher|executive|administrator|supervisor|representative|strategist|attorney|counsel)\b/i

const COMPANY_WORDS =
  /\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|group|company|co\.|gmbh|plc|technologies|technology|labs|systems|solutions|partners|university|college|bank|institute|holdings|industries|associates|consulting|ventures|capital|agency|studio|health|foundation)\b\.?/i

const BADGE_WORDS =
  /^(hello,? my name is|my name is|speaker|attendee|visitor|exhibitor|sponsor|staff|volunteer|press|media|vip|guest|delegate|organizer|organiser|panelist|moderator)$/i

const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'msn.com',
])

function clean(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function titleCase(line: string): string {
  if (line !== line.toUpperCase()) return line
  return line
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

function looksLikeName(line: string): boolean {
  if (/\d|@|\//.test(line)) return false
  if (TITLE_WORDS.test(line) || COMPANY_WORDS.test(line) || BADGE_WORDS.test(line)) return false
  const words = line.split(' ')
  if (words.length < 1 || words.length > 4) return false
  return words.every((w) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w))
}

function companyFromDomain(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (!domain || FREE_MAIL.has(domain)) return ''
  const root = domain.split('.').slice(-2, -1)[0] ?? ''
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : ''
}

export function parseCardText(raw: string[]): CardFields {
  const lines = raw
    .flatMap((l) => l.split(/\n/))
    .map(clean)
    .filter((l) => l.length > 0)
  const used = new Set<number>()
  const take = (test: (l: string) => boolean): { line: string; i: number } | null => {
    const i = lines.findIndex((l, idx) => !used.has(idx) && test(l))
    if (i < 0) return null
    used.add(i)
    return { line: lines[i]!, i }
  }

  const emailLine = take((l) => EMAIL.test(l))
  const email = emailLine ? (emailLine.line.match(EMAIL)?.[0] ?? '') : ''

  let profileUrl = ''
  let website = ''
  const linked = take((l) => /linkedin\.com\/in\//i.test(l))
  if (linked) {
    const m = linked.line.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s,;]+/i)
    profileUrl = m ? (m[0].startsWith('http') ? m[0] : `https://${m[0]}`) : ''
  }
  const site = take((l) => !EMAIL.test(l) && URL_LIKE.test(l) && l.replace(/\D/g, '').length < 7)
  if (site) website = site.line.match(URL_LIKE)?.[1] ?? ''

  const phones: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue
    const line = lines[i]!
    const m = line.match(PHONE)
    if (
      m &&
      m[0].replace(/\D/g, '').length >= 7 &&
      !/[a-z]{4,}/i.test(
        line.replace(/^(tel|phone|mobile|mob|cell|office|direct|fax|t|m|p|o|f)\b\.?:?/i, ''),
      )
    ) {
      used.add(i)
      phones.push(clean(m[0]))
    }
  }

  // Badge words are labels on the badge, never a field.
  lines.forEach((l, i) => {
    if (BADGE_WORDS.test(l)) used.add(i)
  })

  let name = take(looksLikeName)?.line ?? ''
  // A badge often prints the first name large and the last name under it.
  if (name && !name.includes(' ')) {
    const at = lines.indexOf(name)
    const next = lines[at + 1]
    if (next && !used.has(at + 1) && looksLikeName(next) && !next.includes(' ')) {
      used.add(at + 1)
      name = `${name} ${next}`
    }
  }

  const title = take((l) => TITLE_WORDS.test(l) && !COMPANY_WORDS.test(l))?.line ?? ''
  const company =
    take((l) => COMPANY_WORDS.test(l))?.line ??
    // On a badge the company is usually the line after the name and title.
    take((l) => !/[\d@,]/.test(l) && l.split(' ').length <= 5 && !TITLE_WORDS.test(l))?.line ??
    ''

  const notes = [...phones.map((p) => `Phone: ${p}`), website ? `Website: ${website}` : ''].filter(
    Boolean,
  )

  return {
    fullName: titleCase(name),
    jobTitle: title,
    organizationName: company || companyFromDomain(email),
    email,
    profileUrl,
    notes: notes.join('\n'),
  }
}
