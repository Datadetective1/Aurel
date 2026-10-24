#!/usr/bin/env node
/**
 * Waits until Apple has processed Atturel's newest TestFlight build (or the
 * build numbered BUILD_NUMBER), then reports whether internal testers can
 * install it. It also reports the TestFlight groups and how many testers each
 * internal group has. Read-only against App Store Connect.
 *
 * Runs after asc-setup.cjs, which leaves the key and the app's ID in the
 * environment: EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID,
 * ASC_APP_ID. TESTFLIGHT_WAIT_MINUTES caps the wait (default 40).
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
  }
}

async function groups(key) {
  const res = await asc(key, `/v1/apps/${ASC_APP_ID}/betaGroups?limit=50`)
  const out = []
  for (const g of res.data) {
    const line = { name: g.attributes.name, internal: g.attributes.isInternalGroup, allBuilds: g.attributes.hasAccessToAllBuilds }
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

  for (const g of await groups(key)) {
    const detail = g.internal
      ? `internal, ${g.allBuilds ? 'gets every build' : 'builds added by hand'}, ${g.testers} tester${g.testers === 1 ? '' : 's'}${g.states ? ` (${g.states})` : ''}`
      : 'external'
    console.log(`Group "${g.name}": ${detail}`)
    summary(`- Group "${g.name}": ${detail}`)
  }
  console.log(`https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/testflight/ios`)
}

main().catch((e) => fail(e.message))
