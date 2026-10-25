#!/usr/bin/env node
/**
 * Waits until Apple has processed Atturel's newest TestFlight build (or the
 * build numbered BUILD_NUMBER), then reports whether internal testers can
 * install it. It also reports the TestFlight groups and how many testers each
 * internal group has.
 *
 * Read-only, with one exception, and only when INVITE_TEAM_ADMINS=true. If the
 * internal group that gets every build has no testers yet, it invites the
 * team's Account Holder and Admins. Those are users of this App Store Connect
 * team, who can already see everything in it.
 *
 * Runs after asc-setup.cjs, which leaves the key and the app's ID in the
 * environment: EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID,
 * ASC_APP_ID. TESTFLIGHT_WAIT_MINUTES caps the wait (default 40).
 *
 * It then reports, read-only, what external testing would still need for that
 * build: its external state and expiry, the Beta App Review information and
 * the test information, each as set or missing. Contact details and the demo
 * account's name and password are never printed.
 *
 * Exit 0: processed, and the build is ready or in testing for internal testers.
 * Exit 1: processing failed, export compliance is missing, or the wait ran out.
 * No tester emails or names are printed, only counts and invitation states.
 */

const fs = require('fs')
const { asc } = require('./asc-api.cjs')

const { EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, ASC_APP_ID, BUILD_NUMBER } = process.env
const waitMinutes = Number(process.env.TESTFLIGHT_WAIT_MINUTES || 40)
const READY = new Set(['IN_BETA_TESTING', 'READY_FOR_BETA_TESTING'])

function fail(message) {
  console.error(`::error::${message}`)
  summary(`- TestFlight: ${message}`)
  process.exit(1)
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function latestBuild(key) {
  const filter = `filter[app]=${ASC_APP_ID}${BUILD_NUMBER ? `&filter[version]=${encodeURIComponent(BUILD_NUMBER)}` : ''}`
  const res = await asc(key, `/v1/builds?${filter}&sort=-uploadedDate&limit=1&include=buildBetaDetail,preReleaseVersion`)
  const build = res.data[0]
  if (!build) return null
  const included = res.included ?? []
  const find = (rel) => {
    const ref = build.relationships?.[rel]?.data
    return ref ? included.find((i) => i.type === ref.type && i.id === ref.id) : undefined
  }
  return {
    id: build.id,
    number: build.attributes.version,
    version: find('preReleaseVersion')?.attributes.version ?? '?',
    processing: build.attributes.processingState,
    internal: find('buildBetaDetail')?.attributes.internalBuildState ?? 'UNKNOWN',
    external: find('buildBetaDetail')?.attributes.externalBuildState ?? 'UNKNOWN',
    expired: build.attributes.expired,
    expires: build.attributes.expirationDate,
    encryption: build.attributes.usesNonExemptEncryption,
  }
}

const isSet = (value) => (value === null || value === undefined || value === '' ? 'missing' : 'set')

// What external testing needs beyond a processed build. Each lookup stands
// alone: a key without the role to read one part reports that part, not a failure.
async function externalReadiness(key, build) {
  const lines = [
    `Build ${build.version} (${build.number}) for external testing: \`${build.external}\`; ` +
      `${build.expired ? 'expired' : `expires ${String(build.expires ?? '?').slice(0, 10)}`}; ` +
      `non-exempt encryption: ${build.encryption === false ? 'no' : String(build.encryption)}`,
  ]
  const part = async (label, read) => {
    try {
      lines.push(`${label}: ${await read()}`)
    } catch (e) {
      lines.push(`${label}: not readable (${e.message})`)
    }
  }
  await part('Beta App Review information', async () => {
    const a = (await asc(key, `/v1/apps/${ASC_APP_ID}/betaAppReviewDetail`)).data.attributes
    return [
      `contact name ${isSet(a.contactFirstName && a.contactLastName)}`,
      `contact email ${isSet(a.contactEmail)}`,
      `contact phone ${isSet(a.contactPhone)}`,
      `sign-in required ${a.demoAccountRequired ? 'yes' : 'no'}`,
      `demo account ${isSet(a.demoAccountName && a.demoAccountPassword)}`,
      `review notes ${isSet(a.notes)}`,
    ].join(', ')
  })
  await part('Test information', async () => {
    const all = (await asc(key, `/v1/apps/${ASC_APP_ID}/betaAppLocalizations?limit=20`)).data
    if (all.length === 0) return 'missing'
    return all
      .map(({ attributes: a }) =>
        `${a.locale}: description ${isSet(a.description)}, feedback email ${isSet(a.feedbackEmail)}, privacy policy ${a.privacyPolicyUrl ?? 'missing'}`,
      )
      .join('; ')
  })
  await part('What to Test', async () => {
    const all = (await asc(key, `/v1/builds/${build.id}/betaBuildLocalizations?limit=20`)).data
    return all.length === 0 ? 'missing' : all.map(({ attributes: a }) => `${a.locale} ${isSet(a.whatsNew)}`).join(', ')
  })
  return lines
}

async function groups(key) {
  const res = await asc(key, `/v1/apps/${ASC_APP_ID}/betaGroups?limit=50`)
  const out = []
  for (const g of res.data) {
    const line = { id: g.id, name: g.attributes.name, internal: g.attributes.isInternalGroup, allBuilds: g.attributes.hasAccessToAllBuilds }
    if (line.internal) {
      const testers = await asc(key, `/v1/betaGroups/${g.id}/betaTesters?limit=200`)
      const states = {}
      for (const t of testers.data) {
        const s = t.attributes.state ?? 'listed'
        states[s] = (states[s] ?? 0) + 1
      }
      line.testers = testers.data.length
      line.states = Object.entries(states).map(([s, n]) => `${n} ${s.toLowerCase().replace(/_/g, ' ')}`).join(', ')
    }
    out.push(line)
  }
  return out
}

// EAS creates "Team (Expo)" to hold the team's admins, but it adds only users
// whose roles include ADMIN, which can leave out the Account Holder. So when
// that group, or another internal group that gets every build, is still
// empty, invite the Account Holder and the Admins. Once it has anyone,
// nothing changes.
async function inviteTeamAdmins(key, groupList) {
  const target =
    groupList.find((g) => g.internal && g.allBuilds && g.name === 'Team (Expo)') ?? groupList.find((g) => g.internal && g.allBuilds)
  if (!target || target.testers > 0) return
  const users = (await asc(key, '/v1/users?limit=200')).data
  const admins = users.filter((u) => (u.attributes.roles ?? []).some((r) => r === 'ACCOUNT_HOLDER' || r === 'ADMIN'))
  for (const u of admins) {
    const email = u.attributes.username
    const existing = (await asc(key, `/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`)).data[0]
    if (existing) {
      await asc(key, `/v1/betaGroups/${target.id}/relationships/betaTesters`, {
        method: 'POST',
        body: { data: [{ type: 'betaTesters', id: existing.id }] },
      })
    } else {
      await asc(key, '/v1/betaTesters', {
        method: 'POST',
        body: {
          data: {
            type: 'betaTesters',
            attributes: { email, firstName: u.attributes.firstName ?? '', lastName: u.attributes.lastName ?? '' },
            relationships: { betaGroups: { data: [{ type: 'betaGroups', id: target.id }] } },
          },
        },
      })
    }
  }
  const n = admins.length
  console.log(`Invited ${n} team member${n === 1 ? '' : 's'} (Account Holder and Admins) to "${target.name}". TestFlight emails each an invitation.`)
  summary(`- Invited ${n} team member${n === 1 ? '' : 's'} (Account Holder and Admins) to "${target.name}"`)
}

async function main() {
  if (!EXPO_ASC_API_KEY_PATH || !EXPO_ASC_KEY_ID || !ASC_APP_ID) fail('Run asc-setup.cjs first: the App Store Connect key and app ID are not in the environment.')
  const key = { keyP8: fs.readFileSync(EXPO_ASC_API_KEY_PATH, 'utf8'), keyId: EXPO_ASC_KEY_ID, issuerId: EXPO_ASC_ISSUER_ID }

  const deadline = Date.now() + waitMinutes * 60_000
  let last = ''
  let build = null
  for (;;) {
    build = await latestBuild(key)
    const state = build ? `${build.version} (${build.number}): processing ${build.processing}, internal testing ${build.internal}` : 'no build yet'
    if (state !== last) console.log(`${new Date().toISOString().slice(11, 19)} ${state}`)
    last = state

    if (build) {
      if (build.processing === 'FAILED' || build.processing === 'INVALID') {
        fail(`Apple could not process build ${build.version} (${build.number}): ${build.processing}. App Store Connect > TestFlight shows the reason, and Apple emails it.`)
      }
      if (build.internal === 'MISSING_EXPORT_COMPLIANCE') {
        fail(`Build ${build.version} (${build.number}) is waiting for the export compliance answer: App Store Connect > TestFlight > the build > Manage.`)
      }
      if (build.internal === 'PROCESSING_EXCEPTION') {
        fail(`Apple reported a processing exception for build ${build.version} (${build.number}).`)
      }
      if (build.processing === 'VALID' && READY.has(build.internal)) break
    }
    if (Date.now() > deadline) {
      fail(`Still waiting after ${waitMinutes} minutes (${state}). Apple is sometimes slow; run "TestFlight status" again later.`)
    }
    await sleep(30_000)
  }

  console.log(`Build ${build.version} (${build.number}) is processed and ${build.internal === 'IN_BETA_TESTING' ? 'available to internal testers' : 'ready for internal testing'}.`)
  summary(`- TestFlight: build ${build.version} (${build.number}) processed, internal testing: \`${build.internal}\``)

  if (process.env.INVITE_TEAM_ADMINS === 'true') {
    try {
      await inviteTeamAdmins(key, await groups(key))
    } catch (e) {
      const message = `Could not invite the team to TestFlight (${e.message}). Add yourself: App Store Connect > TestFlight > Internal Testing > Team (Expo) > Testers > +.`
      console.log(`::warning::${message}`)
      summary(`- ${message}`)
    }
  }

  const all = await groups(key)
  for (const g of all) {
    const detail = g.internal
      ? `internal, ${g.allBuilds ? 'gets every build' : 'builds added by hand'}, ${g.testers} tester${g.testers === 1 ? '' : 's'}${g.states ? ` (${g.states})` : ''}`
      : 'external'
    console.log(`Group "${g.name}": ${detail}`)
    summary(`- Group "${g.name}": ${detail}`)
  }
  if (!all.some((g) => !g.internal)) {
    console.log('No external group yet.')
    summary('- No external group yet.')
  }

  for (const line of await externalReadiness(key, build)) {
    console.log(line)
    summary(`- ${line}`)
  }
  console.log(`https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/testflight/ios`)
}

main().catch((e) => fail(e.message))
