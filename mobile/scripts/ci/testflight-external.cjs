#!/usr/bin/env node
/**
 * External TestFlight for Atturel, through the App Store Connect API: the
 * "Atturel Pilot" group, the test information, What to Test, and the Beta App
 * Review details. TESTFLIGHT_ACTION picks one step:
 *
 *   prepare      Create the group if it is missing (no public link, no build
 *                added), then set the test information, What to Test for
 *                BUILD_NUMBER, and the review details. The contact (name,
 *                email, phone) is the owner's, entered once in App Store
 *                Connect; Apple accepts no change here without it. When no
 *                demo password is set yet (or ROTATE_DEMO_PASSWORD=true), one
 *                is generated here, set on the reviewer's Atturel account
 *                through Supabase Auth's admin API (SUPABASE_SECRET_KEY), then
 *                stored in App Store Connect, which keeps it for Apple and the
 *                owner. Then it signs in with it to prove it works.
 *   verify       Sign in to Atturel as the reviewer with the password App Store
 *                Connect holds, and report the account's plan.
 *   submit       Check that everything is in place and the reviewer account has
 *                Full access, add the build to the group, and submit it for
 *                beta review.
 *   public-link  Once Apple has approved the build, turn on the group's public
 *                link, limited to PUBLIC_LINK_LIMIT testers (default 10).
 *
 * Never printed: the demo password, any hash of it, the Supabase key, contact
 * details, or any sign-in token. Runs after asc-setup.cjs, like
 * testflight-status.cjs.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { asc } = require('./asc-api.cjs')

const { EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, ASC_APP_ID, BUILD_NUMBER, TESTFLIGHT_ACTION, SUPABASE_SECRET_KEY } = process.env

const GROUP = 'Atturel Pilot'
const LOCALE = 'en-US'
const REVIEWER = 'appreview@atturel.com'
// The reviewer's Atturel account. The password step checks that this id still
// belongs to REVIEWER before changing anything, so it can touch no one else.
const REVIEWER_USER_ID = 'a4fa330a-383f-4c35-973e-fbbd138fbd22'

const TEST_INFO = {
  description:
    'Atturel prepares you for important conversations and keeps track of what was agreed. Add the people you meet, read a short brief before a meeting, and capture what happened afterwards. Atturel finds the decisions and commitments and asks before keeping any of them.',
  feedbackEmail: 'support@atturel.com',
  marketingUrl: 'https://www.atturel.com',
  privacyPolicyUrl: 'https://www.atturel.com/privacy',
}

const WHAT_TO_TEST =
  "Prepare for a meeting with someone you are about to see, then capture the conversation afterwards (record, or type notes) and keep the commitments. Tell us what was wrong or missing: use TestFlight's feedback, or write to support@atturel.com."

const REVIEW_NOTES = [
  'Atturel has two plans. Free is limited (for example 5 people and 3 meeting briefs a month, and no Relationship Atlas). Pro costs $29 a month and adds the Relationship Atlas, deep research, weekly intelligence and higher monthly allowances.',
  'Plans are bought only on our website, atturel.com. The iOS app contains no in-app purchases: it shows no prices, no purchase or upgrade buttons, and no links to buy. The Account screen only displays the current plan; for someone already paying on the website it reads "Billed on the web. Change or cancel it from Settings › Plan at atturel.com." Free accounts also see an "Invitation code" field, used only by people we invite to a free pilot; codes are not sold.',
  'This review account has "Full access": an access level we grant by hand, at no charge and with no purchase, to accounts we invite. It includes every Pro feature with no monthly limits, so everything can be reviewed. The Account screen shows "Full access" and "Included with your access. Nothing is billed." The account holds an invented sample record; every sample person is labelled "Sample · invented".',
  'To try it: Today → Q3 capacity review → Prepare now. People → open a person. The Atlas tab. Capture → record or type a short note → Understand it → review and Keep. Recording needs microphone access. The audio goes through our server to OpenAI\'s speech-to-text service and is not stored by us; a recording not yet sent stays on the phone until it is kept or discarded. Account → Delete account deletes the account and its data.',
].join('\n\n')

let summaryLines = []
function say(line) {
  console.log(line)
  summaryLines.push(`- ${line}`)
}
function flushSummary() {
  if (process.env.GITHUB_STEP_SUMMARY && summaryLines.length) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join('\n')}\n`)
  summaryLines = []
}
function fail(message) {
  console.error(`::error::${message}`)
  summaryLines.push(`- ${message}`)
  flushSummary()
  process.exit(1)
}

const isSet = (v) => v !== null && v !== undefined && v !== ''

// The app's own public configuration: where it signs in and which API it calls.
function appConfig() {
  const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'eas.json'), 'utf8'))
  const env = eas.build.base.env
  return { supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL, publishableKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY, apiUrl: env.EXPO_PUBLIC_API_URL }
}

async function build(key) {
  if (!BUILD_NUMBER) fail('BUILD_NUMBER is required.')
  const res = await asc(key, `/v1/builds?filter[app]=${ASC_APP_ID}&filter[version]=${encodeURIComponent(BUILD_NUMBER)}&limit=1&include=buildBetaDetail`)
  const b = res.data[0]
  if (!b) fail(`No build ${BUILD_NUMBER} in App Store Connect.`)
  const detail = (res.included ?? []).find((i) => i.type === 'buildBetaDetails')
  return { id: b.id, external: detail?.attributes.externalBuildState ?? 'UNKNOWN', expired: b.attributes.expired }
}

async function findGroup(key) {
  const groups = (await asc(key, `/v1/apps/${ASC_APP_ID}/betaGroups?limit=50`)).data
  return groups.find((g) => g.attributes.name === GROUP && !g.attributes.isInternalGroup) ?? null
}

async function ensureGroup(key) {
  const existing = await findGroup(key)
  if (existing) return existing
  const created = await asc(key, '/v1/betaGroups', {
    method: 'POST',
    body: {
      data: {
        type: 'betaGroups',
        attributes: { name: GROUP, publicLinkEnabled: false, feedbackEnabled: true },
        relationships: { app: { data: { type: 'apps', id: ASC_APP_ID } } },
      },
    },
  })
  say(`Created the external group "${GROUP}" (no public link, no build yet).`)
  return created.data
}

async function setTestInformation(key) {
  const all = (await asc(key, `/v1/apps/${ASC_APP_ID}/betaAppLocalizations?limit=20`)).data
  const current = all.find((l) => l.attributes.locale === LOCALE)
  if (current) {
    await asc(key, `/v1/betaAppLocalizations/${current.id}`, {
      method: 'PATCH',
      body: { data: { type: 'betaAppLocalizations', id: current.id, attributes: TEST_INFO } },
    })
  } else {
    await asc(key, '/v1/betaAppLocalizations', {
      method: 'POST',
      body: {
        data: {
          type: 'betaAppLocalizations',
          attributes: { locale: LOCALE, ...TEST_INFO },
          relationships: { app: { data: { type: 'apps', id: ASC_APP_ID } } },
        },
      },
    })
  }
  say(`Test information (${LOCALE}): description, feedback email, marketing URL and privacy policy URL set.`)
}

async function setWhatToTest(key, b) {
  const all = (await asc(key, `/v1/builds/${b.id}/betaBuildLocalizations?limit=20`)).data
  const current = all.find((l) => l.attributes.locale === LOCALE)
  if (current) {
    await asc(key, `/v1/betaBuildLocalizations/${current.id}`, {
      method: 'PATCH',
      body: { data: { type: 'betaBuildLocalizations', id: current.id, attributes: { whatsNew: WHAT_TO_TEST } } },
    })
  } else {
    await asc(key, '/v1/betaBuildLocalizations', {
      method: 'POST',
      body: {
        data: {
          type: 'betaBuildLocalizations',
          attributes: { locale: LOCALE, whatsNew: WHAT_TO_TEST },
          relationships: { build: { data: { type: 'builds', id: b.id } } },
        },
      },
    })
  }
  say(`What to Test (${LOCALE}) set on build ${BUILD_NUMBER}.`)
}

async function reviewDetail(key) {
  return (await asc(key, `/v1/apps/${ASC_APP_ID}/betaAppReviewDetail`)).data
}

function newPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let out = ''
  for (const byte of crypto.randomBytes(28)) out += alphabet[byte % alphabet.length]
  return out
}

// Supabase Auth's admin API, with a secret key that exists only as a GitHub
// Actions secret. Nothing it returns is printed.
async function authAdmin(method, route, body) {
  const { supabaseUrl } = appConfig()
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/${route}`, {
    method,
    // A secret key (sb_secret_…) goes on `apikey` alone: the platform rejects it as
    // a Bearer token. A legacy service_role key is a JWT and goes on both.
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      ...(SUPABASE_SECRET_KEY.startsWith('eyJ') ? { authorization: `Bearer ${SUPABASE_SECRET_KEY}` } : {}),
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) fail(`Supabase Auth refused ${method} ${route.split('/')[0]} (${res.status}${json?.msg || json?.message ? `: ${json.msg ?? json.message}` : ''}).`)
  return json
}

async function setReviewerPassword(password) {
  const user = await authAdmin('GET', `users/${REVIEWER_USER_ID}`)
  if ((user?.email ?? '').toLowerCase() !== REVIEWER) fail(`Account ${REVIEWER_USER_ID} is not ${REVIEWER}; nothing was changed.`)
  await authAdmin('PUT', `users/${REVIEWER_USER_ID}`, { password })
}

async function setReviewDetails(key) {
  const detail = await reviewDetail(key)
  const a = detail.attributes
  // Apple refuses any change to these details without the full contact, phone
  // included, and the contact is the owner's to give. So it is entered once in
  // App Store Connect, and every change here carries it back unchanged.
  const contact = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone']
  const missing = contact.filter((f) => !isSet(a[f]))
  if (missing.length) {
    fail(
      `Beta App Review contact incomplete (${missing.join(', ')}). In App Store Connect: Apps > Atturel > TestFlight > Test Information > ` +
        'Beta App Review Information, enter your first name, last name, phone and email, and save. Then run "prepare" again.',
    )
  }
  const attributes = { demoAccountRequired: true, demoAccountName: REVIEWER, notes: REVIEW_NOTES }
  for (const f of contact) attributes[f] = a[f]

  const rotate = !isSet(a.demoAccountPassword) || process.env.ROTATE_DEMO_PASSWORD === 'true'
  if (rotate) {
    if (!isSet(SUPABASE_SECRET_KEY)) {
      fail('The SUPABASE_SECRET_KEY Actions secret is not set, so the reviewer password cannot be set. Nothing was changed.')
    }
    // Atturel first: App Store Connect then never holds a password that does not work.
    const password = newPassword()
    await setReviewerPassword(password)
    attributes.demoAccountPassword = password
  }

  await asc(key, `/v1/betaAppReviewDetails/${detail.id}`, {
    method: 'PATCH',
    body: { data: { type: 'betaAppReviewDetails', id: detail.id, attributes } },
  })

  const after = (await reviewDetail(key)).attributes
  say(
    `Beta App Review details: contact ${contact.every((f) => isSet(after[f])) ? 'set' : 'incomplete'}, ` +
      `sign-in required ${after.demoAccountRequired ? 'yes' : 'no'}, demo account ${isSet(after.demoAccountName) && isSet(after.demoAccountPassword) ? 'set' : 'missing'}, notes ${isSet(after.notes) ? 'set' : 'missing'}.`,
  )
  say(rotate ? 'Reviewer password: new, set on the Atturel account and stored in App Store Connect.' : 'Reviewer password: unchanged (already in App Store Connect).')
}

async function signInAsReviewer(key) {
  const a = (await reviewDetail(key)).attributes
  if (!isSet(a.demoAccountName) || !isSet(a.demoAccountPassword)) return { ok: false, why: 'no demo account in App Store Connect' }
  const { supabaseUrl, publishableKey, apiUrl } = appConfig()
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: a.demoAccountName, password: a.demoAccountPassword }),
  })
  const session = await res.json().catch(() => null)
  if (!session?.access_token) return { ok: false, why: `sign-in refused (${res.status})` }
  const account = await fetch(`${apiUrl}/api/mobile/account`, { headers: { authorization: `Bearer ${session.access_token}` } })
  const body = await account.json().catch(() => null)
  if (!account.ok || !body) return { ok: false, why: `account request failed (${account.status})` }
  return { ok: true, plan: body.planLabel, billing: body.billing, sample: body.sampleData?.loaded === true }
}

async function verify(key) {
  const r = await signInAsReviewer(key)
  if (!r.ok) fail(`Reviewer sign-in with the App Store Connect password: failed, ${r.why}.`)
  say(`Reviewer sign-in with the App Store Connect password: works. Plan "${r.plan}" (billing ${r.billing}), sample record ${r.sample ? 'loaded' : 'not loaded'}.`)
  return r
}

async function submit(key) {
  const b = await build(key)
  if (b.expired) fail(`Build ${BUILD_NUMBER} has expired.`)
  if (b.external !== 'READY_FOR_BETA_SUBMISSION') fail(`Build ${BUILD_NUMBER} is \`${b.external}\`, not ready for beta submission.`)
  const group = await findGroup(key)
  if (!group) fail(`No external group "${GROUP}". Run "prepare" first.`)

  const a = (await reviewDetail(key)).attributes
  const missing = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone', 'demoAccountName', 'demoAccountPassword', 'notes'].filter((f) => !isSet(a[f]))
  if (missing.length) fail(`Beta App Review details incomplete: ${missing.join(', ')}.`)
  const info = (await asc(key, `/v1/apps/${ASC_APP_ID}/betaAppLocalizations?limit=20`)).data.find((l) => l.attributes.locale === LOCALE)
  if (!info || !['description', 'feedbackEmail', 'privacyPolicyUrl'].every((f) => isSet(info.attributes[f]))) fail('Test information incomplete. Run "prepare".')
  const wtt = (await asc(key, `/v1/builds/${b.id}/betaBuildLocalizations?limit=20`)).data.find((l) => l.attributes.locale === LOCALE)
  if (!wtt || !isSet(wtt.attributes.whatsNew)) fail('What to Test is missing. Run "prepare".')

  // The review notes promise Full access; submit only while that is true.
  const r = await verify(key)
  if (r.plan !== 'Full access' || r.billing !== 'included') {
    fail(`The reviewer account reads "${r.plan}" (billing ${r.billing}), not Full access, which the review notes describe. Restore its grant before submitting.`)
  }

  const inGroup = (await asc(key, `/v1/betaGroups/${group.id}/builds?limit=50`)).data.some((x) => x.id === b.id)
  if (!inGroup) {
    await asc(key, `/v1/betaGroups/${group.id}/relationships/builds`, { method: 'POST', body: { data: [{ type: 'builds', id: b.id }] } })
    say(`Added build ${BUILD_NUMBER} to "${GROUP}".`)
  }
  const submission = await asc(key, '/v1/betaAppReviewSubmissions', {
    method: 'POST',
    body: { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: b.id } } } } },
  })
  say(`Submitted build ${BUILD_NUMBER} for beta review: \`${submission.data.attributes.betaReviewState}\`.`)
}

async function publicLink(key) {
  const b = await build(key)
  if (!['BETA_APPROVED', 'IN_BETA_TESTING'].includes(b.external)) fail(`Build ${BUILD_NUMBER} is \`${b.external}\`; the public link waits for Apple's approval.`)
  const group = await findGroup(key)
  if (!group) fail(`No external group "${GROUP}".`)
  const limit = Number(process.env.PUBLIC_LINK_LIMIT || 10)
  const updated = await asc(key, `/v1/betaGroups/${group.id}`, {
    method: 'PATCH',
    body: { data: { type: 'betaGroups', id: group.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: limit } } },
  })
  say(`Public link on for "${GROUP}", limited to ${limit} testers: ${updated.data.attributes.publicLink}`)
}

async function main() {
  if (!EXPO_ASC_API_KEY_PATH || !EXPO_ASC_KEY_ID || !ASC_APP_ID) fail('Run asc-setup.cjs first: the App Store Connect key and app ID are not in the environment.')
  const key = { keyP8: fs.readFileSync(EXPO_ASC_API_KEY_PATH, 'utf8'), keyId: EXPO_ASC_KEY_ID, issuerId: EXPO_ASC_ISSUER_ID }

  switch (TESTFLIGHT_ACTION) {
    case 'prepare': {
      const b = await build(key)
      await ensureGroup(key)
      await setTestInformation(key)
      await setWhatToTest(key, b)
      await setReviewDetails(key)
      await verify(key)
      break
    }
    case 'verify':
      await verify(key)
      break
    case 'submit':
      await submit(key)
      break
    case 'public-link':
      await publicLink(key)
      break
    default:
      fail(`Unknown TESTFLIGHT_ACTION "${TESTFLIGHT_ACTION}".`)
  }
  flushSummary()
}

main().catch((e) => fail(e.message))
