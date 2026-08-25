/**
 * EMAIL PALETTE AND TYPE
 * =============================================================================
 * A deliberate copy of the Pearl tokens rather than an import of them.
 *
 * Email has no CSS custom properties, no cascade worth relying on, and no dark
 * mode a sender can control. Every value has to be a literal hex in an inline
 * style attribute. Duplicating the palette here — once, named, commented —
 * keeps that unavoidable duplication in one file instead of smeared through
 * every template as magic strings.
 *
 * Pearl only: an email renders on the client's background, not ours, and a
 * dark-first design that lands in a white Gmail column looks broken. Light
 * ivory is safe everywhere.
 * =============================================================================
 */

export const palette = {
  bg: '#f3f0ea',
  surface: '#ffffff',
  ink: '#1a1815',
  inkSecondary: '#4a4741',
  inkMuted: '#6b6862',
  inkFaint: '#8a867e',
  line: '#e7e2d9',
  accent: '#856427',
  accentGraphic: '#b5893f',
  accentWash: '#f6f0e6',
  inkInverse: '#f7f4ee',
  surfaceInverse: '#16161a',
} as const

/**
 * Serif for display, system sans for body.
 *
 * No webfonts: Outlook ignores @font-face, Gmail strips it, and a failed
 * webfont in email falls back unpredictably rather than gracefully. The serif
 * stack below resolves to something editorial on every major client.
 */
export const fonts = {
  display: "Georgia, 'Times New Roman', Times, serif",
  body:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const
