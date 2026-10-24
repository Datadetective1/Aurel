# First iOS build and TestFlight — the steps only Amary can do

Everything that could be done without an Apple or Expo login is done and
verified (see [IOS_READINESS.md](IOS_READINESS.md)): bundle id
`com.atturel.app`, `mobile/eas.json`, icon, splash, microphone purpose string,
privacy manifest, Keychain sessions, in-app sign-up and Delete Account, and an
iOS production bundle that compiles. Nothing secret is in the app; the three
`EXPO_PUBLIC_*` values in `eas.json` are the same public values the website
ships to every browser.

What is left needs your Apple ID, your Expo account, or both. Nobody should
ever ask you for those passwords in a chat; you type them into Apple's and
Expo's own prompts.

Allow about an hour the first time, most of it waiting.

## 0. Before the build: merge and deploy the PR

The app talks to `https://www.atturel.com`. Creating meetings, preparing,
closing loops, signing up, onboarding, sample data and invitation codes need
the new `/api/mobile/*` routes from the `ios-testflight-readiness` PR. Until
it is merged and Vercel has deployed it, the app still runs but those buttons
say "not available from the app yet". No database migration is needed.

## 1. Apple Developer Program (once)

1. <https://developer.apple.com/account> → sign in with the Apple ID that will
   own the app. If it says you are not enrolled: **Enroll** (paid, yearly; an
   organisation needs its D-U-N-S number, an individual does not).
2. Wait for the enrollment email. Everything below needs it.

## 2. App Store Connect app record (once)

1. <https://appstoreconnect.apple.com> → **Apps** → **+** → **New App**.
2. Platforms **iOS** · Name **Atturel** (if taken, try "Atturel — Meeting Prep")
   · Primary language **English (U.S.)** · Bundle ID: choose
   **com.atturel.app** if listed. If it is not listed, open
   <https://developer.apple.com/account/resources/identifiers/list> → **+** →
   **App IDs** → **App** → Description `Atturel`, Explicit
   `com.atturel.app`, no extra capabilities → **Register**, then come back.
   · SKU `atturel-ios` · User Access **Full Access** → **Create**.
3. **App Information** → copy the numeric **Apple ID** (for example
   `6741234567`). You need it in step 5.

## 3. Expo account and project link (once)

On a Mac or Windows/Linux machine with Node 20 or newer and git:

```bash
git clone https://github.com/Datadetective1/Aurel.git && cd Aurel
npm ci                    # the app imports a few shared files from ../src
cd mobile && npm ci
npx eas-cli@latest login  # your Expo account; create one free at expo.dev
npx eas-cli@latest init   # links the project; adds extra.eas.projectId + owner to app.json
git add app.json && git commit -m "Link the Expo project" && git push
```

## 4. Build

```bash
npx eas-cli@latest build --platform ios --profile production
```

Answer the prompts:

- **Log in to your Apple account?** Yes — your Apple ID, then the 6-digit code
  on your iPhone.
- **Select a team** (if asked) — your developer team.
- **Register bundle identifier / generate Distribution Certificate /
  generate Provisioning Profile?** Yes to each. EAS stores them; nothing is
  written into the repository.

The build runs on Expo's servers, about 15–25 minutes. The build number is set
and incremented by EAS (`appVersionSource: remote`, `autoIncrement`), starting
at 1. The build page link printed in the terminal shows progress and logs.

## 5. Send it to TestFlight

```bash
npx eas-cli@latest submit --platform ios --latest
```

Give it the numeric Apple ID from step 2 when asked (or add
`"ascAppId": "<that number>"` under `submit.production.ios` in `eas.json` so
it never asks again). Apple then processes the build for 10–30 minutes and
emails you.

Export compliance is answered by the app itself (`ITSAppUsesNonExemptEncryption`
is false: the app only uses standard HTTPS).

## 6. Install it on your iPhone (internal testing — no Apple review)

1. App Store Connect → the app → **TestFlight**. The build appears under iOS
   builds once processed.
2. **Internal Testing** → **+** → group name `Team` → add yourself (and anyone
   else who is a user in your App Store Connect account; up to 100).
3. On the iPhone: install **TestFlight** from the App Store, open the invitation
   email, **Accept** → **Install**.

Each later build is: step 4 then step 5. Testers get it automatically.

## 7. Early testers outside your team (external testing — light Apple review)

Optional, after you have tried it yourself.

1. TestFlight → **External Testing** → **+** → group `Early testers`.
2. **Test Information**: beta description, feedback email
   (`support@atturel.com`), privacy policy URL
   `https://www.atturel.com/privacy`, and **Sign-in required → demo account**:
   a dedicated reviewer account with sample data loaded and pilot access (see
   the demo setup in IOS_READINESS.md). Never use your own account here.
3. Add the build to the group → **Submit for Review**. Beta review usually
   takes a day. Then invite by email or share the public TestFlight link.
4. Give testers pilot access so briefs and Atlas are not limited by the Free
   plan: issue invitation codes on the web (Settings › Access); testers enter
   them in the app under **Account › Invitation code**.

Do not submit for App Store review yet — see the payment-rule decision in
IOS_READINESS.md §5.

## 8. What only a real iPhone can confirm (please check on the first build)

- Sign in, quit, reopen — still signed in (Keychain).
- Create an account in the app; the confirmation email arrives; the link opens
  atturel.com; signing in on the phone then asks the one onboarding question.
- First recording shows the microphone prompt with Atturel's text.
- Record a 30-second voice note → **Understand it** → What happened shows the
  commitments → Keep → they appear on Today.
- Record, press the side button to lock the phone, unlock — it says it paused,
  and what was recorded is still there.
- Record, take a phone call (or start Siri) — it pauses and says why; nothing
  records until you press Resume.
- Turn on Airplane Mode before **Understand it** — it says the recording is
  safe; turn it off, try again, it goes through.
- Record, then swipe the app away from the app switcher while it is paused;
  reopen — Today offers the unsent recording.
- Record for more than ten minutes with the screen left on — the timer
  carries across the ten-minute part boundary and the transcript has no gap.
- Account › Delete account — only on a throwaway account. The typed DELETE is
  required, and the account is gone on the web afterwards.
- Light and dark mode, the largest Dynamic Type size, iPhone SE / mini width.
