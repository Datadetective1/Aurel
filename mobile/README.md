# Atturel for iPhone

React Native + Expo (SDK 57) + Expo Router + TypeScript. iOS first; nothing
here prevents Android later.

**One backend.** The app signs in with the web's Supabase auth (same account,
session in the Keychain) and reads and writes only through the web app's
`/api/mobile/*` routes with the user's access token. Those routes reuse the
web's read models and server actions unchanged, so business rules live in one
place. The request/response contract is `../src/lib/mobile/contracts.ts`,
imported directly (`@atturel/web/*` alias) — not copied.

Shared at runtime from `../src`: the loop-direction lens, timeline kinds,
glance/prep vocabulary, logo monograms, date formatting and the brand registry.
All are dependency-free.

## Run

```bash
npm ci                       # in the repo root too: shared types resolve from ../src
cd mobile && npm ci
npx expo start               # dev server; open in a development build on device
EXPO_PUBLIC_PREVIEW_DATA=1 npx expo start   # invented people, no network, labelled
```

Point at a different backend with `EXPO_PUBLIC_API_URL` (defaults to
`https://www.atturel.com`). The `/api/mobile` routes exist only on the
`visual-mobile-foundation` branch until it is merged and deployed.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest-expo: capture rules, component rendering
npx expo-doctor     # 19/21 offline; the other two need exp.host
EXPO_PUBLIC_PREVIEW_DATA=1 npx expo export --platform web   # render for screenshots
```

## Screens

| Tab | What it answers |
| --- | --- |
| Today | What is happening, who matters, what needs me. Countdown card for the meeting within 90 minutes. |
| People | Everyone, faces first, searchable. Person page: four facts, open loops by direction, the dated relationship memory. |
| Capture | One-tap record, pause/resume/stop, elapsed time, mark a moment, typed alternative. Then *What happened* review. |
| Atlas | People by organisation, connections the record holds at both ends, important relationships going quiet. |
| Ask | Ask Atturel over your own record, with what each answer rests on. |

Prepare (from Today or a person): **Glance · Quick · Deep**, all read from the
brief the web stored.

## Recording privacy

- Records only on the Capture screen, in the foreground, with a red state and
  live elapsed time. Leaving the app pauses it. Background recording and
  background audio are off in `app.json`.
- Recording other people requires confirming they know. The app asks; it does
  not give legal advice.
- Audio goes once to the existing transcription route, which drops it; only
  words are kept. Everything extracted arrives as proposals the user reviews.
- Current limit: 17 minutes per recording (serverless request body ~4.5 MB at
  32 kbps mono). Longer recordings need a direct-to-storage upload — not built.

## Not yet

Push notifications, offline cache, calendar on device, company logos (web has
them), photo upload/suggestions on the phone, StoreKit, EAS project and
bundle-id confirmation. See the night report for the App Store checklist.
