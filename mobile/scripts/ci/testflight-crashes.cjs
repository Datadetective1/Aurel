#!/usr/bin/env node
/**
 * Prints the crash reports testers shared from TestFlight ("Atturel crashed:
 * share additional information with the developer?"), newest first, with
 * each crash log. Read-only against App Store Connect.
 *
 * Runs after asc-setup.cjs, which leaves the key and the app's ID in the
 * environment. CRASH_LIMIT caps how many are printed (default 5).
 *
 * Printed: date, build, device, iOS version, uptime, the tester's comment
 * and the crash log. Not printed: the tester's email.
 */

const fs = require('fs')
const { asc } = require('./asc-api.cjs')

const { EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, ASC_APP_ID } = process.env
const limit = Number(process.env.CRASH_LIMIT || 5)

async function main() {
  if (!EXPO_ASC_API_KEY_PATH || !EXPO_ASC_KEY_ID || !ASC_APP_ID) {
    throw new Error('Run asc-setup.cjs first: the App Store Connect key and app ID are not in the environment.')
  }
  const key = { keyP8: fs.readFileSync(EXPO_ASC_API_KEY_PATH, 'utf8'), keyId: EXPO_ASC_KEY_ID, issuerId: EXPO_ASC_ISSUER_ID }

  const list = await asc(key, `/v1/apps/${ASC_APP_ID}/betaFeedbackCrashSubmissions?limit=${limit}&sort=-createdDate&include=build`)
  const builds = new Map((list.included ?? []).filter((i) => i.type === 'builds').map((b) => [b.id, b.attributes.version]))
  console.log(`${list.data.length} crash report${list.data.length === 1 ? '' : 's'} shared from TestFlight.`)

  for (const s of list.data) {
    const a = s.attributes
    const buildId = s.relationships?.build?.data?.id
    console.log('')
    console.log(`=== ${a.createdDate} · build ${builds.get(buildId) ?? '?'} · ${a.deviceModel ?? '?'} · iOS ${a.osVersion ?? '?'} · up ${a.appUptimeInMilliseconds ?? '?'} ms`)
    if (a.comment) console.log(`Comment: ${a.comment}`)
    try {
      const log = await asc(key, `/v1/betaFeedbackCrashSubmissions/${s.id}/crashLog`)
      console.log(log.data?.attributes?.logText ?? '(no crash log attached)')
    } catch (e) {
      console.log(`(crash log not available: ${e.message})`)
    }
  }
}

main().catch((e) => {
  console.error(`::error::${e.message}`)
  process.exit(1)
})
