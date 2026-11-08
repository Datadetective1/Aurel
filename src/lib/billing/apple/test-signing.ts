import { readFileSync } from 'node:fs'
import { createPrivateKey, sign, X509Certificate } from 'node:crypto'
import { fileURLToPath } from 'node:url'

/**
 * TEST ONLY. Signs payloads with the throwaway chain in ./__fixtures__ so the
 * verifier and the purchase logic can be exercised end to end. Imported only
 * from *.test.ts files.
 */

const dir = fileURLToPath(new URL('./__fixtures__/', import.meta.url))
const pem = (name: string) => readFileSync(`${dir}${name}`, 'utf8')

const der = (name: string) => new X509Certificate(pem(name)).raw.toString('base64')

export const TEST_CHAIN = {
  leaf: der('leaf.pem'),
  leafNoOid: der('leaf-no-oid.pem'),
  intermediate: der('inter.pem'),
  root: der('root.pem'),
}

export const TEST_ROOT_FINGERPRINT = new X509Certificate(pem('root.pem')).fingerprint256

const leafKey = createPrivateKey(pem('leaf.key.pem'))

export function signTestJws(
  payload: unknown,
  options: { x5c?: string[]; alg?: string } = {},
): string {
  const header = {
    alg: options.alg ?? 'ES256',
    x5c: options.x5c ?? [TEST_CHAIN.leaf, TEST_CHAIN.intermediate, TEST_CHAIN.root],
  }
  const h = Buffer.from(JSON.stringify(header)).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${h}.${p}`), {
    key: leafKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${h}.${p}.${signature.toString('base64url')}`
}
