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
servers and uploads to TestFlight for internal testing. It never submits the
app for App Store review or release.

Nobody should ever ask you for a password, a 2FA code or a key file in a
chat. Secrets go into GitHub's own secrets page, which encrypts them; once
saved, they cannot be read back, not even by whoever runs the workflow.

## 1. Once: give GitHub an Expo token (Amary)

1. <https://expo.dev> → your avatar → **Account settings** → **Access
   tokens** → **Create token**. Name it `github-atturel` and copy it.
2. <https://github.com/Datadetective1/Aurel/settings/secrets/actions> →
   **New repository secret**. Name: `EXPO_TOKEN`. Secret: paste the token →
   **Add secret**.

That is usually all. The workflow signs in to Apple with an App Store Connect
API key it finds on your Expo account: EAS stores one there when it submits
an app, as it did for PacePerk. The workflow uses a key only after checking
that it can see Atturel's App Store Connect record.

**Only if a run stops with "No App Store Connect API key"**, add a key of
your own:

1. App Store Connect → **Users and Access** → **Integrations** → **App Store
   Connect API** → **Team Keys** → **+**. Name `GitHub Atturel`, access
   **Admin** → **Generate**. Download the `.p8` file (Apple offers it once)
   and note the **Key ID** and the **Issuer ID** shown above the list.
2. Add three repository secrets on the same GitHub page:
   `ASC_API_KEY_P8` (open the `.p8` file in a text editor and paste all of
   it), `ASC_API_KEY_ID` and `ASC_API_KEY_ISSUER_ID`.

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
     Expo (PacePerk's). Sharing a certificate between apps on one team is
     normal and changes nothing for PacePerk.
   - Only if there is none, it creates one.
   - It creates a provisioning profile that belongs to `com.atturel.app`
     alone.
   - It can never revoke a certificate or a key. Any question the script does
     not expect stops the run rather than being answered.
6. Builds on EAS with the SDK 57 image (Xcode 26.6), in about 15–25 minutes.
   EAS raises the build number on every build.
7. Uploads to App Store Connect. On the first upload, EAS creates the
   internal TestFlight group **Team (Expo)**, which gets every build, and
   invites the team's Admin users.

The run's summary page links the build on expo.dev. Apple then processes the
build, usually in 10–30 minutes. Export compliance is answered by the app
itself (`ITSAppUsesNonExemptEncryption` is false: standard HTTPS only).

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

## 6. Early testers outside your team (external testing, light Apple review)

Optional, after you have tried it yourself.

1. TestFlight → **External Testing** → **+** → group `Early testers`.
2. **Test Information**:
   - beta description;
   - feedback email: `support@atturel.com`;
   - privacy policy URL: `https://www.atturel.com/privacy`;
   - **Sign-in required → demo account**: a dedicated reviewer account with
     sample data loaded and pilot access (see the demo setup in
     IOS_READINESS.md). Never use your own account here.
3. Add the build to the group → **Submit for Review**. Beta review usually
   takes a day. Then invite by email or share the public TestFlight link.
4. Give testers pilot access so briefs and Atlas are not limited by the Free
   plan. Issue invitation codes on the web (Settings › Access); testers enter
   them in the app under **Account › Invitation code**.

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
