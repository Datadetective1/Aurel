import { describe, expect, it } from 'vitest'
import {
  APPLE_ROOT_CA_G3_SHA256,
  AppleJwsError,
  OID_APPLE_RECEIPT_SIGNER,
  oidDer,
  verifyAppleJws,
} from './jws'
import { signTestJws, TEST_CHAIN, TEST_ROOT_FINGERPRINT } from './test-signing'

const opts = { rootFingerprint: TEST_ROOT_FINGERPRINT }
const payload = { bundleId: 'com.atturel.app', productId: 'p', signedDate: 1 }

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppleJwsError) return error.code
    throw error
  }
  return 'accepted'
}

describe('verifyAppleJws', () => {
  it('returns the payload of a correctly signed token', () => {
    expect(verifyAppleJws(signTestJws(payload), opts)).toEqual(payload)
  })

  it('rejects the test chain against the real Apple root (the production default)', () => {
    expect(code(() => verifyAppleJws(signTestJws(payload)))).toBe('untrusted_root')
  })

  it('pins the published Apple Root CA - G3 fingerprint', () => {
    expect(APPLE_ROOT_CA_G3_SHA256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    )
  })

  it('rejects a payload changed after signing', () => {
    const [h, , s] = signTestJws(payload).split('.')
    const forged = Buffer.from(JSON.stringify({ ...payload, productId: 'free-pro' })).toString(
      'base64url',
    )
    expect(code(() => verifyAppleJws(`${h}.${forged}.${s}`, opts))).toBe('bad_signature')
  })

  it('rejects any algorithm but ES256, including none', () => {
    expect(code(() => verifyAppleJws(signTestJws(payload, { alg: 'none' }), opts))).toBe('bad_alg')
    expect(code(() => verifyAppleJws(signTestJws(payload, { alg: 'HS256' }), opts))).toBe('bad_alg')
  })

  it('rejects a chain that is short, reordered or missing the marker extensions', () => {
    const { leaf, intermediate, root, leafNoOid } = TEST_CHAIN
    expect(code(() => verifyAppleJws(signTestJws(payload, { x5c: [leaf, root] }), opts))).toBe(
      'bad_chain',
    )
    expect(
      code(() => verifyAppleJws(signTestJws(payload, { x5c: [intermediate, leaf, root] }), opts)),
    ).toBe('bad_intermediate')
    expect(
      code(() =>
        verifyAppleJws(signTestJws(payload, { x5c: [leafNoOid, intermediate, root] }), opts),
      ),
    ).toBe('bad_leaf')
  })

  it('rejects a chain outside its validity window', () => {
    expect(
      code(() => verifyAppleJws(signTestJws(payload), { ...opts, now: new Date('2000-01-01') })),
    ).toBe('expired_chain')
  })

  it('rejects malformed input', () => {
    for (const token of ['', 'a.b', 'a.b.c.d', 'not base64!.x.y', '..']) {
      expect(code(() => verifyAppleJws(token, opts))).not.toBe('accepted')
    }
  })

  it('encodes Apple marker OIDs in DER', () => {
    expect(oidDer(OID_APPLE_RECEIPT_SIGNER).toString('hex')).toBe('060a2a864886f76364060b01')
  })
})
