import type { NextConfig } from 'next'

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // `microphone=(self)`, not `microphone=()`. An empty allowlist disables the
  // feature for the document itself, not just for embedded frames, so the
  // voice debrief's getUserMedia call was refused with NotAllowedError on
  // every production page. The page then said "Microphone access wasn't
  // allowed", which was true, and pointed at the browser, which was not.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: a stray lockfile in the parent home directory would
  // otherwise make Turbopack treat the whole home dir as the project root.
  turbopack: { root: __dirname },
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
    // Server Actions default to a 1 MB body. The document reader accepts a
    // 10 MB PDF and the conversation importer accepts a transcript file, both
    // through actions, so anything over a megabyte was refused before the
    // action ran and the form reported a generic failure. Audio goes through
    // a route handler instead and is not governed by this.
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
