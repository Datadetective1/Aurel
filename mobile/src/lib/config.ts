/**
 * Where the app talks to. Every value has a public default so a fresh
 * checkout runs; override with EXPO_PUBLIC_* in mobile/.env.local.
 *
 * The Supabase URL and publishable key are public by design -- they are the
 * same two values the web inlines into every page (see .env.production), and
 * row level security is the boundary. No secret belongs here.
 */
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'https://www.atturel.com').replace(/\/$/, ''),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mfvomtwwnkqsaiqzjbxy.supabase.co',
  supabaseAnonKey:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_njz0Seq43wtwpE5zhRriRQ_CiQZLKe3',
  /**
   * Preview data: invented people and meetings, no network. For screenshots,
   * design review and App Review demo accounts. Always labelled on screen.
   */
  previewData: process.env.EXPO_PUBLIC_PREVIEW_DATA === '1',
}
