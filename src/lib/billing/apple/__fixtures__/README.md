# Test-only certificates

A throwaway three-level chain (root, intermediate, leaf) made with openssl for
the unit tests of `../jws.ts`. It imitates the shape of Apple's StoreKit
signing chain, including Apple's marker extensions, so the verifier's checks
can be exercised without Apple's real keys.

`leaf.key.pem` signs test payloads and nothing else. These files are never
loaded outside tests: production pins Apple's real root by its SHA-256
fingerprint (see `APPLE_ROOT_CA_G3_SHA256` in `../jws.ts`), so a JWS signed
with this chain is rejected there.
