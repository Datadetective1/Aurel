# Atturel for Android

The same Expo app as the iPhone app (`mobile/`), the same backend, accounts and
plans. Android is in **team testing**: a signed APK for the team's own phones.
It is not on Google Play, and pilots on Android use the website.

## Readiness audit (26 Oct 2026, main at `76f968d`)

| Area | Finding | Action |
| --- | --- | --- |
| Build configuration | `app.json` already had `android.package` `com.atturel.app` and adaptive icons. Expo SDK 57 / React Native 0.86 target SDK 36, min SDK 24 (Google Play requires 35 or later). `eas.json` built no APK. | `preview` and `simulator-preview` build APKs. |
| Dependencies | All Expo modules in use support Android. `expo-doctor`: only patch-level lags, the same as iOS build 5. The Android Hermes bundle builds (`npx expo export --platform android`). | None. |
| iOS-specific code | `ActionSheetIOS` (closing a loop) had an Android fallback with **four** buttons; Android dialogs show at most three, so one was lost. The meeting time picker asked for `mode="datetime"`, which **only iOS has**. | Fixed (below). |
| Wording | Seven sentences said "iPhone", the iOS Settings path, Siri or Safari. | Platform words in `lib/device.ts`; iOS wording unchanged. |
| Sign-in links | Sign-up, confirmation and password reset open atturel.com in the browser; no deep link is needed. The `atturel` scheme is registered. | None. |
| Secure storage | `expo-secure-store` (Android Keystore), chunked under 2 KB, already used on both platforms. Its config plugin excludes it from Android backups. | None. |
| Recording | `expo-audio` records AAC/M4A on Android with the same settings, in the app's private files folder (`directory: 'document'`), and pauses when the app leaves the foreground. Background recording stays off (no foreground service). | None. |
| Permissions | The manifest asked for `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (added by `expo-file-system` and `expo-image-picker`; unused) and `SYSTEM_ALERT_WINDOW`. The first APK's merged manifest also carried `CAMERA`, from `expo-image-picker`'s own manifest, although photos come through Android's system photo picker, which needs no permission, and the app never uses the camera. | All blocked. Runtime permission asked: microphone only. Normal permissions from libraries remain: internet, network state, vibrate, wake lock, install referrer, and biometric (from secure storage; no prompt, not used). |
| File handling | Unsent recordings and `pending.json` sit in the app's own files folder, which is stable across updates on Android. Export writes to the cache folder and opens the system share sheet. | None. |
| Navigation | Expo Router stack and tabs; the system Back button closes modals and steps back. Keyboard: `adjustResize`. Every screen applies the safe-area insets that Android's edge-to-edge layout needs. | None. |
| Text input | The "Anything to add" box on Capture centred its text vertically on Android. | Aligned to the top. |

## Fixes

- **New meeting › Pick a time.** Android shows the system's day dialog, then its time dialog (`lib/pick-time.ts`); backing out of either changes nothing. iOS keeps the inline picker.
- **Closing a loop.** Android's dialog shows Done (primary), Later and No longer needed; Back or a tap outside keeps the loop open. iOS keeps the action sheet with Keep open.
- **Wording.** "this phone", Settings › Apps › Atturel › Permissions › Microphone, "a call or another app", "your browser".
- **Manifest.** Camera, storage and overlay permissions are blocked (`android.blockedPermissions`); a test keeps them blocked and the microphone allowed.

Tests: `mobile/src/__tests__/android.test.tsx` (the two-dialog time picker, the three-button loop dialog, the words on each platform, iOS unchanged).

## Building a test APK

**Actions › Android build › Run workflow**, from `main` or a branch.

- **Production backend**: signs in to www.atturel.com (the `preview` profile).
- **Preview data**: the invented record, no sign-in or network (`simulator-preview`), for checking screens.

The run checks the app (typecheck, tests), then builds on EAS. The build page on expo.dev shows a QR code and an **Install** link. On the phone: open the link, download the APK, allow the browser to install unknown apps when Android asks, then install. Internal builds on Expo's free plan expire after 14 days.

**Signing.** The Android keystore was created in Expo's credential storage for `@datadetective1/atturel` by the first build (26 Oct 2026) and is reused by every build. It is not in the repository or in any log. When Google Play is set up, this keystore becomes the **upload key**, and Google holds the app signing key (Play App Signing).

## Google Play

### Subscriptions: what the store requires

Atturel sells Pro on the website (Stripe). The app sells nothing and links to no purchase. It shows the plan and, for a web subscriber, says the plan is changed or cancelled at atturel.com. Google Play's Payments policy allows this:

- "Google Play allows any app to be consumption-only, even if it is part of a paid service": the app gives access to what was bought elsewhere and offers nothing for sale in the app.
- Developers may not lead users to another payment method, including "directly linking to a webpage that could lead to an alternate payment method". Atturel's app shows no such link and no upgrade prompt.
- Administrative information, such as pointing to an account-management page, is allowed as long as it does not lead to a payment flow. The app's "Change or cancel it from Settings › Plan at atturel.com" is plain text with no link.

Selling Pro **inside** the Android app would need Google Play Billing. In the US, it could instead use Google's alternative-billing or external-content-links programs; both require enrolment, with transaction reporting and service fees from 1 October 2026. Neither is needed while the app stays consumption-only.

Before public release, keep the Android app consumption-only, as it is now, and mirror the decision made for the App Store build (audit §4, decisions 3 and 7).

Sources: [Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818), [US policy update](https://support.google.com/googleplay/android-developer/answer/15582165).

### Setup steps for the owner

1. **Developer account.** Sign up at [play.google.com/console](https://play.google.com/console/signup). There is a one-time fee (US$25), and Google verifies your identity.
   - A **personal** account created after 13 Nov 2023 must run a closed test with at least 12 testers for 14 days in a row before it can publish to production.
   - An **organization** account (with a D-U-N-S number, for example Harborlune LLC once it is formed) is exempt.
   - Choose the account type with this in mind.
2. **Create the app.** Name Atturel, default language English (US), type App, Free (the app itself is free), package `com.atturel.app` (set by the first upload).
3. **App content.** Policy › App content:
   - **Privacy policy**: `https://www.atturel.com/privacy`.
   - **App access**: sign-in required. Give a reviewer account, as for Apple.
   - **Ads**: no.
   - **Content rating** questionnaire.
   - **Target audience**: adults. Recommended: 18 and over, since Atturel is a work tool; this is your call.
   - **Data safety**: covered below.
   - **Account deletion**: in the app (Account › Delete account) and on the web (Settings › Data at atturel.com). Google asks for a web link where deletion can be requested.
   - **Financial features**: none.
   - **Health**: none.
4. **Data safety form.** Data collected and linked to the account, none sold or shared for advertising, encrypted in transit, deletion on request:
   - name and email;
   - audio, used only to transcribe and not stored;
   - photos (only those chosen);
   - other user content (notes about people, conversations);
   - contacts (the people a user records);
   - app interactions (product counts).

   It mirrors the App Store privacy labels in `mobile/app.json`.
5. **Service account for EAS Submit.** In Google Cloud, create a service account, grant it access in Play Console › Users and permissions, and create a JSON key ([expo.fyi/creating-google-service-account](https://expo.fyi/creating-google-service-account)). Upload the key on expo.dev › atturel › Credentials › Android › Service credentials. It is never pasted into chat or committed.
6. **First release, internal testing.** After step 5, an EAS `production` build (an `.aab`) can be submitted to the internal testing track (up to 100 testers you name by email, with no review wait). Internal testing is not set up yet. Until it is, testers install the APK from the build page.

### Before Android pilots

- The Privacy page describes recording "in the iPhone app". It needs Android wording before Android pilots use the app. That is a policy change for the owner to approve.
- Android **developer verification**: since 30 Sep 2026, certified Android phones in Brazil, Indonesia, Singapore and Thailand block installing apps, Play or sideloaded, from developers who have not verified their identity with Google. Wider rollout is expected through 2027. Registering the Play developer account (step 1) covers it.

## Verification (26 Oct 2026)

### Builds

| Build | Profile | Commit | Result |
| --- | --- | --- | --- |
| [0.1.0 (1)](https://expo.dev/accounts/datadetective1/projects/atturel/builds/8288b0a1-49ff-4f1b-9556-a75a222027a9) | preview (production backend) | `754c592` | **The test build to install.** Signed APK; no camera or storage permission. |
| [0.1.0 (1)](https://expo.dev/accounts/datadetective1/projects/atturel/builds/a322cab9-b45b-44fa-a00a-8b0b9df32b83) | simulator-preview (preview data) | `f5662cb` | For checking screens with invented data. Still carries CAMERA (built before the fix); not for phones. |
| [0.1.0 (1)](https://expo.dev/accounts/datadetective1/projects/atturel/builds/ca923e96-0c74-44af-b414-935094777ac1) | preview | `040e222` | Superseded: its manifest carried CAMERA. |

All three expire on Expo's free plan 14 days after they were built (9 Nov 2026).

### Automated (done)

- `mobile`: 117 jest tests, typecheck. `android.test.tsx` covers:
  - the two-dialog time picker;
  - the three-button loop dialog, with iOS unchanged;
  - device wording, with iOS unchanged;
  - the blocked permissions.
- Bundles: `npx expo export --platform android` and `--platform ios` both succeed.
- Manifest: `expo config --type introspect`.
- The test APK itself, inspected:
  - package `com.atturel.app`, version 0.1.0 (code 1);
  - minimum SDK 24, target SDK 36;
  - APK Signature Scheme v2+;
  - API `https://www.atturel.com`, preview data off;
  - native code for arm64-v8a, armeabi-v7a, x86 and x86_64.
- Permissions in the test APK:
  - Runtime (prompted): `RECORD_AUDIO` only.
  - Normal (no prompt): `INTERNET`, `ACCESS_NETWORK_STATE`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `WAKE_LOCK`, `USE_BIOMETRIC`/`USE_FINGERPRINT` (from secure storage, unused), and the Play install referrer.
- Shared logic is covered by existing tests on both platforms: offline retry and resume of unsent recordings (`pending-capture`), the upload transports, and photo resizing.

### Emulator (EAS Simulator, Android)

Waiting for the owner to approve a usage budget for simulator minutes. The approval prompt went unanswered on 26 Oct. Planned:

- **Preview-data APK:**
  - each tab;
  - a person;
  - New meeting with the day and time dialogs;
  - the loop dialog and Back;
  - Capture with the simulated recorder (start, pause, resume, stop, Understand, Review, Keep);
  - Ask;
  - Account;
  - the system photo picker opening without a permission prompt;
  - Back from every modal.
- **Production APK:** launch, the sign-in screen, and a failed sign-in, which proves the app reaches Supabase auth.

The emulator has no real microphone, and no test account's credentials are available to this session, so signed-in flows are on the physical-phone list.

### Physical Android phone (owner)

Install the test APK from its build page, sign in with your own account, then check, in order:

1. **Sign-in**, and staying signed in after closing and reopening the app.
2. **People:** list, search, open someone, edit, add a photo through the system picker (no permission prompt), archive and restore.
3. **Recording:**
   - Capture, Record (the microphone prompt appears once), pause, resume, stop.
   - **Understand it**, then **Review**, then **Keep**.
   - The conversation and its commitments appear on Today and on the person.
4. **Commitments:** tap a loop. The dialog shows Done / Later / No longer needed, and Back keeps it open.
5. **New meeting:** Pick a time shows the day dialog, then the time dialog. Create and prepare.
6. **Offline retry:** record, switch on aeroplane mode, tap Understand it. The recording is kept. Switch aeroplane mode off and tap Try again.
7. **Microphone recovery:**
   - Deny the microphone. Capture says where to turn it on, and **Open Settings** opens Atturel's app settings.
   - Allow it there, come back, and record.
   - Leaving the app while recording pauses it.
8. **Export:** Account, Export my data, then the share sheet.
9. **Ask:** ask a question about your record; the answer shows what it rests on.
10. **Keyboard:** on Ask, Sign in and New meeting, the field being typed in stays visible.

Report what fails with the phone model and Android version.
