/**
 * Preloaded into `eas credentials:configure-build` by the iOS TestFlight
 * workflow (NODE_OPTIONS=--require). It makes the CLI's first-time signing
 * setup run unattended, the same way `eas go` does: answer "reuse" to
 * "Reuse this distribution certificate?" and to reusing a provisioning
 * profile. It also refuses every revoke, so CI can never revoke a
 * distribution certificate, push key or API key that another app on the
 * Apple team (PacePerk) depends on.
 *
 * Every other question still fails the run: stdin is not a terminal in CI, so
 * the CLI throws instead of guessing an answer. If the team has no reusable
 * certificate, the CLI creates a new one. It cannot revoke one to make room.
 *
 * Pinned to the eas-cli version the workflow installs (EAS_CLI_DIR); its
 * internals are not a public API.
 */

const fs = require('fs')
const path = require('path')

// Only the eas process itself; the `expo config` children it spawns inherit
// NODE_OPTIONS too and have no use for this.
const real = (p) => {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}
const easDir = process.env.EAS_CLI_DIR && real(process.env.EAS_CLI_DIR)
const script = process.argv[1] && real(process.argv[1])
const isEas = Boolean(easDir && script && script.startsWith(easDir + path.sep))

if (isEas) {
  const contextModule = require(path.join(easDir, 'build/credentials/context.js'))
  const Original = contextModule.CredentialsContext
  contextModule.CredentialsContext = class extends Original {
    constructor(options) {
      super({ ...options, autoAcceptCredentialReuse: true })
    }
  }

  const AppStoreApi = require(path.join(easDir, 'build/credentials/ios/appstore/AppStoreApi.js')).default
  for (const method of ['revokeDistributionCertificateAsync', 'revokePushKeyAsync', 'revokeAscApiKeyAsync']) {
    AppStoreApi.prototype[method] = async () => {
      throw new Error(`Refusing to ${method.replace(/Async$/, '')} in CI. Existing Apple credentials are never revoked here.`)
    }
  }
}
