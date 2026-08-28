'use client'

import { brand } from '@/lib/brand'

/**
 * Last resort.
 *
 * Fires only when the root layout itself throws — a font failure, a bad
 * environment variable, a provider that cannot mount. At that point nothing
 * above it exists: no layout, no theme class, no guarantee the stylesheet
 * resolved. So this file renders its own document and does not import a single
 * component or token, because anything it imported could be the thing that
 * broke.
 *
 * That is also why the styles are inline and the colours are literals rather
 * than CSS variables. This is the one screen in the product allowed to bypass
 * the design system: a themed error page that fails to render is worse than a
 * plain one that does. The palette is Pearl's, so on the common path it still
 * looks like the product it belongs to.
 *
 * The one exception to importing nothing is the brand registry, which is a
 * constant object with no imports of its own. If that cannot load, nothing
 * could — and hard-coding the name here would quietly break the guarantee that
 * a rename is a one-file change.
 *
 * `prefers-color-scheme` is honoured through a tiny inline stylesheet rather
 * than a media query in JS, so it works before hydration.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#fbf9f6',
          color: '#1a1815',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0d0d0f !important; color: #f2efe9 !important; }
            .atturel-muted { color: #a8a49c !important; }
            .atturel-action { background: #f2efe9 !important; color: #0d0d0f !important; }
          }
        `}</style>

        <main style={{ maxWidth: '30rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.6875rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
            className="atturel-muted"
          >
            {brand.name}
          </p>

          <h1 style={{ margin: '0.75rem 0 0', fontSize: '1.75rem', fontWeight: 500 }}>
            {brand.name} didn&rsquo;t start.
          </h1>

          <p
            style={{ margin: '1rem 0 0', fontSize: '0.875rem' }}
            className="atturel-muted"
          >
            Something failed before the page could load. Your relationship record has not been
            changed or lost. Reloading usually fixes it.
          </p>

          <button
            type="button"
            onClick={reset}
            className="atturel-action"
            style={{
              marginTop: '1.75rem',
              // 44px: this may well be tapped on a phone, and it is the only
              // control on the screen.
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: '#1a1815',
              color: '#fbf9f6',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>

          {error.digest ? (
            <p
              style={{ margin: '2rem 0 0', fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace' }}
              className="atturel-muted"
            >
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
