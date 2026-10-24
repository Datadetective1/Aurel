#!/usr/bin/env node
/**
 * Finds the App Store Connect API key the iOS TestFlight workflow signs and
 * uploads with, then hands it to the EAS CLI. Runs in GitHub Actions only.
 *
 * Where the key comes from, in order:
 *   1. The repository's Actions secrets ASC_API_KEY_P8, ASC_API_KEY_ID and
 *      ASC_API_KEY_ISSUER_ID, when all three are set.
 *   2. Otherwise, a team API key already stored on the Expo account (EAS keeps
 *      the keys it created for earlier submissions). Read with EXPO_TOKEN.
 *
 * A key is used only if it can see Atturel's App Store Connect record
 * (bundle com.atturel.app). That check also yields the numbers EAS needs: the
 * app's Apple ID (ascAppId) and the Apple team ID (the bundle ID's seed ID).
 *
 * Output:
 *   - the .p8 written to $RUNNER_TEMP/asc (mode 600), outside the repository,
 *     so it is never part of the archive uploaded to EAS
 *   - EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID,
 *     EXPO_APPLE_TEAM_ID, EXPO_APPLE_TEAM_TYPE and ASC_APP_ID in $GITHUB_ENV
 *   - eas.json's production submit profile filled in on the runner's copy
 *     (ascAppId plus the key), for --auto-submit
 *
 * Nothing secret is printed: only the key ID, its name, the team ID and the
 * app ID, none of which grant access on their own. Read-only against Apple.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { asc } = require('./asc-api.cjs')

const mobileDir = path.resolve(__dirname, '../..')
const appJson = JSON.parse(fs.readFileSync(path.join(mobileDir, 'app.json'), 'utf8')).expo
const bundleId = appJson.ios.bundleIdentifier
const accountName = appJson.owner

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

// Accepts the .p8 however it was pasted: the whole file, the file without its
// BEGIN/END lines, with Windows line endings or literal "\n"s, wrapped in
// quotes, or base64-encoded. Returns the key as the PKCS#8 PEM Apple issued.
function p8FromSecret(raw) {
  const text = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\r/g, '')
  const body = text
    .split('\n')
    .filter((line) => !/BEGIN|END/.test(line))
    .join('')
    .replace(/\s/g, '')
  const der = Buffer.from(body, 'base64')
  const attempts = [
    () => crypto.createPrivateKey(text),
    () => crypto.createPrivateKey(Buffer.from(text.replace(/\s/g, ''), 'base64').toString('utf8')),
    () => crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
    () => crypto.createPrivateKey({ key: der, format: 'der', type: 'sec1' }),
  ]
  for (const attempt of attempts) {
    try {
      const key = attempt()
      if (key.asymmetricKeyType === 'ec') return key.export({ type: 'pkcs8', format: 'pem' })
    } catch {
      // Try the next way it might have been pasted.
    }
  }
  // Describe the value's shape, never its content, so the cause is visible.
  const lines = text.split('\n').length
  const shape = /^[A-Z0-9]{10}$/.test(text)
    ? 'it looks like a Key ID'
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
      ? 'it looks like an Issuer ID'
      : /\.p8$/i.test(text)
        ? 'it looks like a file name'
        : `${text.length} characters on ${lines} line${lines === 1 ? '' : 's'}`
  fail(`ASC_API_KEY_P8 is not a readable App Store Connect key (${shape}). Open the AuthKey_XXXX.p8 file in a text editor and paste everything in it, including the BEGIN and END lines.`)
}

async function candidatesFromExpo() {
  const easDir = process.env.EAS_CLI_DIR
  if (!easDir || !process.env.EXPO_TOKEN) return []
  const { createGraphqlClient } = require(path.join(easDir, 'build/commandUtils/context/contextUtils/createGraphqlClient.js'))
  const { AppStoreConnectApiKeyQuery: AccountKeys } = require(path.join(easDir, 'build/credentials/ios/api/graphql/queries/AppStoreConnectApiKeyQuery.js'))
  const { AppStoreConnectApiKeyQuery: FullKey } = require(path.join(easDir, 'build/graphql/queries/AppStoreConnectApiKeyQuery.js'))
  const graphqlClient = createGraphqlClient({ accessToken: process.env.EXPO_TOKEN, sessionSecret: null })

  const keys = (await AccountKeys.getAllForAccountAsync(graphqlClient, accountName))
    .filter((k) => k.issuerIdentifier)
    .sort((a, b) => {
      const admin = (k) => (k.roles ?? []).includes('ADMIN') ? 0 : 1
      return admin(a) - admin(b) || String(b.updatedAt).localeCompare(String(a.updatedAt))
    })

  return keys.map((k) => ({
    source: `Expo account key "${k.name ?? k.keyIdentifier}"`,
    keyId: k.keyIdentifier,
    issuerId: k.issuerIdentifier,
    load: async () => (await FullKey.getByIdAsync(graphqlClient, k.id)).keyP8,
  }))
}

async function main() {
  if (!bundleId || !accountName) fail('app.json needs expo.owner and expo.ios.bundleIdentifier.')

  const { ASC_API_KEY_P8, ASC_API_KEY_ID, ASC_API_KEY_ISSUER_ID } = process.env
  const fromSecrets = Boolean(ASC_API_KEY_P8 && ASC_API_KEY_ID && ASC_API_KEY_ISSUER_ID)
  if (!fromSecrets && (ASC_API_KEY_P8 || ASC_API_KEY_ID || ASC_API_KEY_ISSUER_ID)) {
    fail('Set all three of ASC_API_KEY_P8, ASC_API_KEY_ID and ASC_API_KEY_ISSUER_ID, or none of them.')
  }
  if (fromSecrets) {
    const keyId = ASC_API_KEY_ID.trim()
    const issuerId = ASC_API_KEY_ISSUER_ID.trim()
    if (!/^[A-Z0-9]{10}$/.test(keyId)) {
      fail(`ASC_API_KEY_ID should be the 10-character Key ID shown next to the key (it has ${keyId.length} characters).`)
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) {
      fail(`ASC_API_KEY_ISSUER_ID should be the Issuer ID shown above the key list, like 57246542-96fe-1a63-e053-0824d011072a (it has ${issuerId.length} characters).`)
    }
  }

  const candidates = fromSecrets
    ? [{ source: 'GitHub secrets', keyId: ASC_API_KEY_ID.trim(), issuerId: ASC_API_KEY_ISSUER_ID.trim(), load: async () => p8FromSecret(ASC_API_KEY_P8) }]
    : await candidatesFromExpo()

  if (candidates.length === 0) {
    fail(
      'No App Store Connect API key is available. Add ASC_API_KEY_P8, ASC_API_KEY_ID and ASC_API_KEY_ISSUER_ID as Actions secrets ' +
        '(App Store Connect > Users and Access > Integrations > App Store Connect API, a team key with the Admin role).',
    )
  }

  const tried = []
  for (const candidate of candidates) {
    try {
      const key = { keyId: candidate.keyId, issuerId: candidate.issuerId, keyP8: await candidate.load() }
      const apps = await asc(key, `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId,name`)
      const app = apps.data.find((a) => a.attributes.bundleId === bundleId)
      if (!app) {
        tried.push(`${candidate.source} (${candidate.keyId}): no App Store Connect app with bundle ${bundleId} on this key's team`)
        continue
      }
      const ids = await asc(key, `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}&fields[bundleIds]=identifier,seedId`)
      const record = ids.data.find((b) => b.attributes.identifier === bundleId)
      if (!record?.attributes.seedId) {
        tried.push(`${candidate.source} (${candidate.keyId}): bundle ID ${bundleId} not found in Certificates, Identifiers & Profiles`)
        continue
      }
      return { candidate, key, ascAppId: app.id, appName: app.attributes.name, teamId: record.attributes.seedId }
    } catch (e) {
      tried.push(`${candidate.source} (${candidate.keyId}): ${e.message}`)
    }
  }
  fail(`No App Store Connect API key could reach ${bundleId}:\n  - ${tried.join('\n  - ')}`)
}

main().then(({ candidate, key, ascAppId, appName, teamId }) => {
  const dir = path.join(process.env.RUNNER_TEMP ?? fail('RUNNER_TEMP is not set; this runs in GitHub Actions.'), 'asc')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const keyPath = path.join(dir, `AuthKey_${key.keyId}.p8`)
  fs.writeFileSync(keyPath, key.keyP8, { mode: 0o600 })

  console.log(`::add-mask::${key.issuerId}`)
  const env = {
    EXPO_ASC_API_KEY_PATH: keyPath,
    EXPO_ASC_KEY_ID: key.keyId,
    EXPO_ASC_ISSUER_ID: key.issuerId,
    EXPO_APPLE_TEAM_ID: teamId,
    EXPO_APPLE_TEAM_TYPE: process.env.EXPO_APPLE_TEAM_TYPE || 'COMPANY_OR_ORGANIZATION',
    ASC_APP_ID: ascAppId,
  }
  fs.appendFileSync(process.env.GITHUB_ENV, Object.entries(env).map(([k, v]) => `${k}=${v}\n`).join(''))

  const easJsonPath = path.join(mobileDir, 'eas.json')
  const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'))
  easJson.submit = easJson.submit ?? {}
  easJson.submit.production = easJson.submit.production ?? {}
  easJson.submit.production.ios = {
    ...easJson.submit.production.ios,
    ascAppId,
    ascApiKeyPath: keyPath,
    ascApiKeyId: key.keyId,
    ascApiKeyIssuerId: key.issuerId,
  }
  fs.writeFileSync(easJsonPath, `${JSON.stringify(easJson, null, 2)}\n`)

  console.log(`App Store Connect: "${appName}" (app ID ${ascAppId}), team ${teamId}`)
  console.log(`API key ${key.keyId} from ${candidate.source}`)
}, (e) => fail(e.message))
