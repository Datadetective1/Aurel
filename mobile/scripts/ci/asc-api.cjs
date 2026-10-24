/**
 * The App Store Connect API, signed with a team API key (ES256 JWT, 10
 * minutes). Shared by asc-setup.cjs and testflight-status.cjs. No
 * dependencies; Node 22. GET by default; POST with a JSON body when given.
 */

const crypto = require('crypto')

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function ascToken({ keyP8, keyId, issuerId }) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }))
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: keyP8, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${signature.toString('base64url')}`
}

async function asc(key, pathAndQuery, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${pathAndQuery}`, {
    method,
    headers: {
      authorization: `Bearer ${ascToken(key)}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    const detail = json?.errors?.[0]?.detail ?? json?.errors?.[0]?.title ?? ''
    throw new Error(`App Store Connect answered ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.status === 204 ? null : res.json()
}

module.exports = { asc }
