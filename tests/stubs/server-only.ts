// vitest stub for the `server-only` guard package.
// The real package throws if imported into a client bundle; under Node in tests
// there is no such boundary, so importing it must simply be a no-op.
export {}
