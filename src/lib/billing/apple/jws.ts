import { X509Certificate, verify as verifySignature } from 'node:crypto'

/**
 * APPLE SIGNED DATA (JWS)
 * =============================================================================
 * Everything StoreKit 2 and the App Store Server Notifications send is a
 * compact JWS signed by Apple: header.payload.signature, ES256, with the
 * signing certificate chain in the header's `x5c` (leaf, Apple WWDR
 * intermediate, Apple Root CA - G3).
 *
 * Nothing in the payload may be trusted until all of this holds:
 *
 *   1. the header says ES256 and carries exactly three certificates
 *   2. the last certificate IS Apple Root CA - G3, by SHA-256 fingerprint,
 *      and is self-signed
 *   3. the intermediate is a CA issued and signed by that root, and carries
 *      Apple's WWDR marker extension (1.2.840.113635.100.6.2.1)
 *   4. the leaf is not a CA, is issued and signed by the intermediate, is a
 *      P-256 key, and carries Apple's receipt-signing marker
 *      (1.2.840.113635.100.6.11.1)
 *   5. every certificate is inside its validity window now
 *   6. the signature over header.payload verifies with the leaf's key
 *
 * This mirrors Apple's own App Store Server Library, without its online OCSP
 * check. Pure node:crypto, no dependency.
 *
 * The verifier proves WHO signed the data. It does not decide whether the
 * data is for this app or this account; the caller checks bundle id,
 * product and account binding (see ./purchases).
 * =============================================================================
 */

/**
 * SHA-256 fingerprint of Apple Root CA - G3, as published by Apple
 * (apple.com/certificateauthority) and as pinned by the App Store Server API
 * libraries. Node formats fingerprints as upper-case, colon-separated hex.
 */
export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79'

/** Apple WWDR intermediate marker. */
export const OID_APPLE_WWDR_INTERMEDIATE = '1.2.840.113635.100.6.2.1'
/** Apple receipt / StoreKit signing leaf marker. */
export const OID_APPLE_RECEIPT_SIGNER = '1.2.840.113635.100.6.11.1'

export class AppleJwsError extends Error {
  constructor(public readonly code: string) {
    super(`apple_jws:${code}`)
    this.name = 'AppleJwsError'
  }
}

export interface VerifyOptions {
  /** Override for tests only. Production always uses Apple's root. */
  rootFingerprint?: string
  now?: Date
}

/** DER encoding of an OBJECT IDENTIFIER, tag and length included. */
export function oidDer(oid: string): Buffer {
  const parts = oid.split('.').map((p) => Number(p))
  if (parts.length < 2 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
    throw new Error(`bad oid ${oid}`)
  }
  const [first = 0, second = 0, ...rest] = parts
  const bytes: number[] = [first * 40 + second]
  for (const value of rest) {
    const chunk: number[] = [value & 0x7f]
    let high = Math.floor(value / 128)
    while (high > 0) {
      chunk.unshift((high & 0x7f) | 0x80)
      high = Math.floor(high / 128)
    }
    bytes.push(...chunk)
  }
  return Buffer.from([0x06, bytes.length, ...bytes])
}

function hasExtension(cert: X509Certificate, oid: string): boolean {
  // X509Certificate does not expose arbitrary extensions; the OID's DER form
  // can only appear in the certificate as that extension's identifier.
  return cert.raw.includes(oidDer(oid))
}

function withinValidity(cert: X509Certificate, now: Date): boolean {
  const from = new Date(cert.validFrom).getTime()
  const to = new Date(cert.validTo).getTime()
  return (
    Number.isFinite(from) && Number.isFinite(to) && from <= now.getTime() && now.getTime() <= to
  )
}

function decodeSegment(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new AppleJwsError('malformed')
  return Buffer.from(segment, 'base64url')
}

function parseJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new AppleJwsError('malformed')
  }
}

/**
 * Verify an Apple-signed compact JWS and return its payload.
 * Throws AppleJwsError on any failure; never returns unverified data.
 */
export function verifyAppleJws<T = Record<string, unknown>>(
  token: string,
  options: VerifyOptions = {},
): T {
  if (typeof token !== 'string' || token.length > 64_000) throw new AppleJwsError('malformed')
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new AppleJwsError('malformed')
  const [headerB64 = '', payloadB64 = '', signatureB64 = ''] = parts

  const header = parseJson(decodeSegment(headerB64)) as { alg?: unknown; x5c?: unknown }
  if (header?.alg !== 'ES256') throw new AppleJwsError('bad_alg')
  if (
    !Array.isArray(header.x5c) ||
    header.x5c.length !== 3 ||
    header.x5c.some((c) => typeof c !== 'string')
  ) {
    throw new AppleJwsError('bad_chain')
  }

  let certs: X509Certificate[]
  try {
    certs = (header.x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, 'base64')))
  } catch {
    throw new AppleJwsError('bad_chain')
  }
  const [leaf, intermediate, root] = certs
  if (!leaf || !intermediate || !root) throw new AppleJwsError('bad_chain')

  const pinned = options.rootFingerprint ?? APPLE_ROOT_CA_G3_SHA256
  if (root.fingerprint256 !== pinned) throw new AppleJwsError('untrusted_root')
  if (!root.verify(root.publicKey)) throw new AppleJwsError('bad_chain')

  if (
    !intermediate.ca ||
    !intermediate.checkIssued(root) ||
    !intermediate.verify(root.publicKey) ||
    !hasExtension(intermediate, OID_APPLE_WWDR_INTERMEDIATE)
  ) {
    throw new AppleJwsError('bad_intermediate')
  }

  if (
    leaf.ca ||
    !leaf.checkIssued(intermediate) ||
    !leaf.verify(intermediate.publicKey) ||
    !hasExtension(leaf, OID_APPLE_RECEIPT_SIGNER)
  ) {
    throw new AppleJwsError('bad_leaf')
  }
  if (leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new AppleJwsError('bad_leaf')
  }

  const now = options.now ?? new Date()
  if (![leaf, intermediate, root].every((c) => withinValidity(c, now))) {
    throw new AppleJwsError('expired_chain')
  }

  const signature = decodeSegment(signatureB64)
  if (signature.length !== 64) throw new AppleJwsError('bad_signature')
  const ok = verifySignature(
    'sha256',
    Buffer.from(`${headerB64}.${payloadB64}`, 'ascii'),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  )
  if (!ok) throw new AppleJwsError('bad_signature')

  const payload = parseJson(decodeSegment(payloadB64))
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppleJwsError('malformed')
  }
  return payload as T
}
