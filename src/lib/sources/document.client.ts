/**
 * Document limits shared by the browser and the server.
 *
 * A separate module with no `server-only` guard, for the same reason
 * `sources/url.ts` is one: the upload control needs to reject an oversized file
 * before sending it, and importing the server module into a client component
 * would drag `unpdf` and `mammoth` into the browser bundle.
 *
 * The server re-checks every one of these. This is a courtesy to the user, not
 * the boundary.
 */

/** 10 MB. Large enough for a scanned bio, small enough to parse in a request. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
