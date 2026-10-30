/**
 * NAME AND EMPLOYER MATCHING
 * =============================================================================
 * The text comparisons identity resolution and discovery ranking both rest on.
 *
 * Plain substring checks got this wrong in both directions, measured against
 * the identity check itself:
 *
 *   "Jordan Averyson works at Meridian Systems"   -> linked as Jordan Avery
 *   "Jordan P. Avery, VP Engineering, Meridian"   -> "does not mention" him
 *   "Avery, Jordan" on a speaker list              -> "does not mention" him
 *   "José Álvarez" for a person saved as Jose      -> "does not mention" him
 *   "VP Engineering at Meridian" for Meridian Systems Inc.
 *                                                  -> "a different organisation"
 *
 * So names are compared on whole words, with accents folded, a middle name or
 * initial allowed between first and last, and the "Last, First" form that
 * directories use. Employers are compared after dropping legal suffixes, with
 * a weaker partial match when only the distinctive word of the name appears.
 *
 * Pure, and free of `server-only`, so it is tested directly.
 * =============================================================================
 */

/** Lowercase, accents folded, every run of whitespace one space. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The words of a name, without punctuation. "Jordan P. Avery" -> [jordan, p, avery]. */
function nameWords(fullName: string): string[] {
  return foldText(fullName)
    .split(/[^a-z0-9-]+/)
    .filter(Boolean)
}

export type NameMatch = 'exact' | 'variant' | null

/**
 * Word boundaries for a name. A hyphen after it counts as part of the word:
 * "Jordan Avery-Stone" is not Jordan Avery any more than "Averyson" is.
 */
const BEFORE = '(?<![a-z0-9-])'
const AFTER = '(?![a-z0-9]|-[a-z])'

/**
 * Does this text name the person?
 *
 * `exact` is the full name as saved, on word boundaries. `variant` is the same
 * first and last name written another way: with a middle name or initial
 * between them, or as "Last, First". A longer word that merely starts with the
 * surname ("Averyson") is neither.
 *
 * A single-word name can only match exactly: with one word there is no second
 * one to confirm it is a name rather than an ordinary word.
 */
export function matchName(fullName: string, text: string | null | undefined): NameMatch {
  if (!text) return null
  const words = nameWords(fullName)
  if (words.length === 0) return null
  const haystack = foldText(text)

  const exact = new RegExp(`${BEFORE}${words.map(escapeRegExp).join('[\\s.,-]+')}${AFTER}`)
  if (exact.test(haystack)) return 'exact'
  if (words.length < 2) return null

  const first = escapeRegExp(words[0]!)
  const last = escapeRegExp(words[words.length - 1]!)
  // First, then up to two middle names or initials, then last.
  const withMiddle = new RegExp(`${BEFORE}${first}\\s+(?:[a-z]{1,15}\\.?\\s+){1,2}${last}${AFTER}`)
  // "Avery, Jordan" — the comma is required. "Avery Jordan" is a different
  // name as often as it is a reversed one.
  const reversed = new RegExp(`${BEFORE}${last}\\s*,\\s*${first}${AFTER}`)
  if (withMiddle.test(haystack) || reversed.test(haystack)) return 'variant'
  return null
}

/**
 * Legal and filler words that say nothing about which organisation it is.
 * "Meridian Systems, Inc." and "Meridian Systems" are one employer.
 */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'sas',
  'bv',
  'nv',
  'pty',
  'pte',
  'the',
])

/**
 * Words too common to identify an employer on their own. "Systems" appearing
 * on a page says nothing about whether Meridian Systems does.
 */
const GENERIC_ORG_WORDS = new Set([
  'systems',
  'system',
  'technologies',
  'technology',
  'tech',
  'solutions',
  'services',
  'group',
  'holdings',
  'global',
  'international',
  'partners',
  'labs',
  'lab',
  'software',
  'consulting',
  'industries',
  'enterprises',
  'capital',
  'ventures',
  'media',
  'health',
  'bank',
  'university',
  'college',
  'institute',
  'foundation',
  'association',
  'agency',
  'studio',
  'studios',
  'networks',
  'digital',
  'data',
  'energy',
  'america',
  'americas',
  'usa',
  'us',
  'and',
  'of',
  '&',
])

/** "Meridian Systems, Inc." -> ["meridian", "systems"]. */
export function organizationWords(organization: string): string[] {
  return foldText(organization)
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !LEGAL_SUFFIXES.has(word))
}

/** The words that actually identify the employer. "Meridian Systems" -> ["meridian"]. */
export function distinctiveOrganizationWords(organization: string): string[] {
  return organizationWords(organization).filter(
    (word) => word.length >= 4 && !GENERIC_ORG_WORDS.has(word),
  )
}

export type OrganizationMatch = 'full' | 'partial' | null

/**
 * Does this text name the employer?
 *
 * `full`: the whole name, legal suffix aside, on word boundaries.
 * `partial`: a distinctive word of it ("Meridian" for Meridian Systems) — real
 * corroboration, but weaker, because a distinctive word is still a word.
 */
export function matchOrganization(
  organization: string | null | undefined,
  text: string | null | undefined,
): OrganizationMatch {
  if (!organization || !text) return null
  const words = organizationWords(organization)
  if (words.length === 0) return null
  const haystack = ` ${foldText(text)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')} `

  const whole = words.join(' ')
  if (whole.length > 2 && haystack.includes(` ${whole} `)) return 'full'

  const distinctive = distinctiveOrganizationWords(organization)
  if (distinctive.some((word) => haystack.includes(` ${word} `))) return 'partial'
  return null
}

/**
 * Is this site the employer's own?
 *
 * Compared on the host's labels rather than the whole host, so meridian.com,
 * meridiansystems.com and careers.meridian.io all count for Meridian Systems,
 * and so does textron.com for Bell Textron.
 */
export function hostMatchesOrganization(
  host: string | null | undefined,
  organization: string | null | undefined,
): boolean {
  if (!host || !organization) return false
  const words = organizationWords(organization)
  if (words.length === 0) return false
  const joined = words.join('')
  const distinctive = distinctiveOrganizationWords(organization)
  // Every label but the last (the TLD), so "co" in example.co.uk is not one.
  const labels = host
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')
    .slice(0, -1)
  return labels.some(
    (label) =>
      (joined.length > 2 && label === joined) ||
      distinctive.some((word) => label === word || (word.length >= 5 && label.startsWith(word))),
  )
}

/**
 * Roles that, followed by "at <Company>", name where someone works.
 * "Spoke at the summit" is not a job; "Director of Programs at Lockheed" is.
 */
const ROLE_BEFORE_EMPLOYER =
  /\b(?:ceo|cto|cfo|coo|cio|ciso|cmo|cpo|founder|co-founder|cofounder|president|vp|svp|evp|vice president|director|head|chief|lead|manager|engineer|partner|principal|professor|analyst|consultant|scientist|officer|architect|designer|researcher|counsel|attorney|works|worked|working|employed|joined|joins)\b[^.\n;:]{0,40}?\bat\s+([a-z0-9][a-z0-9&.\- ]{1,48})/g

/** Words that end a company name in running text. */
const EMPLOYER_STOP =
  /\s(?:and|where|since|for|from|in|on|to|with|who|which|until|before|after|during|while|as|he|she|they|his|her|their|since)\b.*$/

/** Places someone speaks or studies, not where they work. */
const NOT_AN_EMPLOYER =
  /^(?:the\s+)?(?:summit|conference|event|meetup|panel|webinar|podcast|show|session|workshop|forum|expo|festival|time|moment|end|start|least|most|home|work|night|present|scale)\b/

/**
 * Employers this text says someone works at, in the words of the text.
 *
 * Looked for only near the person's name, so a page that lists ten people's
 * employers does not hang the other nine on them.
 */
export function namedEmployersNear(fullName: string, text: string, radius = 220): string[] {
  const haystack = foldText(text)
  const words = nameWords(fullName)
  const last = words[words.length - 1]
  if (!last) return []

  const employers = new Set<string>()
  const surname = new RegExp(`(?<![a-z0-9])${escapeRegExp(last)}(?![a-z0-9])`, 'g')
  for (const hit of haystack.matchAll(surname)) {
    const start = Math.max(0, (hit.index ?? 0) - 40)
    const window = haystack.slice(start, (hit.index ?? 0) + radius)
    for (const match of window.matchAll(ROLE_BEFORE_EMPLOYER)) {
      const employer = match[1]!
        .replace(EMPLOYER_STOP, '')
        .replace(/[.\-\s]+$/, '')
        .trim()
      if (employer.length < 2 || NOT_AN_EMPLOYER.test(employer)) continue
      employers.add(employer)
    }
  }
  return [...employers]
}

/** Two names for the same employer? "meridian" and "Meridian Systems, Inc." are. */
export function sameOrganization(a: string, b: string): boolean {
  const aWords = organizationWords(a)
  const bWords = organizationWords(b)
  if (aWords.length === 0 || bWords.length === 0) return false
  const aJoined = aWords.join(' ')
  const bJoined = bWords.join(' ')
  if (aJoined === bJoined || aJoined.startsWith(bJoined) || bJoined.startsWith(aJoined)) return true
  const aDistinct = distinctiveOrganizationWords(a)
  const bDistinct = new Set(distinctiveOrganizationWords(b))
  return aDistinct.some((word) => bDistinct.has(word))
}

/** Free-mail domains carry no organisational signal. */
export function isGenericEmailDomain(domain: string): boolean {
  return [
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'yahoo.com',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'aol.com',
    'gmx.com',
    'mail.com',
  ].includes(domain)
}
