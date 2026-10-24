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

## 0. Backend — done

The `/api/mobile/*` routes the app uses were merged (PR #7) and are live on
`https://www.atturel.com`. No database migration is needed.

## 1. Apple Developer Program (once) — done

## 2. App Store Connect app record (once) — done

The app record for bundle id `com.atturel.app` exists. Its numeric **Apple
ID** (App Store Connect → the app → **App Information** → General → Apple ID,
for example `6741234567`) is not a secret; keep it handy for step 5.

## 3. Link the project to Expo (once)

`mobile/app.json` already names the owner, `datadetective1`, so the project is
created under your account and nowhere else. Other projects on the account
(such as PacePerk) are not touched: EAS addresses a project by its own slug,
`atturel`.

On a Mac, Windows or Linux computer with git and Node 22 (LTS):

```bash
git clone https://github.com/Datadetective1/Aurel.git
cd Aurel/mobile
npm ci
npx eas-cli@latest login     # sign in to Expo yourself, in the terminal
npx eas-cli@latest whoami    # must print: datadetective1
npx eas-cli@latest init      # answer Yes to "Create a project for @datadetective1/atturel?"
```

`init` adds one line to `mobile/app.json`: `"extra": { "eas": { "projectId":
"…" } }`. The project ID is not a secret. Either commit and push that change,
or send the ID to whoever maintains the repo so it is committed for you;
GitHub-started builds (step 7) need it on `main`.

If `init` instead says a project already exists, stop: answer **No** and check
<https://expo.dev/accounts/datadetective1/projects> — do not create a second
one.

## 4. Build and send to TestFlight in one command

From `Aurel/mobile`:

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

EAS asks a few questions the first time. Answer them yourself, in the
terminal — never paste a password, a 2FA code or a key file into a chat:

- **Log in to your Apple account?** Yes. Apple ID and password go to Apple
  through EAS; then the six-digit code on your iPhone.
- **Select a team** (if asked): your developer team.
- **Bundle identifier `com.atturel.app`** is already registered; EAS finds it.
- **Distribution certificate.** If EAS offers to **reuse an existing Apple
  Distribution Certificate** (for example the one PacePerk uses), choose
  reuse — sharing it between apps on one team is normal and changes nothing
  for PacePerk. If it offers to generate a new one, that is fine too.
  **If it ever asks you to revoke a certificate, answer No** and stop:
  revoking would break builds that use it.
- **Provisioning profile:** generate a new one (it is specific to
  `com.atturel.app`; PacePerk's is untouched).
- **App Store Connect API Key for submissions:** let EAS generate one (or
  reuse an existing one). EAS stores it so this and later submissions to
  TestFlight run without asking again.

The build runs on Expo's servers, about 15–25 minutes, using the SDK 57 image
(Xcode 26.6) pinned in `eas.json`. The build number starts at 1 and is
incremented by EAS on every build. When it finishes, EAS uploads it to App
Store Connect automatically (`--auto-submit`); the terminal and
<https://expo.dev/accounts/datadetective1/projects/atturel/submissions> show
progress.

## 5. If the upload needs doing by hand

Only if `--auto-submit` was left off or the submission failed:

```bash
npx eas-cli@latest submit --platform ios --latest
```

Give it the numeric Apple ID from step 2 if asked. Apple then processes the
build for 10–30 minutes and emails you. Export compliance is answered by the
app itself (`ITSAppUsesNonExemptEncryption` is false: standard HTTPS only).

## 6. Install it on your iPhone (internal testing — no Apple review)

1. App Store Connect → the app → **TestFlight**. The build appears under iOS
   builds once processed.
2. **Internal Testing** → **+** → group name `Team` → add yourself (and anyone
   else who is a user in your App Store Connect account; up to 100).
3. On the iPhone: install **TestFlight** from the App Store, open the invitation
   email, **Accept** → **Install**.

Each later build is step 4 again. Testers get it automatically.

## 6a. Later builds without your computer (optional)

Once one build has succeeded from your computer (EAS's requirement for
GitHub-started builds), later builds can start from GitHub — from the Expo
website, or by an assistant connected to your Expo account:

1. <https://expo.dev/accounts/datadetective1/projects/atturel/github> →
   **Install** the Expo GitHub App on the GitHub account that owns `Aurel` →
   link the repository `Datadetective1/Aurel`.
2. Set **Base directory** to `mobile`.
3. Make sure the project ID from step 3 is committed on `main`.

Builds then use the same profile and credentials as step 4.

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
