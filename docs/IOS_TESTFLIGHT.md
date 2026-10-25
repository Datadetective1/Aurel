# iOS builds and TestFlight

Everything that could be done without an Apple or Expo login is done and
verified (see [IOS_READINESS.md](IOS_READINESS.md)): bundle id
`com.atturel.app`, `mobile/eas.json`, icon, splash, microphone purpose string,
privacy manifest, Keychain sessions, in-app sign-up and Delete Account, and an
iOS production bundle that compiles. Nothing secret is in the app; the three
`EXPO_PUBLIC_*` values in `eas.json` are the same public values the website
ships to every browser.

Builds run from GitHub, with no computer needed:
**Actions → iOS TestFlight → Run workflow**
(`.github/workflows/ios-testflight.yml`). The workflow builds on Expo's
servers, uploads to TestFlight for internal testing, and waits until Apple has
processed the build. It never submits the app for App Store review or release.

The first build, Atturel 0.1.0 (1), was built and uploaded this way on
24 October 2026. App Store Connect app ID: `6826645381`. Team: `7G53X2Y9ZL`.

Nobody should ever ask you for a password, a 2FA code or a key file in a
chat. Secrets go into GitHub's own secrets page, which encrypts them; once
saved, they cannot be read back, not even by whoever runs the workflow.

## 1. Once: give GitHub an Expo token and an Apple API key (Amary, done)

The Expo project `@datadetective1/atturel` exists (ID
`b7b37d6f-7256-4608-8a55-c2f0363628b9`, in `mobile/app.json`).

**Expo token** (`EXPO_TOKEN`, done):

1. <https://expo.dev> → your avatar → **Account settings** → **Access
   tokens** → **Create token**. Name it `github-atturel` and copy it.
2. <https://github.com/Datadetective1/Aurel/settings/secrets/actions> →
   **New repository secret**. Name: `EXPO_TOKEN`. Secret: paste the token →
   **Add secret**.

**App Store Connect API key** (`ASC_API_KEY_*`, done). The workflow signs in to Apple with this key
to create Atturel's provisioning profile and upload builds. No password or
2FA code is involved. EAS keeps such a key on the Expo account only after a
store submission, and PacePerk has only had internal builds, so there is
none to reuse. Create one:

1. App Store Connect → **Users and Access** → **Integrations** → **App Store
   Connect API** → **Team Keys** → **+**. Name `GitHub Atturel`, access
   **Admin** → **Generate**. Download the `.p8` file (Apple offers it once)
   and note the **Key ID** and the **Issuer ID** shown above the list.
2. Add three repository secrets on the same GitHub page:
   `ASC_API_KEY_P8` (open the `.p8` file in a text editor and paste all of
   it), `ASC_API_KEY_ID` and `ASC_API_KEY_ISSUER_ID`.

The workflow uses the key only after checking that it can see Atturel's App
Store Connect record. If these secrets are ever removed, it falls back to a
team key stored on the Expo account, if one exists.

## 2. Build and send to TestFlight

<https://github.com/Datadetective1/Aurel/actions/workflows/ios-testflight.yml>
→ **Run workflow** → branch `main` → **Run workflow**. "Upload the build to
TestFlight" is ticked by default; untick it for a build without an upload.

What the run does, in order:

1. Typechecks and tests the app. If either fails, the run stops before using
   an EAS build.
2. Checks that the token acts for `datadetective1`.
3. Links the Expo project `@datadetective1/atturel`, creating it on the first
   run. It never creates a second project or uses another account. PacePerk is
   a separate project and is not touched.
4. Finds the App Store Connect key (above), Atturel's App Store Connect app
   ID and the Apple team ID.
5. Sets up signing:
   - It reuses the Apple Distribution Certificate the team already keeps on
     Expo (PacePerk's, serial `48D1E631…`, valid until 13 September 2027).
     Sharing a certificate between apps on one team is normal and changes
     nothing for PacePerk.
   - Only if there is none, it creates one.
   - It creates a provisioning profile that belongs to `com.atturel.app`
     alone.
   - It can never revoke a certificate or a key. Any question the script does
     not expect stops the run rather than being answered.
6. Builds on EAS with the SDK 57 image (Xcode 26.6). The first build took
   about 6 minutes. EAS raises the build number on every build.
7. Uploads to App Store Connect. On the first upload, EAS created the
   internal TestFlight group **Team (Expo)**, which gets every build.
8. Waits until Apple has processed the build (usually 5–30 minutes), then
   reports whether internal testers can install it, and how many testers
   each internal group has.
   - If that group has no testers, it invites the team's Account Holder and
     Admins, and TestFlight emails each of them. EAS meant to do this on the
     first upload but left the group empty: it adds only users with the Admin
     role, which can miss the Account Holder. Export compliance is answered by the app itself
   (`ITSAppUsesNonExemptEncryption` is false: standard HTTPS only).

The run's summary page links the build on expo.dev and shows the TestFlight
result.

To check TestFlight without building, run **Actions → TestFlight status →
Run workflow** (`.github/workflows/testflight-status.yml`). It takes an
optional build number. It is read-only unless **invite team admins** is
ticked; then an empty internal group gets the Account Holder and Admins.

Later releases are the same button. Raise `version` in `mobile/app.json` for
a new public version number; build numbers take care of themselves.

## 3. Install it on your iPhone (internal testing, no Apple review)

1. On the iPhone, install **TestFlight** from the App Store.
2. Open the TestFlight invitation email → **View in TestFlight** → **Accept**
   → **Install**.
3. No email? App Store Connect → the app → **TestFlight** → **Internal
   Testing** → **Team (Expo)** (or create a group) → **+** next to Testers →
   add yourself. Internal testers must be users of your App Store Connect
   team, up to 100.

Testers get each later build automatically.

## 4. If a run fails

The failing step's log says why. The usual causes:

| Step | Message | Fix |
| --- | --- | --- |
| Check the Expo token | `EXPO_TOKEN secret is not set` | Step 1. |
| Confirm the Expo account | `does not act for the datadetective1 account` | Create the token while signed in to Expo as `datadetective1`. |
| Find the App Store Connect key | `No App Store Connect API key` or `could reach com.atturel.app` | Add the three `ASC_API_KEY_*` secrets (step 1). The key must be a team key, not an individual one. |
| Set up signing | `Maximum number of Distribution Certificates` | The team has no certificate on Expo and Apple's limit is reached. The run will not revoke one. Revoke an unused certificate yourself at developer.apple.com, or upload the existing one to Expo, then run again. |
| Build | Anything in the EAS build log | The summary links the build log on expo.dev. |
| Wait for Apple to process the build | `could not process` or `export compliance` | App Store Connect → TestFlight → the build shows the reason, and Apple emails it. |
| Wait for Apple to process the build | `Still waiting after 40 minutes` | Apple is slow. The upload is done; run **TestFlight status** later. |

## 4a. If the app crashes on the iPhone

1. When iOS asks "Atturel crashed: share additional information with the
   developer?", tap **Share** and say what you tapped. That sends the crash
   log to App Store Connect.
2. **Actions → TestFlight status → Run workflow** with **crash reports**
   ticked. The run prints the crash logs testers shared: device, iOS version,
   comment and backtrace, never the tester's email. A backtrace through
   `RCTExceptionsManager reportFatal` → `RCTFatal` means a JavaScript
   exception, not a native crash.
3. To check a fix on real iOS before a TestFlight build: **Actions → iOS
   TestFlight → Run workflow**, "What to build" = **Simulator (preview
   data)**. This is a release build for the iOS simulator with the app's
   invented preview data: no sign-in, no Apple signing, nothing uploaded.
   - It runs in an EAS macOS sandbox with `xcrun simctl`; the device log
     shows the JavaScript error message.
   - The first crash (0.1.0 (1)) was reproduced and its fix checked this
     way.

The first crash, on People and Today in 0.1.0 (1), came from
`Intl.RelativeTimeFormat`. The iPhone's JavaScript engine (Hermes) does not
have it; Node, where the tests ran, does. The mobile tests now run with the
iPhone's `Intl` (`mobile/jest.hermes-intl.js`). Every screen also has an
error boundary, so a screen that fails shows "Try again" instead of closing
the app.

## 5. Without GitHub, from a computer (fallback)

On a Mac, Windows or Linux computer with git and Node 22:

```bash
git clone https://github.com/Datadetective1/Aurel.git
cd Aurel/mobile
npm ci
npx eas-cli@latest login     # sign in to Expo yourself, in the terminal
npx eas-cli@latest whoami    # must print: datadetective1
npx eas-cli@latest init      # links or creates @datadetective1/atturel
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Answer EAS's questions yourself, in the terminal:

- Log in to your Apple account: yes. Then the six-digit code on your iPhone.
- **Reuse** the existing distribution certificate.
- Generate a new provisioning profile.
- Let EAS generate or reuse an App Store Connect API key.

**If EAS ever asks you to revoke a certificate, answer No** and stop.

## 6. Early testers outside your team (external testing, Apple beta review)

**Build 0.1.0 (5), no new build.** Apple reports it `READY_FOR_BETA_SUBMISSION`,
export compliance answered, expiring 23 Jan 2027 (audit §5, "External
TestFlight"). The steps run from the **TestFlight status** workflow's
**External action** (PR #29), so the App Store Connect key never leaves GitHub.
Nothing secret is printed.

**Done (25 Oct 2026, `prepare`):** the external group **Atturel Pilot** (no
public link, no build yet); the test information (description, feedback email
`support@atturel.com`, marketing URL, privacy policy URL); and What to Test on
build 5.

**Your two steps (both done 25 Oct 2026).**

1. **The review contact.** Apple accepts no change to the Beta App Review
   details without it. App Store Connect → Apps → Atturel → TestFlight → Test
   Information → **Beta App Review Information**: enter your first name, last
   name, phone and email, and save.
2. **A Supabase secret key for the workflow.** Supabase → project Aurel →
   Project Settings → API Keys → Secret keys → **Add new secret key**, named
   `github-testflight`, and copy it. GitHub → Datadetective1/Aurel → Settings
   → Secrets and variables → Actions → **New repository secret**: name
   `SUPABASE_SECRET_KEY`, paste the key, and save. It goes nowhere else, and
   you can revoke it on its own in Supabase.

Then `prepare` runs again and sets (done 25 Oct 2026, run #10: sign-in verified, Full access):

- **Sign-in required**, user name `appreview@atturel.com`, and the password.
  The password is generated inside the workflow, set on the reviewer's Atturel
  account through Supabase Auth's admin API, then stored in App Store Connect,
  which keeps it for Apple; you can read it on that page. The run then signs in
  with App Store Connect's copy to prove it works. No password, hash or key is
  printed. To replace the password, run `prepare` with **rotate demo
  password**. Optionally, make `appreview@atturel.com` a Cloudflare Email
  Routing address for atturel.com that forwards to you, so **Forgot your
  password?** on www.atturel.com also works.
- **Review notes**, describing the plans as they are: Free, and Pro at $29 a
  month, bought only on the website. The app has no in-app purchases, prices,
  upgrade buttons or purchase links; Account only displays the plan, and Free
  accounts see an "Invitation code" field. They disclose the reviewer's Full
  access, say how audio is handled, and give the paths to try.

**Reviewer access: Full access, disclosed.** The account (created 25 Oct 2026:
onboarded, sample record loaded, emails off) has Atturel's existing **Full
access** tier, granted with `public.set_access_tier` (owner, 25 Oct 2026). It
has every Pro feature and no monthly limits, does not expire during review, and
involves no trial and no purchase. The app shows "Full access" and "Included
with your access. Nothing is billed.", and the review notes say so. `submit`
refuses unless the account signs in with the App Store Connect password and
reads Full access. When review access is no longer needed, revoke it:
`select public.set_access_tier('appreview@atturel.com', 'standard');`. Neither
Free nor Full access settles Apple's payment rules: that question stays open
for the App Store (IOS_READINESS.md §5, item 1).

**Before submitting:** the policy corrections are approved and published
(their own draft PR), and the core real-device checks on build 5 have passed
(audit §1.4). Then `submit` adds build 5 to Atturel Pilot and submits it
for beta review, which usually takes about a day.

**After approval:** `public-link` turns on the group's public link, limited to
10 testers. Testers create an account and use the standard 14-day Pro trial
from the website (Settings › Plan), then $29 a month if they subscribe. No
invitation codes by default (owner, 25 Oct 2026).

Do not submit for App Store review yet. See the payment-rule decision in
IOS_READINESS.md §5.

## 7. What only a real iPhone can confirm (please check on the first build)

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
