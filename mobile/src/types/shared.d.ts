// The web's shared types reach a few server modules by `import type` only
// (erased at build time). Their `server-only` side-effect import needs a
// declaration for the type checker; nothing of it is ever bundled here.
declare module 'server-only'
