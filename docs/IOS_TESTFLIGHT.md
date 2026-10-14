# First iOS build and TestFlight — the steps that need Amary

Everything that could be done without an Apple or Expo login is done: bundle
id `com.atturel.app`, `mobile/eas.json` (development, preview, production
profiles), icon (1024×1024, no alpha), splash, microphone permission text,
Keychain session storage, in-app Account screen with Delete Account, and
public-only build variables. Nothing secret is in the app; the three
`EXPO_PUBLIC_*` values in `eas.json` are the same public values the website
ships to every browser.

**Before the build is useful:** the app talks to `https://www.atturel.com`.
The Account screen (`/api/mobile/account`) and segmented recording
(`/api/capture/*`) exist only on this branch. Merge and deploy it to
production first (with migrations 0021 and, for long recordings, 0022 —
see `docs/COMMERCIAL_READINESS.md`), or the build will show errors on the
Account screen.

## 1. Apple Developer account (once)

1. Go to <https://developer.apple.com/account> and sign in with the Apple ID
   that will own the app. If it is not enrolled, choose **Enroll** and
   complete the Apple Developer Program enrollment (paid, yearly). Enrolling as
   an organisation needs the company's D-U-N-S number.
2. Open **Membership details** and note the **Team ID**. Nothing in the repo
   needs it typed in; EAS asks for the Apple ID login and finds the team.

## 2. Register the bundle id and create the app record

1. <https://developer.apple.com/account/resources/identifiers/list> →
   **+** → **App IDs** → **App** → Continue.
2. Description `Atturel`, **Explicit** bundle ID `com.atturel.app`. No extra
   capabilities are needed. **Register**.
3. <https://appstoreconnect.apple.com> → **Apps** → **+** → **New App**.
   Platform **iOS**, Name **Atturel** (if taken, App Store Connect will say so
   — choose the display name then), language, Bundle ID **com.atturel.app**,
   SKU anything stable (for example `atturel-ios`), Access **Full**.
   **Create**. Note the numeric **Apple ID** of the app (App Information →
   General). EAS submit asks for it.

## 3. Expo account and project link (once)

On a Mac or any machine with Node 20+:

```bash
cd mobile
npm install
npx eas-cli@latest login          # Amary's Expo account; create one at expo.dev if needed
npx eas-cli@latest init           # links the project; writes owner + extra.eas.projectId into app.json
```

Commit the `app.json` change `init` makes.

## 4. Build

```bash
npx eas-cli@latest build --platform ios --profile production
```

When asked:

- **"Do you want to log in to your Apple account?"** — Yes, with the Apple ID
  from step 1 (two-factor code on your phone).
- **"Generate a new Apple Distribution Certificate?"** — Yes.
- **"Generate a new Apple Provisioning Profile?"** — Yes.

EAS stores the certificate and profile; nothing is written into the repo. The
build number increments itself (`autoIncrement`, remote version source).

## 5. Submit to TestFlight

```bash
npx eas-cli@latest submit --platform ios --latest
```

Give it the app's numeric Apple ID from step 2 when asked. Then in App Store
Connect → the app → **TestFlight**: wait for processing (usually 10–30
minutes). Export compliance is answered by the config
(`usesNonExemptEncryption: false`). Add yourself under **Internal Testing**,
install **TestFlight** from the App Store on the iPhone, and accept the
invitation.

Do not submit for App Store review yet.

## 6. Test on the device — what only a real iPhone can tell us

- Sign in; quit and reopen — the session survives (Keychain).
- Microphone prompt appears on first recording, with the text from app.json.
- Record a voice note under a minute; it transcribes and opens review.
- Record a conversation **longer than ten minutes** with the screen left on —
  confirm the screen does not auto-lock, the timer continues across the
  ten-minute segment boundary, and the transcript has no gap you can hear in
  the result. (Segmented recording requires migration 0022 and
  `CAPTURE_STORAGE_ENABLED=1`; without them the app stops at 17 minutes and
  says so.)
- Leave the app mid-recording — it pauses, and says so on return.
- Lock the phone with the side button mid-recording — it pauses.
- Today → person icon → Account: name, email, plan, Privacy and Terms open,
  Sign out works.
- Account → Delete account: test **only with a throwaway account**. Confirm
  the typed DELETE is required and that the account is gone on the web
  afterwards.
- Pearl and Obsidian (Settings → Display → Dark), Dynamic Type at a large
  size, and the iPhone SE / mini width.
