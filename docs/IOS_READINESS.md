# Atturel for iPhone — readiness, compliance and demo

Audited and built 24 October 2026 on branch `ios-testflight-readiness`.
Owner steps for the build itself: [IOS_TESTFLIGHT.md](IOS_TESTFLIGHT.md).

"Verified" below means exercised against the production database and API, or
compiled for iOS, in this session. Nothing here has run on a physical iPhone
yet: there is no build until the Expo/Apple steps are done.

## 1. Readiness matrix

| Journey                                    | State                                                       | How it was verified                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sign in, session in Keychain               | Working                                                     | Production auth + bearer routes (QA account); Keychain itself device-only                                     |
| Sign up in the app                         | Built, needs deploy                                         | Route tested (validation, enumeration-safe errors); web's own action                                          |
| First-run onboarding (one step)            | Built, needs deploy                                         | Against production DB via local server: `onboarded` flips, time zone saved                                    |
| Today                                      | Working                                                     | Production route, QA account                                                                                  |
| People, person page, timeline              | Working                                                     | Production routes                                                                                             |
| Add a person                               | Built, needs deploy                                         | Against production DB; plan limit enforced                                                                    |
| Create meeting (+ people, time)            | Built, needs deploy                                         | Against production DB: wall time stored in the account zone, foreign ids dropped, objective required          |
| Prepare / Prepare again                    | Built, needs deploy                                         | Against production DB: brief stored with evidence, read back by the **production** meeting route              |
| Brief at three depths                      | Working                                                     | Production route                                                                                              |
| Capture: voice note / conversation / typed | Working (typed verified end to end; audio path device-only) | Typed capture → reading → review → keep run against the production DB; audio upload is device-only            |
| What happened → keep commitments           | Working                                                     | Against production DB: kept loops appear on Today                                                             |
| Open loops: Done / Later / Cancel          | Built, needs deploy                                         | Against production DB                                                                                         |
| Atlas                                      | Working (Pro / pilot only)                                  | Production returns `plan_required` on Free; app shows a neutral notice                                        |
| Ask                                        | Working                                                     | Production: answer with confirmed citation                                                                    |
| Account, sign out, delete account          | Working                                                     | Production: typed DELETE required; QA account fully removed (0 rows left)                                     |
| Sample record load / remove                | Built, needs deploy                                         | Against production DB: removal also removes what was captured with the invented people, keeps everything real |
| Invitation code (pilot access)             | Built, needs deploy                                         | Route test; web's own redemption                                                                              |
| Recording on a physical iPhone             | Not verified                                                | Needs the first TestFlight build — checklist in IOS_TESTFLIGHT.md §8                                          |
| TestFlight build                           | Blocked on owner                                            | Needs Apple Developer + Expo login (IOS_TESTFLIGHT.md)                                                        |

"Needs deploy": the route exists on this branch, is tested, and returns a
clear "not available from the app yet" until the PR is merged and deployed.

## 2. What changed

**Recording reliability (the most important fixes).**

- _Fixed a data-loss bug:_ `prepareToRecordAsync()` was called without options,
  and expo-audio then reuses the previous file, so in a long (segmented)
  recording the next ten minutes overwrote the previous ten before they were
  uploaded. Every part now gets its own file.
- A recording is kept as complete parts: each pause and every ten minutes
  closes the file. If the app is killed, only the part being recorded at that
  instant can be lost, and the app says so on reopening.
- Audio stays in the app's private Documents folder (never the purgeable
  cache) until the conversation has been kept on the server, then it is
  deleted. A failed transcription keeps it; parts already transcribed are not
  sent twice; a failed save keeps the words too; Today offers back anything
  unsent. Discarding asks first.
- iOS pauses the recorder for a call or Siri, and expo-audio resumes _every_
  recorder afterwards, even one the person paused. The app now closes the part
  on any interruption, so nothing records until Resume is pressed, and the
  screen never shows "Recording" when it is not.
- While a recording is open the Capture tab turns red ("Recording"), because
  switching tabs to glance at the brief does not stop it.

**The 17-minute limit.** Verified live in production (`maxSeconds: 1020`,
segmented storage off; migration 0022 is _not_ applied). Because the phone now
sends each ten-minute part as its own request to the existing single-upload
route (about 2.4 MB each, under the 4.5 MB ceiling), recordings can run two
hours **without** migration 0022 once this PR is deployed. The monthly
transcription allowance is still checked on the server for every part. 0022
remains useful for long _web_ recordings; applying it is a separate, owner-
approved step (§6).

**Native flows added** — sign-up, onboarding, new meeting with people picker
and native date picker, Prepare now / again, add attendees, loop actions,
sample record, invitation code, refresh on return and on reconnect, avatar
fallback (initials always render under a photo), neutral plan copy that never
prompts a purchase.

**Backend** — ten additive `/api/mobile/*` routes, each calling the web's
existing server action; no schema change. One rule change for owner review:
the Free plan's five-person limit no longer counts the invented sample people.

**iOS config** — privacy manifest (required-reason APIs aggregated from the
native dependencies), the unused Face ID purpose string removed, microphone
text matched to actual behaviour.

## 3. Checks run

| Check                                                     | Result                                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web typecheck, lint, 949 unit tests                       | Pass (5 pre-existing lint warnings)                                                                                                                  |
| Next.js production build                                  | Pass, all 18 mobile routes compiled                                                                                                                  |
| Mobile typecheck, 30 unit tests                           | Pass                                                                                                                                                 |
| `expo export --platform ios` (Hermes)                     | Pass, 3.5 MB; also passes with the repo-root `node_modules` removed, as on EAS                                                                       |
| `expo prebuild --platform ios`                            | Pass: Info.plist, privacy manifest, no background modes, empty entitlements                                                                          |
| Secrets in the iOS bundle                                 | None: only the public Supabase URL, publishable key and API URL                                                                                      |
| `expo-doctor`                                             | 20/21: six patch-level Expo lags kept on purpose (newer patches nest `expo-modules-core` and break module resolution) and `@types/jest` (tests only) |
| Preview build at iPhone size (Playwright)                 | Today, new meeting, prepare, capture → pause → stop → review, people, person, account, Atlas, Ask, sign-in, sign-up; light and dark; iPhone SE width |
| Production API with a disposable QA account               | Auth, Today, people, meeting, Ask, Atlas plan gate, account deletion                                                                                 |
| New routes against the production database (local server) | Full journey above, then the QA account was deleted; 0 rows remain                                                                                   |

The QA account (`ios-qa-20261024@example.com`, undeliverable address, no email
sent) existed for about thirty minutes and was removed through the app's own
Delete Account route. The deletion workflow kept its one minimal audit row in
`account_deletions`, by design.

## 4. Apple compliance audit (checked against the live guidelines)

| Area                              | Status                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bundle id, signing                | `com.atturel.app`; certificates and profiles are created by EAS on the first build                                      |
| Microphone permission             | Purpose string present and accurate; foreground only; no `UIBackgroundModes`                                            |
| Privacy manifest                  | `PrivacyInfo.xcprivacy` generated from `ios.privacyManifests`; no tracking                                              |
| Account deletion (5.1.1(v))       | In the app: Account › Delete account, typed confirmation, billing stopped first                                         |
| Sign in with Apple (4.8)          | **Not required**: the app uses only Atturel's own email-and-password accounts                                           |
| Encryption export compliance      | `ITSAppUsesNonExemptEncryption = false` (HTTPS only)                                                                    |
| Demo account for review (2.1)     | `appreview@atturel.com`: Pro via the standard 14-day trial at submission, sample data, emails off; IOS_TESTFLIGHT.md §6 |
| In-app purchase (3.1.1, 3.1.3(b)) | **Owner decision before App Store submission** — see §5                                                                 |

### App Privacy answers for App Store Connect (draft, for you to confirm)

Data **linked to the user**, **not used for tracking**:

- Contact info → Name, Email address — App functionality.
- User content → Audio data (turned into words, not kept), Other user content
  (notes, conversations, commitments) — App functionality.
- Contacts → the people you keep a record of — App functionality. (Apple's
  wording is "contacts… in the user's address book or social graph"; a list of
  professional relationships is closest to it. Answering conservatively is
  safer.)
- Usage data → Product interaction (counts such as "brief opened"; no content)
  — Analytics.

Not collected by the app: location, health, financial info, browsing history,
identifiers for advertising, diagnostics/crash data (no crash SDK is in the
app). Payments are on the web, not in the app. These match the privacy
manifest; if you change an answer, change `mobile/app.json` too.

## 5. Decisions and blockers for you

1. **Payments on the App Store (blocks public App Store, not TestFlight).**
   Guideline 3.1.3(b) lets an app unlock a subscription bought on the web
   _provided it is also available as an in-app purchase_. The United States
   storefront now allows links to web checkout (3.1.1(a)), but that does not
   remove the 3.1.3(b) condition. A May 2026 Apple Developer Forums thread
   describes a SaaS app with no prices or upgrade buttons being rejected under
   3.1.1 repeatedly because the review account had a web-paid plan. Options:
   add StoreKit for Pro (plan in [STOREKIT.md](STOREKIT.md)), or submit with a
   reviewer account on Free and accept the rejection risk. Nothing was built or
   changed in billing.
2. **Free-plan limits for testers.** Free has 3 briefs a month, 60 transcription
   minutes, 5 people and no Atlas. **Decided (owner, 25 Oct 2026):** testers
   use the standard 14-day Pro trial, then $29 a month if they subscribe. No
   pilot codes by default.
3. **Sample people and the Free people limit.** This branch stops the five
   invented sample people from counting toward Free's five people (a Free
   account that loaded the sample could not add anyone real). Revert the
   one-line filter in `checkPersonLimit` if you disagree.
4. **Terms and Privacy still say "Draft"** (COMMERCIAL_READINESS.md). Fine for
   internal testing; resolve before external testers or the App Store.
5. **Portrait rights.** The sample people use the illustrated SVG faces shipped
   with the product; the homepage's AI-generated portraits are not used in the
   app (LEGAL_REVIEW_REQUIRED.md).

## 6. Migration 0022 (segmented storage) — not applied

Not needed for the phone after this PR. If you want long **web** recordings:

- **What it does:** creates a private `capture-audio` bucket (no client access)
  and an `audio_uploads` ledger table with RLS on and no policies. Additive.
- **Risk:** low; it touches no existing table. Audio would exist in storage
  for at most one transcription (or one hour, via the cleanup cron).
- **Rollback:** set `CAPTURE_STORAGE_ENABLED` off (or remove it), redeploy;
  then `drop table public.audio_uploads;` and delete the empty bucket.
- **Requires:** your approval, then applying the migration, setting
  `CAPTURE_STORAGE_ENABLED=1` in Vercel, and confirming the capture-cleanup
  cron runs with `CRON_SECRET`.

## 7. The two-minute demonstration

**Use a dedicated demo account**, never a customer's or your real one: sign up
in the app with a separate address (for example `demo@atturel.com`), redeem a
pilot code under Account so Atlas and briefs are unlimited, then
**Account › Sample record › Load sample people**. Every sample person is
marked "Sample · invented" on screen.

Before the meeting (one minute): open **Q3 capacity review** on Today and tap
**Prepare now** (10–30 seconds), so the brief is ready.

The script:

1. **Today (0:00–0:20).** "This is my morning. Tomorrow I have the Q3 capacity
   review with Maya, Daniel and Priya — invented people for this demo. The
   brief is ready, and Atturel is telling me I owe Maya utilization numbers.
   It's overdue."
2. **Prepare (0:20–0:50).** Tap the meeting. _Glance:_ "Ten seconds before I
   walk in: the objective, three things to remember, each with where it comes
   from — Maya pushed back on the timeline in March; Daniel challenged the ROI
   model twice." Tap _Quick_: "How to approach each person. Daniel wants
   the cost first." Tap _Deep_: "Everything, and every line says whether
   it's confirmed, observed or inferred."
3. **Relationship (0:50–1:05).** Tap Daniel. "When we last spoke, what's open
   in each direction, and the dated history between us."
4. **Capture (1:05–1:40).** Back on the meeting, **Capture this conversation** →
   _A voice note_ → **Start recording**, and say: "Quick note after the
   capacity review. I promised Daniel the revised budget case with the cost
   impact first by Friday. Maya agreed to move two engineers if utilization
   holds. Priya will update the risk register by Wednesday." **Stop** →
   **Understand it**.
5. **Remember (1:40–2:00).** _What happened_: "Two commitments and a decision,
   each with the words it came from. Nothing is remembered until I say so" —
   untick one to show it, tick it again — **Keep**. Back on Today, the new
   commitment to Daniel sits under Open loops. Tap it → **Done**. "It
   remembers what I promised, and it reminds me before the next meeting."

Optional: **Ask** → "What do I owe Daniel?" — the answer cites the record.

**Reset for the next demo:** Account › Sample record › **Remove sample
record**, then **Load sample people**. Removal also deletes what you captured
or prepared with the invented people, and never touches anything involving a
real person. Re-prepare the meeting before the next demo.

What not to claim: no calendar sync on the phone yet (it syncs on the web), no
push notifications, no offline mode, and the brief is only as good as the
record — say so if asked.
