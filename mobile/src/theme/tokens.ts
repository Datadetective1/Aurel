/**
 * ATTUREL TOKENS, NATIVE
 * =============================================================================
 * The same two themes as the web (src/app/globals.css), as values React
 * Native can use. Pearl is warm ivory and reads like paper; Obsidian is
 * graphite and easier at night. Neither is the default the other degrades
 * from. Brass is a marker -- an icon, a rule, a selected state -- never a
 * flood fill; primary actions are high-contrast ink.
 *
 * Keep these in step with globals.css. Contrast notes live there.
 * =============================================================================
 */

export interface Palette {
  bg: string
  bgSunken: string
  surface: string
  surfaceInverse: string
  ink: string
  inkSecondary: string
  inkMuted: string
  inkFaint: string
  inkInverse: string
  line: string
  lineStrong: string
  accent: string
  accentStrong: string
  accentGraphic: string
  accentWash: string
  positive: string
  positiveWash: string
  positiveStrong: string
  caution: string
  cautionWash: string
  cautionStrong: string
  critical: string
  criticalWash: string
  criticalStrong: string
  info: string
  infoWash: string
}

export const pearl: Palette = {
  bg: '#fbf9f6',
  bgSunken: '#f3f0ea',
  surface: '#ffffff',
  surfaceInverse: '#16161a',
  ink: '#1a1815',
  inkSecondary: '#4a4741',
  inkMuted: '#6b6862',
  inkFaint: '#716d65',
  inkInverse: '#f7f4ee',
  line: '#e7e2d9',
  lineStrong: '#c6bfb1',
  accent: '#856427',
  accentStrong: '#674d1b',
  accentGraphic: '#b5893f',
  accentWash: 'rgba(181,137,63,0.10)',
  positive: '#2f6b45',
  positiveWash: 'rgba(47,107,69,0.10)',
  positiveStrong: '#255436',
  caution: '#8a5a12',
  cautionWash: 'rgba(138,90,18,0.10)',
  cautionStrong: '#6b4610',
  critical: '#9b2c25',
  criticalWash: 'rgba(155,44,37,0.10)',
  criticalStrong: '#7d231d',
  info: '#2b5673',
  infoWash: 'rgba(43,86,115,0.10)',
}

export const obsidian: Palette = {
  bg: '#0d0d0f',
  bgSunken: '#08080a',
  surface: '#141417',
  surfaceInverse: '#f7f4ee',
  ink: '#f2efe9',
  inkSecondary: '#b4b0a8',
  inkMuted: '#9b978f',
  inkFaint: '#87837c',
  inkInverse: '#16161a',
  line: '#26262b',
  lineStrong: '#44444c',
  accent: '#d9b074',
  accentStrong: '#eac795',
  accentGraphic: '#d9b074',
  accentWash: 'rgba(217,176,116,0.12)',
  positive: '#7fc79a',
  positiveWash: 'rgba(127,199,154,0.12)',
  positiveStrong: '#7fc79a',
  caution: '#e0b062',
  cautionWash: 'rgba(224,176,98,0.12)',
  cautionStrong: '#e0b062',
  critical: '#e58a80',
  criticalWash: 'rgba(229,138,128,0.12)',
  criticalStrong: '#e58a80',
  info: '#8fbcdc',
  infoWash: 'rgba(143,188,220,0.12)',
}

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemi: 'InstrumentSans_600SemiBold',
}

export const radius = { sm: 4, md: 8, lg: 12, xl: 18, full: 999 }
export const space = (n: number) => n * 4

/** The smallest a tappable thing may be, per Apple's guidance. */
export const TOUCH = 44
