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
`https://www.atturel.com`). Create, prepare, sign-up, onboarding, loop actions,
sample data and invitation codes use routes added on `ios-testflight-readiness`;
against a server without them the app says "not available from the app yet".

Build and TestFlight: [docs/IOS_TESTFLIGHT.md](../docs/IOS_TESTFLIGHT.md).
Readiness, compliance and the demo script: [docs/IOS_READINESS.md](../docs/IOS_READINESS.md).

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest-expo: capture durability, transports, formatting, components
npx expo-doctor     # 20/21: version lags kept on purpose (see docs/IOS_READINESS.md)
npx expo export --platform ios   # the Hermes bundle EAS will build
EXPO_PUBLIC_PREVIEW_DATA=1 npx expo export --platform web --clear   # render for screenshots
```

## Screens

| Tab | What it answers |
| --- | --- |
| Today | What is happening, who matters, what needs me. Countdown card for the meeting within 90 minutes; **+** for a new meeting; open loops close with one tap (Done / Later / No longer needed). |
| People | Everyone, faces first, searchable; add someone. Person page: four facts, open loops by direction, the dated relationship memory. |
| Capture | One-tap record, pause/resume/stop, elapsed time, mark a moment, typed alternative. Then *What happened* review. The tab turns red while recording. |
| Atlas | People by organisation, connections the record holds at both ends, important relationships going quiet. Pro / pilot. |
| Ask | Ask Atturel over your own record, with what each answer rests on. |

New meeting: title, objective (required, as on the web), when (presets or the
native picker, in the account's time zone), who — then **Create and prepare**.
A meeting's page offers **Prepare now** / **Prepare again**, adds attendees,
and shows the brief at **Glance · Quick · Deep**.

First run: sign up in the app (or on the web), confirm the email, sign in, say
who you are. Account: plan, legal pages, invitation code, sample record, sign
out, Delete account.

## Recording: privacy and durability

- Records only in the foreground, visibly. Leaving the app, a call, or Siri
  pauses it and says why; nothing records again until Resume. Background
  recording is off in `app.json`.
- Recording other people requires confirming they know. The app asks; it does
  not give legal advice.
- A recording is kept as complete parts: every pause and every ten minutes
  closes the file (`lib/pending-capture.ts`). Parts are turned into words while
  the conversation carries on.
- Audio stays in the app's Documents folder until the conversation is kept on
  the server, then it is deleted. A failed transcription or save keeps the
  audio (and any words already back); reopening the app offers it again.
  Atturel's servers do not keep audio: each part is transcribed and dropped.
- Length: two hours (ten-minute parts, one request each, under the request
  ceiling), or seventeen minutes against a server that predates parts. The
  monthly transcription allowance applies to every part.

## Sample record

Account › Sample record loads invented people (labelled "Sample · invented"
everywhere) and removes them again, together with anything captured or
prepared with only them. For demos and for seeing the product before there is
a record of one's own.

## Not yet

Push notifications, offline cache, calendar on the device (it syncs on the
web), company logos, photo upload on the phone, StoreKit (see
docs/STOREKIT.md and the payment decision in docs/IOS_READINESS.md).
