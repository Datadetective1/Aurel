import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Instrument_Serif } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { brand, siteUrl, title } from '@/lib/brand'
import './globals.css'

/**
 * Typography.
 * Instrument Sans for interface, Instrument Serif for editorial display. They
 * are a designed pair, both OFL-licensed and therefore safe to self-host, which
 * next/font does automatically — no third-party font request at runtime.
 */
const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title(), template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  keywords: [
    'meeting preparation',
    'relationship intelligence',
    'communication coaching',
    'professional relationships',
    'stakeholder management',
  ],
  authors: [{ name: brand.legalEntity }],
  creator: brand.legalEntity,
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title: title(),
    description: brand.description,
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: title(),
    description: brand.description,
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <ThemeProvider>
          {/* Skip link: first tab stop on every page. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-surface-inverse focus:px-4 focus:py-2 focus:text-sm focus:text-ink-inverse"
          >
            Skip to content
          </a>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
