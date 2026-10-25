# Atturel product audit — October 2026

The loop this audit measures against: **Prepare → Capture → Understand → Remember → Follow through → Prepare again.**

**Method**

- Read the web app (`src/`), the iOS app (`mobile/`) and the migrations.
- Read production analytics in Supabase (row counts and event names only; no content).
- Traced the iPhone Capture failure to its cause in code.

**Status words**

- "Implemented": exists and is reachable.
- "Partial": exists but is unreachable or incomplete.
- "Missing": not there at all.

Nothing here is a claim that something works on a device unless it says it was tested.

## Where things stand (resume here)

_Updated 25 October 2026._

- **Phase 1 (Capture): merged (PR #16, `9fb4714`) and shipped in TestFlight build 0.1.0 (3).**
  - The owner validated it on a physical iPhone (§1.3).
  - **One test is NOT VERIFIED:** whether an unsent recording survives an update from the previous TestFlight build. It is part of the next release validation (§1.4).
- **Phase 2 (Essential controls): plan and decisions approved 25 Oct 2026 (§5).**
  - **2A (people controls, server + web): approved by the owner on 25 Oct 2026 and merged (PR #18).** The owner's clarification on archived people in history and in briefs was verified and corrected before merging (§5, "2A results").
  - **2C + 2B (iOS): approved by the owner on 25 Oct 2026 and merged (PR #19, `bb9c006`).**
  - **TestFlight 0.1.0 (4)** was built from `bb9c006` and processed by Apple on 25 Oct 2026, for internal testing only. It was not submitted for App Store review.
    - The owner reports it installed. Four screens were seen; none of the §1.4 checks has passed yet (§1.5).
- **Merged on 25 Oct 2026, owner-approved, in this order. All live in production:**
  - **PR #20, doc-only audit (`df4d3e3`).** It records the Phase 4 photo decision (§4, item 6).
  - **PR #23, finding 8.7 (`25c3ba3`).** A proposal is never read, shown or pre-ticked as a decision (§2, "Finding 8.7").
  - **PR #21, iOS People search and public research (`9bef39a`).** Research holds every page until the user says it is them (§5).
  - **PR #22, website findings 5.7 and 5.8 (`01f0c67`).** A profile link starts nothing; "Not them" holds until Reconsider (§5, "Website follow-up").
  - **Production evidence (25 Oct):**
    - PR #21's research route answers 401 (sign-in required); before the merge it answered 404.
    - Signed in as QA account B, a page marked "not them" shows PR #22's "Reconsider this page".
    - Vercel's deployment list could not be read from the assistant's session (403).
  - **Tests on main:** web 1157/1157 and iPhone 97/97, with clean typechecks.
- **Finding 8.6 (calendar freshness): merged 25 Oct 2026 (PR #25, `ea84289`), owner-approved, and live** (§2, "Finding 8.6").
  - Every saved connection, on the website and the iPhone, shows the date and time it last synced, in the account's time zone. It is flagged after 24 hours, with a note that Atturel syncs only when Sync now is pressed.
  - The iPhone has its own Sync now. Temporary failures stay retryable; only a refused grant asks for a reconnect. Disconnect is offered in every saved state.
  - The one-minute limit holds when the website and the iPhone press at once.
  - No background sync and no sync-on-open (owner, 25 Oct 2026). No migration.
  - **Production evidence (read-only, QA account B, which has no calendar):** the iPhone Sync now route went from 404 to 401 within about a minute of the merge, and has no GET (405). An unknown provider gets 404. The account route returns the new calendar block, with the Settings link and no token fields. Settings renders with no console errors. Production calendar rows were unchanged afterwards.
  - The owner's Microsoft connection last synced on 27 Aug 2026. No production sync was run.
- **Finding 8.7's live AI check: passed, 5 of 5 (25 Oct 2026)** (§2, "Finding 8.7"). The device check is still pending.
- **TestFlight 0.1.0 (5)** was built from `ea84289` after the live check passed (GitHub run #15, EAS build `0e2f93c5`). Apple processed it as VALID on 25 Oct 2026 at 18:07 UTC. It is in internal testing only and was not submitted for App Store review.
  - It is the first build with People search and research, 8.7's "Proposed, not decided" label, and 8.6's Account calendar with Sync now.
  - **None of its real-device checks has run yet** (§1.4, items 1–8).
- **Pricing and the 14-day Pro trial: released.** PR #26 was merged on 25 Oct 2026 (`4295ac6`), owner-approved. The owner turned the trial offer on (`PRO_TRIAL_OFFER=on`) the same day, and both domains show it (§5, "Pricing and the Pro trial", "Release").
- **Pilot onboarding has started** (owner, 25 Oct 2026). The pilot guide is `docs/PILOT_ONBOARDING.md`. Further feature work follows customer evidence.
  - **PR #27 merged** on 25 Oct 2026 (`0b814fd`): the pricing page's trial button now reaches Settings › Plan for signed-in visitors. Verified on production on both domains (§5, "Release").
  - **Who first:** consultants and fractional leaders who manage recurring client relationships, on the standard offer (14-day Pro trial with no card, then $29 a month). No ongoing pilot access by default (owner, 25 Oct 2026).
  - **External TestFlight: prepared, not submitted.** Build 0.1.0 (5) is eligible, and no new build is needed (§5, "External TestFlight").
- **Pending, for the next available opportunity (owner approval where noted):**
  - **PR #21's simulator research steps** (§5, "Remaining simulator checks"). They wait until 1 Nov 2026, when the Expo minutes and QA account A's research credits reset; a paid Expo plan needs approval. Grace Hopper stays on QA account A for them.
  - **Real-device checks on build 0.1.0 (5):** the §1.4 checklist, which was not verified on build 4 (§1.5). Item 8 covers 8.7's typed notes, PR #21's search and research, and 8.6's Account calendar and Sync now.
  - **Finding 8.6's live provider check:** a manual Sync now on a real connection. Needs the owner's approval.
  - **Production billing uses the existing live Stripe account** (owner, 25 Oct 2026; no sandbox).
    - A live Checkout session opened from production confirms the live key and the $29 price.
    - Matching the webhook secret to the live endpoint awaits the first real event.
    - The live payment lifecycle rests on automated tests until genuine pilot purchases (§5, "Pricing and the Pro trial").
- Owner decisions on discovery, removal, billing, notifications, privacy, photos and pricing are recorded in §4, with the approved roadmap.
- **Atturel is not launch-ready.** Do not describe it as fully launch-ready until finding 8.7 is fixed and validated (owner, 25 Oct 2026). It is fixed and its live AI check passed; the device check on build 5 is pending.

---

## 1. Critical: Capture on iPhone (Phase 1, fixed in PR #16)

**Symptom.** Every "Understand it" on TestFlight said the phone was offline, with the "recording is safe" sentence twice.

**Root cause (confirmed in code and in production data)**

- Since Expo SDK 57, the app's global `fetch` is Expo's.
- Its FormData encoder throws `Unsupported FormDataPart implementation` on React Native's `{ uri, name, type }` file part, which is what the app sent.
- The request never left the phone. Production analytics show the owner's iPhone reaching every other API today, but not one transcription request.
- A catch-all turned the exception into "You are offline". It retried twice, and the screen appended the safety sentence again.

**Also found while tracing the pipeline**

- **A saved recording could be lost on update.** The unsent-recording note stored absolute file paths. iOS gives an updated app a new container folder, so after a TestFlight update `recover()` found no files and **cleared the recording silently**.
  - Fixed: files are now looked for under the current Documents folder.
  - Fixed: a part that is truly missing is now reported, not dropped.
- **Errors were not classified.** Failures said "offline" whatever the cause. They are now told apart by where they fail: file unreadable, timeout, no response, or a server refusal. Each carries a technical detail for testers.
- **No backoff and no timeout.** Retries now wait 2 s, then 6 s. Each attempt has a 4-minute limit.
- **A repeated save could create a duplicate conversation.** If the save succeeded on the server but its answer was lost (a dropped connection, or the app backgrounded while the conversation was being read), the phone kept the recording and "Try again" kept the conversation twice, with every proposal twice.
  - Fixed without a schema change: the mobile save first looks for the same words kept by the same user in the last 24 hours, and returns that conversation.
- **Privacy copy (owner decision 5).** The wording now separates the parties:
  - Atturel does not keep audio. Temporary parts are deleted after transcription.
  - OpenAI's published API policy, checked 24 Oct 2026: `/v1/audio/transcriptions` audio is not used for training and is not retained. Text sent to the language model may be kept up to 30 days for abuse monitoring.
  - No zero-retention claim is made on Atturel's behalf; the policy says Atturel relies on OpenAI's published policy.
  - Updated: privacy policy, the web recorder and debrief copy, and the iOS Capture line.

**What stays as it was**

- The web route, metering and the storage transport (`CAPTURE_STORAGE_ENABLED`, off in production).
- Background upload is not supported. Leaving the app during "Understand it" fails that attempt; the recording is kept and can be retried.

### 1.1 Validation results (24 Oct 2026)

**Automated**

- `mobile`: `tsc` is clean and `jest` passes 56/56.
- Root: `tsc` is clean, `vitest` passes 958/958, and `eslint` shows no new warnings.
- The regression test runs Expo's own encoder and reproduces the TestFlight failure with the old file shape.

**iOS simulator, against production.** EAS build `1caab901` (profile `simulator`, commit `4e5633a`), iPhone 17 simulator on iOS 26, signed in as a disposable QA account.

| #   | Scenario                                                                                            | Result                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Recording saved under an old app container that no longer exists, as after an update. App reopened. | Offered back on Today and Capture. The path was rewritten to the current container. **Pass**                                                                                                                                                                                    |
| A   | Understand it, then transcription, then Review                                                      | Review showed 2 commitments and 1 decision from the spoken audio. **Pass**                                                                                                                                                                                                      |
| A   | After the save                                                                                      | The phone's audio and pending note were deleted. **Pass**                                                                                                                                                                                                                       |
| A   | Keep 3                                                                                              | "Kept 2 loops and 1 decision". Today lists both open loops; in the database, 2 commitments are `confirmed`. **Pass**                                                                                                                                                            |
| B   | Server unreachable (host blocked), then Understand it                                               | After 3 attempts (2 s and 6 s pauses, about 10 s): "Atturel could not be reached. Check the connection. The recording is safe on this phone — try again, or discard it." The detail line is shown, the button reads "Try again", and audio and note are still on disk. **Pass** |
| B   | Real app update: reinstall over the top                                                             | The container changed (`6B1F…` to `9FEB…`). The recording was offered back and its path rewritten. **Pass**                                                                                                                                                                     |
| B   | Connection restored, then Understand it                                                             | Went straight to Review with 2 commitments, then "Kept 2 loops". **Pass**                                                                                                                                                                                                       |
| B   | Duplicate processing                                                                                | The server shows exactly one transcription, one conversation and its own commitments per recording. The blocked attempts never reached the server. **Pass**                                                                                                                     |
| C   | Recording file gone from the phone                                                                  | "An unsent recording could not be found on this phone, so it cannot be sent. Nothing was sent." Not silent. **Pass**                                                                                                                                                            |
| D   | Discard                                                                                             | Confirmation dialog, then audio and note deleted. **Pass**                                                                                                                                                                                                                      |
| E   | Live microphone                                                                                     | **Not testable**: the cloud Mac has no audio input ("The microphone could not start…"). Must be checked on the iPhone.                                                                                                                                                          |

**Server.** A synthesized m4a sent to `/api/conversations/transcribe` in the new multipart shape came back HTTP 200 in 3.2 s with a correct transcript.

**Repeat save, on the PR's Vercel preview (server code from this branch, production database).** The same typed conversation was posted twice with the QA token:

- First save: `201`, new conversation.
- Second save: `200`, **the same conversation ID**.
- The database holds one conversation and one set of commitments, and one `mobile_capture_repeat` event was recorded.

**Known minor issue (Phase 2).** When the microphone fails to start, expo-audio leaves an empty 28-byte file in `Documents/ExpoAudio`. It is never sent or shown.

### 1.2 Producing a TestFlight build

1. Merge the phase's PR into `main` once its checks are green. Merging redeploys the website; app changes ship only through TestFlight.
2. GitHub → Actions → **iOS TestFlight** → Run workflow on `main`, with build "TestFlight" and submit "true". EAS increments the build number; the workflow uploads to App Store Connect and waits until Apple has processed the build.
3. When it reports the build as available to internal testers, run the §1.4 checklist on the iPhone. Leave a recording unsent **before** updating.

Phase 1 shipped this way: PR #16 merged as `9fb4714` on 24 Oct 2026, workflow run #11, build **0.1.0 (3)**, processed and in internal testing at 23:18 UTC.

### 1.3 Physical iPhone validation (owner, build 0.1.0 (3), 25 Oct 2026)

| Check                                                                     | Result                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Live microphone recording                                                 | **Pass**                                                                   |
| Transcription (Understand it)                                             | **Pass**                                                                   |
| Offline error handling ("could not be reached", recording kept)           | **Pass**                                                                   |
| Retry after reconnecting                                                  | **Pass**                                                                   |
| Review of what was found, including decisions                             | **Pass** (but see finding 8.7)                                             |
| Saving (Keep)                                                             | **Pass**                                                                   |
| Relationship-memory integration                                           | **Pass**                                                                   |
| The latest conversation appears exactly once in the person's timeline     | **Pass**                                                                   |
| An unsent recording survives an update from the previous TestFlight build | **NOT VERIFIED**: could not be confirmed on the device. Carried into §1.4. |

The simulator test of a real reinstall-over-the-top update passed (§1.1, scenario B). It is not a substitute for the device check.

### 1.4 Release validation checklist (every TestFlight build)

**Every item is a real-device check.** It passes only on a physical iPhone running the TestFlight build. A simulator run does not count. Carry each item forward until it has passed.

1. **Real device: an unsent recording survives an update.** NOT VERIFIED.
   - On the build installed now, record a short test and leave it unsent. Close the app.
   - Update to the new build through TestFlight. **Do not delete or reinstall the app.**
   - Open the app. Today and Capture offer the recording back.
   - Send it with Understand it. It is sent once, then opens in Review, where it can be reviewed and kept.
2. **Real device: live recording, a real photo, and export.**
   - Record about 30 seconds, then Understand it, Review, Keep. The commitments appear on Today and in the person's timeline, once.
   - On a person's page, add a photo from the real photo library through the system picker. There is no permission prompt, and the photo appears.
   - Account › Privacy and data › Export my data. The iOS share sheet offers the JSON file, and Save to Files works.
3. **Real device: Ask opened with a prefilled question.**
   - On a person's page, tap **Ask**. The question "What should I know about …?" is filled in, and asking it gives an answer.
   - A later visit from the Ask tab starts with an empty field.
4. **Real device: Open Settings, and microphone access restored.**
   - Turn microphone access off (Settings › Atturel › Microphone).
   - In Capture, Start recording shows "Microphone access is off". **Open Settings** lands on Atturel's own page, not Settings' main page. On the simulator it opened the main page.
   - Turn Microphone back on and return to Atturel. Start recording now records.
5. **Real device: offline.** Airplane mode, then Understand it: "could not be reached", and the recording is kept. Back online, Try again sends it once.
6. Any checks added by the phase being shipped.
7. **Real device, once PR #21 ships: search and public research.** In build 0.1.0 (5).
   - Search finds someone saved by name, role or company; nobody else's people and no archived people appear. Offline, the phone's matches stay, and the screen says so.
   - Research public footprint: opening the screen does not search. The button does. Each page shows why, where the name appears, and what it would add.
   - "This is them" adds the page's facts. "Not them" removes the page, and it is not offered again. Open page opens the browser.
8. **Real device, build 0.1.0 (5): findings 8.7 and 8.6.**
   - **8.7:** in Capture, type notes that contain "We decided to move the launch to March." and "I'd suggest we go with vendor B." In Review, the first is a decision, ticked. The second, if it is listed, reads "Proposed, not decided" and is not ticked. Keep with the defaults: only the first becomes a decision.
   - **8.6:** Account shows the Microsoft connection as "Connected", capitalised, with "Last synced Aug 27, 9:43 PM" and the note that it has not synced since. Pressing Sync now syncs it, or says plainly why not. Reconnect, if offered, opens the website. This is the owner's real connection, so pressing Sync now is the owner's call.
   - **Plan line:** Account shows the plan as before, "Full access" on the owner's account.

### 1.5 Build 0.1.0 (4) on the owner's iPhone (25 Oct 2026)

**Source:** the owner's report of their iPhone screenshots, and their explicit test results. The screenshots did not reach the assistant's session. TestFlight feedback cannot be read without an App Store Connect key on the Expo account. So "Seen" means the owner reports the screen was shown; it does not mean the checks on that screen passed.

| Check                                                        | Status                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Build 0.1.0 (4) installed                                    | **Verified** (owner)                                                                            |
| Account and profile screen                                   | **Seen** (owner)                                                                                |
| Person management controls                                   | **Seen** (owner). Not yet exercised on the device                                               |
| Capture Review screen                                        | **Seen** (owner). Its example said "we decided", and was correctly read as a decision (§2, 8.7) |
| Calendar status "last synced 27 Aug 2026"                    | **Seen** (owner). The date is accurate; nothing has synced since (finding 8.6, PR #25)          |
| 1. An unsent recording survives an update                    | **NOT VERIFIED**                                                                                |
| 2. Live recording, end to end                                | **NOT VERIFIED**. A Review screen was seen, but the full flow was not confirmed                 |
| 2. A real photo through the picker                           | **NOT VERIFIED**                                                                                |
| 2. Export through the share sheet                            | **NOT VERIFIED**                                                                                |
| 3. Ask opened with a prefilled question                      | **NOT VERIFIED**                                                                                |
| 4. Open Settings reaches Atturel's page; microphone restored | **NOT VERIFIED**                                                                                |
| 5. Offline, then Try again                                   | **NOT VERIFIED** on build 4 (passed on build 3, §1.3)                                           |

**Update test:** if build 4 replaced build 3 before an unsent recording was made on build 3, check 1 cannot be run on this update. It then moves to the next update, from build 4 to the next build, following the same steps.

---

## 2. Findings by area

Severity: **P0** breaks the core loop or risks data; **P1** blocks an essential control; **P2** quality, consistency or trust.

### People and profiles

| #   | Finding                                                                                                                                                                                                                                                                                      | Status      | Sev      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| 2.1 | Edit person (web): name, preferred name, title, organisation, email, profile URL, relationship type, relevance, notes. Not editable: pronouns, time zone.                                                                                                                                    | Implemented | —        |
| 2.2 | **Remove a person: no UI on either platform.** `archivePerson` and `deletePerson` exist, but nothing calls them. A hard delete would cascade away that person's loops (`commitments.person_id ON DELETE CASCADE`), observations, notes and facts.                                            | Partial     | P1       |
| 2.3 | **Duplicate warning on create does nothing visible.** `createPersonCore` finds a same-name person, records it in analytics, and creates the duplicate anyway. That lookup filters by `workspace_id`, while everything else filters by `user_id`. Merge review exists on the web People page. | Partial     | P1       |
| 2.4 | Person photo, web: upload, replace and remove (private `avatars` bucket, 2 MB, JPEG/PNG/WebP), plus suggested public photos with confirm or reject.                                                                                                                                          | Implemented | —        |
| 2.5 | iOS person: read-only. No edit, photo, remove, research or memory review. Cannot add a person from the People tab. **2B added edit, photo, remove and add; PR #21 adds public research with review. Memory review on iOS is still missing (8.2).**                                           | Partial     | P1       |
| 2.6 | Provenance is modelled well: user-entered fields; researched `professional_facts` with sources and evidence level; confirmed, observed, inferred or unknown labels; `identity_locked`.                                                                                                       | Implemented | —        |
| 2.7 | **Own photo: missing.** `profiles.avatar_url` and `avatar_path` exist, but nothing reads or writes them. No bio field.                                                                                                                                                                       | Missing     | P1       |
| 2.8 | Own profile, web: name, preferred name, title, company, pronouns, time zone. **iOS: set once at onboarding, never editable, including time zone,** which every date calculation uses.                                                                                                        | Partial     | P1       |
| 2.9 | Member discovery: no directory, public profile or search columns. `record_visibility` (private/shared) and workspaces exist but are not exposed.                                                                                                                                             | Missing     | Decision |

### Account and settings

| #   | Finding                                                                                                                                                                                                                                            | Status      | Sev           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------- |
| 3.1 | Web Settings has Profile, Appearance & voice (includes email notifications), Interaction Profile, Capabilities (calendar), Plan (Stripe checkout and portal, access codes) and Privacy & data (export, sample data, delete account).               | Implemented | —             |
| 3.2 | iOS Account has name, email, plan label, invitation code, sample data, sign out, delete account, and legal and support links. Missing: profile edit, notifications, calendar, data export, privacy counts. Keyboard covers the inputs. No refresh. | Partial     | P1            |
| 3.3 | No push notifications on iOS.                                                                                                                                                                                                                      | Missing     | P2 (decision) |
| 3.4 | The follow-through hour setting is ignored, because the cron runs once a day at 13:00 UTC.                                                                                                                                                         | Broken      | P2            |

### Onboarding and first value

| #   | Finding                                                                                                                                                                                                                                                                                                                                                | Status         | Sev |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --- |
| 4.1 | Commit f75d2ac (18 Oct) already shortened onboarding and fixed the missing written summary. **If the walkthrough ran on an older deploy, that is where those symptoms came from.** Still open: the summary is written in `after()` with two 45-second model calls and no `maxDuration`, so it can be cut off and show "appears once composed" forever. | Partial        | P1  |
| 4.2 | **Six answers presented as a profile.** One answer gives a 67/33 "lean". A 6xl archetype heading ("The Direct Decisive"). Certainty is computed but `RevealView` drops it. The narrative is blind to confidence, and scores like "67/100" go into the prompt.                                                                                          | Broken (trust) | P1  |
| 4.3 | Full name is asked at sign-up and again in onboarding.                                                                                                                                                                                                                                                                                                 | P2             | P2  |
| 4.4 | Calendar feels mandatory: "Connect Microsoft 365" leads and "Create a meeting manually" is a ghost button. After connecting, the notice counts 14 days of events, but Today lists only through tomorrow. No next-step button.                                                                                                                          | Partial        | P1  |
| 4.5 | **Duplicate welcome.** The welcome email goes out at sign-up, alongside the confirmation email. Today shows the WelcomeBanner directly above the "Getting started" panel.                                                                                                                                                                              | Broken         | P2  |
| 4.6 | Auth emails: only `confirm-signup.html` exists, applied by hand. **Reset-password email is Supabase's unbranded default.**                                                                                                                                                                                                                             | Partial        | P2  |
| 4.7 | Two templates are never sent: `meetingReminderEmail` and `weeklySummaryEmail`.                                                                                                                                                                                                                                                                         | Unused         | P2  |

### Public research and identity

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status         | Sev |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --- |
| 5.1 | **The refusal to link unverified identity is correct, and stays.** A name with no company cannot auto-link (0.28 < 0.55).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Implemented    | —   |
| 5.2 | Recovery asks for org, title or URL and offers a pasted link. It **never shows which candidates were rejected or why.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Partial        | P1  |
| 5.3 | **Confirming an uncertain source extracts no facts.** It shows "No facts rest on this". **PR #21:** a page held by the app's research carries what it would add, so confirming it adds those facts, on the web or the phone. A page the web's research was unsure of still adds nothing on confirm.                                                                                                                                                                                                                                                                                                                                                                         | Partial        | P1  |
| 5.4 | The publisher label is heuristic. A loose JSON-LD match can name a host or platform instead of the original publisher. No code labels a source with the search provider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Partial        | P2  |
| 5.5 | **Placeholder URLs look real.** `add-context.tsx` builds `https://acme.com/leadership/<real person's name>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Broken (trust) | P1  |
| 5.6 | Each refine re-runs research and counts against the quota again. People actions have no `maxDuration`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P2             | P2  |
| 5.7 | **Web: entering a profile link starts research by itself.** After adding a person with a profile link, their page opens with `?research=1` and research runs on arrival (`autoStart`). That page is then linked as a confirmed match ("You provided this directly"), and its facts are added without review. This conflicts with the owner's rule of 25 Oct 2026: entering details must not silently start research or treat unverified information as confirmed. The phone does neither. **Owner decision:** remove `autoStart` on the web and hold the typed link's page for review, as the app does. **Fixed in PR #22** (§5, "Website follow-up"), merged as `01f0c67`. | Fixed          | P1  |
| 5.8 | **Web research can re-link a page the user marked "not them"** when the page's content has changed: its fresh path writes the identity status again. The app's held research checks the user's earlier decision first. Fix: the same check on the web path. **Fixed in PR #22**, merged as `01f0c67`: "Not them" holds until the user chooses Reconsider.                                                                                                                                                                                                                                                                                                                   | Fixed          | P1  |

### Prepare (brief engine)

| #   | Finding                                                                                                                                                                    | Status           | Sev |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --- |
| 6.1 | Glance, Quick and Deep are three views of one stored brief.                                                                                                                | Implemented      | —   |
| 6.2 | **The schema forces generic advice.** Required arrays, `recommendedApproach.min(2)`, and a padding loop in the fallback composer. The objective is echoed in 4–5 sections. | Broken (quality) | P1  |
| 6.3 | A silent fallback to the template composer is not shown on Glance or Quick.                                                                                                | P2               | P2  |
| 6.4 | Facts and recommendations are separated in the schema, but top-level recommendations carry no basis.                                                                       | Partial          | P2  |
| 6.5 | No path from brief to Capture on the web brief page. iOS has one.                                                                                                          | Partial          | P2  |

### Ask

| #   | Finding                                                                                                                                                                            | Status      | Sev |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- |
| 7.1 | Answers from the user's records with citations, on both platforms.                                                                                                                 | Implemented | —   |
| 7.2 | **The model path never returns next actions** (`followUps: []`, `actions: []`). An empty commitments answer has no action. Proposals awaiting review are excluded without mention. | Partial     | P1  |

### The loop (Capture → Review → Memory → Commitments → Today)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status                                             | Sev |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --- |
| 8.1 | Proposals are created as `proposed`. Review confirms or rejects them, and only confirmed items are active. Memory is never written without approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Implemented                                        | —   |
| 8.2 | **iOS Review is keep-or-reject only**: no editing a loop's text or date. It says memory proposals "wait on each person's page", but the iOS person page cannot show or confirm them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Partial                                            | P1  |
| 8.3 | **A confirmed loop cannot be edited** on either platform. Reopen exists on web only. Create a loop exists on web only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Partial                                            | P1  |
| 8.4 | Dead actions: `addCommitment`, `completeCommitment`, `reopenCommitment`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Unused                                             | P2  |
| 8.5 | **Web and iOS Today disagree for the same account.** They differ in meeting window, countdown threshold, number of loops and ranking, and which conversations count as awaiting review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Inconsistent                                       | P2  |
| 8.6 | **Calendar never syncs in the background.** There is no cron; it syncs only on connect and on the web's "Sync now". The iPhone has no sync control. **Seen on the owner's account (25 Oct 2026):**<br>• The iPhone Account screen shows "last synced 27 Aug 2026". That is accurate: the Microsoft connection synced successfully twice, at 9:40 and 9:43 PM Chicago time on 27 Aug, minutes after it was connected.<br>• Nothing has synced since: no sync events and no later imports (one event, 29 Aug).<br>• The status still reads connected, so two months without new meetings looks healthy. The stored access token expired an hour after connecting. A refresh token renews it at the next sync, unless Microsoft has retired it after a long unused period, in which case a reconnect is needed.<br>• A second account connected on 18 Oct has never synced: it connected before the sync-at-connect code (`f75d2ac`) was deployed, and that user has not pressed "Sync now".<br>• **Related iPhone bug (2B):** the Account screen checks for status `'active'`, but the stored values are `connected`, `expired`, `revoked`, `error` and `admin_consent_required`. So it shows lowercase "connected".<br>**Owner decision (25 Oct 2026):** no background sync and no sync-on-open. **Merged in PR #25** (below, "Finding 8.6"): the date and time of the last sync on both platforms, a stale flag after 24 hours, Sync now on the iPhone, retryable failures, Disconnect in every state, and a one-minute limit that holds across devices. | Fixed and live; device and provider checks pending | P1  |
| 8.7 | **A proposed action is sometimes read as a confirmed decision.** Reported by the owner on build 3 (24–25 Oct 2026). The build 4 Review example is **not** evidence of this: its transcript says "we decided", so reading it as a decision was correct. A reproducible case exists in the fallback composer, which wrote 4 of the 9 conversation analyses in the week of 19 Oct. Detail, editing and the acceptance test are below. **Fixed in PR #23**; live AI check passed 5/5 (25 Oct).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Fixed; device check pending                        | P1  |

#### Finding 8.7: what the code does, and the acceptance test

**What is pre-selected.** The website and iPhone Review screens both pre-tick a decision only when its confidence is at least 0.7 (`LOOP_PRESELECT_THRESHOLD`). The earlier note that every proposal is pre-ticked was wrong. The risk is a proposal arriving with 0.7 or more:

- **Fallback composer**, used when the model is off or fails (`composeConversation` in `src/lib/ai/prompts/conversation.ts`). It gives every decision-cue sentence exactly 0.7. A probe on 25 Oct 2026 showed:
  - "We decided to move the launch to March." → decision, 0.7 (correct).
  - "I'd suggest going with vendor B." → decision, 0.7, **pre-ticked** (wrong). The phrase "going with" matches, and "suggest" is not treated as hedging.
  - "Ravi recommended going with vendor B." → decision, 0.7, **pre-ticked** (wrong).
  - "We could…", "Let's consider…", "Maybe…", "My proposal is…": not decisions (correct). "How about…?" becomes an open question at 0.6.
- **Model path:** the prompt says "Not a proposal, not a preference", but nothing checks the model's confidence against the words.

**Can extracted decisions be edited?**

- **Website Review:** the decision's text can be edited before keeping, and it can be ticked or not.
- **iPhone Review:** keep or set aside only. Its text cannot be edited, and no confidence label is shown.
- **Neither platform** can re-file a decision as a loop or an open question.
- **After it is kept,** a decision cannot be edited or deleted anywhere; Review is the only writer.

**Acceptance test (Phase 3).** Fixture: one conversation, typed and as a transcript, containing:

- **(A)** a clear decision: "We decided to move the launch to March."
- **(B)** a tentative proposal: "I'd suggest we go with vendor B."
- Proposal variants: "Ravi recommended going with vendor B", "We could go with vendor B", "Let's consider moving to vendor B", "How about we go with vendor B?".

**Expected results:**

1. **Extraction, both paths:**
   - (A) is a decision.
   - (B) and every variant is never a decision at 0.7 or above. It is either not a decision, or an open question ("Decide whether to go with vendor B"), or a decision below 0.7, labelled as proposed.
2. **Review, website and iPhone:**
   - (A) may be pre-ticked.
   - (B) is never pre-ticked, and never shown as decided or confirmed.
3. **Keep with the defaults:** only (A) becomes a confirmed decision.
4. **Editing:**
   - On the website, (A)'s text can be edited before keeping, and the edit is saved.
   - The iPhone gains the same edit (finding 8.2), and both platforms can set a proposal aside or re-file it as an open question.

**How it is tested:**

- **Unit tests, deterministic:** the composer cases above, the confidence cap, and the `likely` flag on the iPhone review route.
- **A small live model check before merging:** the fixture, five runs. It passes when (B) never comes back as a decision at 0.7 or above and (A) always does.
- **One device check on the next TestFlight build:** typed notes with (A) and (B).

**Fix direction:**

- Treat "suggest", "recommend", "propose", "how about", "what if" and "should we" as hedging.
- Cap any decision whose excerpt lacks settling words below 0.7, on both paths.
- Label such an item "Proposed, not decided".

**Fix merged (PR #23, `25c3ba3`, 25 Oct 2026) and live.** It is not yet validated by the live AI check or on a device.

- **One reading of the words** (`src/lib/conversations/decisions.ts`), used on both extraction paths and again whenever Review shows a decision:
  - **decided:** settling words ("decided", "agreed to", "we're going with", "it's settled") with nothing hedging them.
    - "As Ravi recommended" after "we decided" is history, not a hedge.
    - A reason given after the settling words is not a hedge either: "we agreed to go with vendor B because it could scale" was agreed.
    - A proposal word anywhere still makes it a proposal: "we agreed, so maybe we should go with vendor B".
  - **proposed:** a suggestion, recommendation, proposal, preference, hypothetical, condition, hedge, open question or unsettled outcome ("we haven't decided"). When the words carry both, proposed wins.
  - **unmarked:** neither. It keeps the confidence it was read with, as before.
- **Extraction:**
  - The fallback composer gives a proposal 0.5 and never makes one the conversation's outcome.
  - Both paths cap a proposal at 0.5 before it is written, whatever confidence it arrived with. It stays above the 0.4 floor, so it is still offered.
  - The model's instruction now says a proposal is not a decision, with the audit's examples (prompt `conversation@2.1.0`).
- **Review:**
  - On the web and the iPhone, a proposal says "Proposed, not decided", never "Likely", and starts unticked. The user can still keep it.
  - The reading is done again at display time, so proposals written before the fix (at the old composer's 0.7) also start unticked.
  - The iPhone route adds `proposed` and computes `likely` the same way, so TestFlight 0.1.0 (4) also leaves them unticked.
- **Tests:**
  - The test conversation, typed and as a transcript, through the composer.
  - A simulated model answer that calls every variant a 0.9 decision.
  - The phone's review route and the web's review action, end to end: keeping the defaults confirms only (A).
  - The web Review component, and the iPhone Review screen.
- **Live model check: passed, 5 of 5 (25 Oct 2026, production, QA account B).**
  - Five typed-notes conversations through the iPhone's own route, each with (A) "We decided to move the launch to March." and the six proposal variants above. They are titled "QA 8.7 live check 1/5" to "5/5" and remain on QA account B.
  - Model `gpt-4.1-mini`, prompt `conversation@2.1.0`.
  - **Every run:** (A) came back as the only decision, at 0.9, marked likely and not proposed. No proposal came back as a decision at any confidence.
  - **Observed:** the model did not list the proposals at all, neither as proposed decisions nor as open loops. So the live check confirms that nothing is wrongly decided. It does not show "Proposed, not decided" on the model path; the composer path and the stored-proposal path are covered by tests.
  - All five decisions were left pending review; nothing was kept.
- **Still to do:**
  - The device check on build 0.1.0 (5) (§1.4, item 8).
  - Editing and re-filing decisions on the iPhone (8.2), kept out of this PR.

#### Finding 8.6: what changed, and what remains

_Merged 25 Oct 2026 (PR #25, `ea84289`), owner-approved, and live in production. On the iPhone in TestFlight 0.1.0 (5); its device check is pending (§1.4, item 8)._

**Owner decision (25 Oct 2026):** there is no background sync and no sync-on-open. A calendar syncs when it is connected and when the user presses Sync now.

- **What the user sees, on the website (Settings › Capabilities) and the iPhone (Account):**
  - Every saved connection shows "Last synced Aug 27, 9:43 PM": the date and time, in the account's time zone. The same words appear on both platforms, from one helper (`src/lib/calendar/freshness.ts`) worked out on the server. A connection with no sync reads "Never synced".
  - After 24 hours, or with no sync at all, a caution note appears: "Not synced since Aug 27. Atturel syncs your calendar only when you press Sync now, so meetings added or changed since then are missing."
  - The states are Connected, Sync failed ("There is no need to reconnect"), Reconnect needed (expired or revoked), Needs approval, Pro and Unavailable.
  - **Website:**
    - Sync now, which reads "Try again" after a failure.
    - Reconnect only for an expired or revoked grant, or one waiting on administrator approval.
    - Disconnect in every saved state, including a plan that no longer includes calendars. Before, a connection that needed attention could not be disconnected without reconnecting it first.
    - A saved connection that is not working is shown to every account, in its own "Needs attention" section at the top of Settings › Capabilities. Before, customer accounts (every account but the owner's) saw the Calendar card only while a connection was fully connected. So a failed or expired connection disappeared from their Settings, with no way there to retry, reconnect or disconnect it. It stays listed, with Disconnect, even on a deployment that no longer configures any calendar provider.
  - **iPhone:**
    - Sync now or Try again, through `POST /api/mobile/calendar/:provider/sync`, which runs the website's own action.
    - "Reconnect at atturel.com" opens the website. Reconnect and Disconnect stay on the website.
    - The lowercase "connected" bug is fixed.
- **Only a refused grant needs reconnecting:**
  - **At the token endpoint:**
    - `invalid_grant` or `interaction_required` means reconnect, stored as `expired`.
    - Everything else is stored as `error`, which offers Try again: 429 (rate limited), 5xx or a network failure (unavailable), and anything that is our fault, such as an expired client secret.
  - **When reading the calendar:** 401 is `revoked`, admin consent stays its own state, and everything else is `error`.
  - **Before:** every refresh failure except admin consent was stored as `expired`, so a Microsoft outage told the user to reconnect.
- **The one-minute limit holds across devices:**
  - One conditional UPDATE stamps `last_sync_attempt_at` only when the last attempt is over a minute old. Postgres's row lock means the second of two simultaneous requests matches nothing.
  - It used to read, then write. A test of five simultaneous presses made five provider calls against the old check, and makes one now.
  - Inside the minute, the message says what happened: "Synced moments ago", "The last attempt, moments ago, did not complete" or "A sync is already running". It never says "Already up to date" after a failure.
  - **No migration:** the column and the row-level update policy already exist. The filter syntax was checked against production PostgREST with a read-only request that matched no rows (25 Oct).
- **Privacy is unchanged:**
  - Read-only scopes and the 14-day window.
  - Private events stay redacted.
  - Tokens never leave the server. The iPhone's answers are built from four columns (provider, status, account email, last sync). Tests confirm no token appears even when the row returned holds one.
  - Logs carry the HTTP status and the OAuth error code only.
- **Tests:**
  - **Web: 1260/1260.** The new tests cover freshness and time zones, provider refresh failures, sync and Sync now (including simultaneous presses), the iPhone routes, the Settings component, and the Settings page as a customer sees it (failed, expired, and with no provider configured).
  - **iPhone: 108/108**, 11 of them new.
  - Typechecks are clean on both. ESLint reports 0 errors. Prettier is clean on the changed web files.
- **Checked on the Vercel preview (25 Oct), signed in as QA account B, which has no calendar.** QA B's lack of a connection was confirmed read-only first, so nothing could sync.
  - **API, 8/8:**
    - Sync without a sign-in token is 401, and the route has no GET.
    - Account returns the calendar block with the Settings link, no connections, and no token fields.
    - An unknown provider is 404, and a press with no connection is 404 before anything runs.
  - **Settings › Capabilities** renders with no console errors. As designed, a customer with no connection sees no Calendar card.
- **Seen, not fixed here (pre-existing):** a customer can connect a calendar only from Today's first-run panel or the empty Meetings page, never from Settings. Once both are past, there is nowhere obvious to connect one.
- **Not verified (each needs the owner's approval):**
  - **No sync was run on any production account.** Whether the owner's Microsoft refresh token still works is unknown. Microsoft retires an unused one after about 90 days, so around 26 Nov 2026. A manual Sync now before then would confirm it and keep it alive; that is the owner's call.
  - **Real Microsoft and Google failure responses** have only been exercised against stubs.
  - **The iPhone screen is in build 0.1.0 (5)**, which has not yet been checked on a device. Build 4 ignores the new fields and still shows the lowercase status.
  - **The connected and failed states on the website** are covered by tests only. No QA account has a calendar connected.

### iOS quality

| #   | Finding                                                                                                                                                                                                         | Status      | Sev |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- |
| 9.1 | **A failed silent refresh replaces loaded content with "You are offline"** on Today, Person, Meeting, Atlas, Review and Account (`useApi` keeps data but sets error, and the screens check `error \|\| !data`). | Broken      | P1  |
| 9.2 | Ask reads `?q` only on first mount. Capture keeps a stale `meetingId` from an earlier visit. "Add people" lets the same person be added twice.                                                                  | Broken      | P2  |
| 9.3 | Keyboard covers inputs in Account, Capture notes and Add people. The shared `Screen` lacks `automaticallyAdjustKeyboardInsets`.                                                                                 | Broken      | P2  |
| 9.4 | Microphone denied: no button to open Settings.                                                                                                                                                                  | P2          | P2  |
| 9.5 | Error boundaries on every route; the crash fix shipped in PR #15.                                                                                                                                               | Implemented | —   |

---

## 3. Execution plan

Each phase ships as its own PR. Nothing reaches production until it is merged to `main`; a merge redeploys the website. Mobile changes reach the iPhone only through a TestFlight build.

**Phase 1 — Reliability (Capture).** PR #16. Root cause and fix as in §1, with regression tests that run Expo's own encoder. Validation:

- iOS simulator against production with a disposable QA account.
- Then TestFlight on the owner's iPhone.

**Phase 2 — Essential controls.** No schema change needed.

- Person: remove (archive by default, with an explicit, explained permanent delete).
- Person: a visible duplicate warning on create, using the `user_id` filter.
- Person: edit pronouns and time zone.
- iOS: edit person, add person, photo add/replace/remove (needs `expo-image-picker`).
- Own profile photo (reuse `avatars/<uid>/`, `profiles.avatar_path`) on web and iOS.
- iOS profile edit, including time zone.
- iOS Account sections: profile, privacy & data with export, notifications (email preferences), calendar status, plan read-only, help.
- Fix 9.1–9.4.

**Phase 3 — Connected experience.** Includes the product-intelligence fix for finding 8.7 (a proposal read as a decision).

- Onboarding: honest "early read" (4.2), summary written reliably (4.1), name asked once (4.3).
- Calendar: equal-weight manual path, consistent horizon, next-step button (4.4).
- Email: welcome sent at confirmation; one welcome surface; a reset-password template file (4.5, 4.6).
- Research: show rejected candidates and why; confirming extracts facts; plainly fake placeholders; publisher from the page's own host (5.2–5.5).
- Prepare: no forced padding; objective once; "composed from your records" shown; a path from brief to Capture (6.2, 6.3, 6.5).
- Ask: next actions on every answer; empty answers lead to an action; mention pending reviews (7.2).
- Loop: edit confirmed loops; reopen and create on iOS; iOS memory review; one shared definition of Today for web and iOS (8.2, 8.3, 8.5).

**Phase 4 — Member discovery.** Deferred by owner decision (§4.1). When resumed: behind a feature flag, with an additive migration.

**Phase 5 — Validation.**

- Playwright end to end on the web against a QA account.
- iOS simulator flows.
- Regression suites, plus a security review of every new route (RLS, bearer routes, nothing private reachable through search).
- A TestFlight build and a report per phase.

---

## 4. Owner decisions (24 October 2026)

1. **Member discovery: deferred** until the core product is reliable.
   - Keep the direction: opt-in, user-controlled professional profiles with photographs and per-field privacy settings.
   - Eventually support controlled discovery beyond exact-email lookup. **Do not build any of it now.**
2. **Removing a person: reversible archive by default.**
   - Provide restore.
   - Provide a separately confirmed permanent delete that states plainly what happens to the associated records (loops, observations, notes, facts, meeting attendance, conversation participation).
3. **iOS billing: show current plan and access only.** No purchasing and no external payment links without first reviewing the applicable App Store requirements. **How subscriptions are offered in a public App Store build is explicitly unresolved** (owner, 25 Oct 2026).
4. **Push notifications: deferred** until commitments and follow-through work reliably.
5. **Privacy: done in PR #16.** The wording distinguishes Atturel's handling from the transcription provider's, with no zero-retention claim unless contractually and technically verified.

6. **Photos and member discovery (owner, 25 Oct 2026; Phase 4, nothing changes now).**
   - An account holder's own photo may appear on their member profile once they opt into discoverability.
   - Photos uploaded under the current promise ("Your photo is shown only to you, in Atturel. It is not part of any public profile.") stay private until that person opts in.
   - Photos attached to private People records stay private to the owner, and are never shared with the pictured person or anyone else.
   - No discovery or photo-sharing behaviour changes in Phase 2 or 3. The current wording stays accurate until discovery ships; it changes then.

7. **Pricing (owner, 25 Oct 2026).**
   - Two plans: Free, and Pro at $29 a month. Pro is positioned around preparation, relationship memory and follow-through.
   - Free keeps five active people, with enough access to experience the core flow. Allowances are unchanged.
   - A 14-day Pro trial with no card, once per account. The account returns to Free unless the user explicitly subscribes, and its data is kept.
   - Paid pilots start on monthly billing. **$290 a year is approved for later**, after retention is observed. Annual billing is not offered now.
   - Privacy, evidence labels, correction controls and data export stay available on every plan.
   - Only shipped capabilities are advertised. The Teams offer is removed from the pricing page.
   - **App Store subscription handling is explicitly unresolved** (item 3).
   - Audit updates go in the next implementation PR; there is no doc-only PR.

8. **Approved roadmap (owner, 25 Oct 2026).** These do not block pilot recruitment.
   1. Actionable follow-through for approved commitments.
   2. "Since you last spoke" context in meeting preparation.
   3. A quick conversation debrief using the existing Capture.
   4. Thoughtful reconnect suggestions, at a frequency the user chooses.
   5. Selective contact import, and adding existing context.
   6. Editable, selectively shared conversation recaps.

Still open (no decision needed yet):

- **Auth email templates.** These are applied by hand in the Supabase dashboard. Phase 3 will add the files; the owner pastes them in.
- **Idempotency.** The repeat-save check compares stored text. A dedicated idempotency key (an additive migration: `client_capture_id` with a unique index) would be stronger, and needs approval before any migration.

## 5. Remaining work, in order

**Phase 2 — Essential controls.** Plan for approval. Phase 1 was confirmed on the iPhone on 25 Oct 2026.

Principles:

- Reuse the existing actions and tables. The web server actions become thin wrappers around shared "core" functions, the way `createPersonCore` already works, so web and iOS run the same code.
- No schema change and no new paid service.
- Every new mobile route is bearer-only, filters by `user_id`, and runs under RLS.

**2A — People controls: server and web (one PR, mergeable on its own)**

1. **Remove = archive.** The person page gets "Remove from people", with a confirmation, using the existing `archivePerson` and `archived_at`. The People page gets an "Archived (n)" view with **Restore**.
2. **Archive must mean archived everywhere.** Of the files that read `people`, about 16 ignore `archived_at` today. Among them:
   - global search (`search-action.ts`)
   - Today
   - follow-through emails (`follow-through/send.ts`)
   - conversation name matching (`conversations/process.ts`, `attribution.ts`), which would link a new conversation to an archived person
   - meeting attendee pickers, loops

   Rule for each call site:
   - **Excluded:** lists, search, pickers, suggestions, name matching, Atlas, brief and Ask context, follow-through.
   - **Kept, labelled "archived":** past conversations and meetings.
   - Archived people already do not count toward the Free plan's people limit (`checkPersonLimit`).

3. **Permanent delete.** Only from the Archived view, behind a second, separate confirmation. The confirmation lists what goes:
   - N observations and notes, N researched facts and sources, the photo;
   - N meetings attended and N conversations they appear in (those meetings and conversations stay; only this person's place in them is removed);
   - N open loops: see decision D1.

   An analytics event records the deletion, without names.

4. **Duplicate warning on create** (web and iOS). "You already have Dana Whitfield (Northwind)" with **Open existing** and **Add anyway**. If the match is archived, offer **Restore**. The lookup moves to `user_id` and also checks email and profile URL.
5. **Person form:** add pronouns and time zone (the columns exist).
6. **Own profile photo on the web** (Settings › Profile). Upload, replace or remove at `avatars/<uid>/profile.<ext>`; the existing bucket policy already covers the user's folder. Stored in `profiles.avatar_path` and shown only to the user, since discovery is deferred.
7. **Mobile API (additive)**, reusing the cores:
   - `PATCH /api/mobile/people/[id]`
   - `POST /api/mobile/people/[id]/archive` and `/restore`
   - `DELETE /api/mobile/people/[id]` (needs an explicit confirmation field)
   - `GET /api/mobile/people?archived=1`
   - `POST|DELETE /api/mobile/people/[id]/photo`
   - `PATCH /api/mobile/me`
   - `POST|DELETE /api/mobile/me/photo`
   - `GET /api/mobile/export`
   - `GET|PATCH /api/mobile/preferences` (email notifications)
   - calendar status added to `GET /api/mobile/account`
   - The duplicate warning on `POST /api/mobile/people`.

**2A results (PR #18, branch `ios-testflight-readiness`, 25 Oct 2026). Not merged; awaiting owner review.**

Built as planned, plus one fix found during preview testing (below). No migration and no new service. The mobile routes are additive, so TestFlight 0.1.0 (3) behaves as before.

Automated checks:

- 993 web tests pass (81 files). New: the lifecycle rules (14), the mobile people routes, and the select-reset tests.
- Typecheck clean. Lint: 0 errors (5 warnings, all in files this PR does not touch).

Preview checks (Vercel preview against the production database, QA accounts A and B only):

| Check                                                                                                                                            | Result                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup: people, meetings, conversations, loops, facts, sources                                                                                    | 9/9                                                                                                                                                                      |
| Archive, restore, plan limit, delete                                                                                                             | 23/24. The one failure: the delete counted a loop twice when the person was both its person and its owner. Fixed in `7bf2953`; that case re-checked live on its own, 6/6 |
| Cross-account isolation (account B against A's people, loops, photos, meetings)                                                                  | 19/19                                                                                                                                                                    |
| Photos (person and own), export, preferences                                                                                                     | 20/20                                                                                                                                                                    |
| Website, in Chromium: Archived list, archived person page, delete page, edit page, Remove, duplicate warning, Delete permanently, Settings photo | 13/13                                                                                                                                                                    |
| Selects after saving (person edit and Settings › Profile)                                                                                        | 6/6 after the fix below                                                                                                                                                  |

What the permanent delete did, checked in the database:

- **Deleted:** the person, their person-only note, observation, fact, and the public source only they were linked to.
- **Kept and unlinked:** their loops (one reworded first from the confirmation page), and the note that was also attached to a meeting.
- **Untouched:** the meeting, the conversation, the decision, a source shared with another person, and that person's fact and links.
- **While archived:** a meeting and a conversation created at that time did not include them.

**Found and fixed during preview testing: selects showed the wrong value after saving.**

- After "Save changes", React resets the form. Every select then showed its first option, or the value it was mounted with, although the right value had been saved:
  - a person's time zone showed "Not set";
  - their relationship showed the old one;
  - Settings › Profile showed Africa/Abidjan for the user's own time zone.
- A second save without reloading wrote that wrong value back. The person time zone was new in this PR; **the relationship and Settings › Profile cases were already in production.**
- Fixed once in the shared `Select` primitive (`70cea2c`). Three of the four new tests fail without the fix.

Limitations:

- **The iOS screens for these controls come in 2B.** Until then the new mobile routes have been tested by script only.
- **Name detection in retained loops is word-based.** It catches the full name, first name and preferred name. It can miss initials, nicknames or a role ("the CFO"). Every retained loop is still listed for review, whether or not it is flagged.
- **A brief written before someone was archived still says what it said then.** Rebuilding it leaves them out.
- **The iOS app shows the "Archived" label with the next build (2B).** TestFlight 0.1.0 (3) does not display the label field the server now sends. The server already leaves archived people out of briefs and strips their intelligence on the phone too.
- QA account A holds the test data. Deleting it, and account B, needs owner approval at the end of Phase 2.

**Owner's clarification before merging (25 Oct 2026): archived people in history and in briefs.**

The rule:

- Archived people remain visible in historical meetings and conversations, clearly labelled as archived.
- Newly generated preparation briefs for upcoming meetings do not treat them as active participants or include their relationship intelligence by default.

What the code did before the fix:

- History kept them, but nothing marked them as archived.
- A new brief still treated them as participants and used their notes, loops and history. This was the limitation reported with the 2A results.
- The Prepare screen showed their open loops and last contact, used their conversations for "last conversation", and listed their company at the table.

Corrections (`71aad9e`, `fbb21ee`, `0a2c895`):

| Where                                                                       | Now                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| New briefs and debriefs (`getMeetingContext`)                               | Archived attendees are left out entirely. Nothing about them is read for the prompt.                                                    |
| Prepare: web brief, glance, quick, and the phone's meeting data             | Kept in the room after everyone else, marked "Archived". No loops, last contact, last conversation, shared connections or company chip. |
| Conversation page; conversation lists (Today, Conversations); Meetings list | The name is marked archived.                                                                                                            |
| Today, web and phone (upcoming meetings); Ask's upcoming meetings           | Left out.                                                                                                                               |

Restoring the person brings everything back.

Tests:

- 11 new regression tests: 8 for the loaders, 3 rendering tests. 9 of them fail without the change; the other two check that active people and restored people read as before.
- Full suite: 1004 pass.

Live evidence on the preview (QA account A):

- **Setup:** a test person, "Quinn Halvorsen", with a company and notes. Quinn was put in an upcoming meeting with Marcus, added to an earlier meeting, given a conversation, then archived.

| Check                                  | Result                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| A new brief, generated after archiving | Its participants are Marcus alone. No mention of Quinn, Halcyon Labs or Quinn's notes. |
| Prepare                                | Quinn is listed after Marcus, marked "Archived", with 0 loops and no last contact.     |
| The earlier meeting                    | Quinn is shown, marked "Archived".                                                     |
| The conversation page                  | "Halcyon Labs · Archived"                                                              |
| Web Today                              | Quinn appears only on the past conversation, as "With Quinn (archived)".               |
| Phone Today                            | The upcoming meeting shows Marcus only.                                                |
| Meetings list                          | "Quinn Halvorsen (archived)"                                                           |

**Dropdown fix, re-confirmed:** the relationship field and the account time zone each kept their value through four saves in a row without reloading, and were stored correctly (12/12). The QA data was put back afterwards.

**2B — iOS controls (needs a TestFlight build; adds native modules)**

1. People tab: **Add person**, with the duplicate warning.
2. Person screen:
   - **Edit**: name, preferred name, title, organisation, email, profile URL, relationship type, pronouns, time zone, notes.
   - **Photo**: add, replace or remove. `expo-image-picker`, resized to JPEG under 2 MB.
   - **Remove**: archive.
   - People › Archived: **Restore** and **Delete permanently**, with the counts.
3. Account:
   - **Profile**: name, preferred name, title, company, pronouns, time zone (the device's zone is offered), own photo.
   - **Privacy & data**: what is stored, **Export my data** (a JSON file through the share sheet, using `expo-sharing`), delete account (exists).
   - **Notifications**: email and follow-through email on or off. The delivery hour is left out until Phase 3 fixes the once-a-day cron (finding 3.4).
   - **Calendar**: connected providers and last sync, read-only; connecting is done on the web.
   - **Plan & access**: read-only, per decision 3. No purchase or payment links.
   - **Help**: support, privacy, terms, version.
4. **App Store.** New permission text: photo library (and camera, if D3 allows). Before any public release, App Store Connect's privacy details must add "Photos", collected for app functionality and linked to the user. This does not block TestFlight.

**2C — iOS quality (small, low risk)**

1. A failed refresh keeps the loaded screen, with a quiet "Couldn't refresh" note (`useApi`, finding 9.1).
2. Today shows the unsent-recording banner even when Today fails to load.
3. Ask reads `?q` on every visit. Capture reads `meetingId` and `personId` fresh, so a voice note never attaches to a stale meeting.
4. Add people hides those already added.
5. Keyboard avoidance: `automaticallyAdjustKeyboardInsets` on `Screen`, plus Account, Capture notes and Add people.
6. Microphone denied: an **Open Settings** button.
7. Remove the empty file a failed microphone start leaves behind.
8. Pull-to-refresh on Account and Review; refresh on focus for Atlas and Account.

**2C + 2B status (25 Oct 2026, draft PR #19, not merged)**

Built as planned. There is no server or schema change; the only web change moves the relationship list into a shared module.

New native modules, which need the next build:

- `expo-image-picker`, for the system photo picker;
- `expo-image-manipulator`, which resizes photos to JPEG on the phone, longest side at most 1024 px;
- `expo-sharing`, for the data export.

Photos and permissions:

- The app never requests photo-library or camera access (D3).
- iOS still requires purpose strings, because the picker library contains those APIs. Ours say plainly that no library or camera access is used.
- The privacy manifest now declares photos.
- **Before a public release**, App Store Connect's privacy details must add "Photos".

Automated checks:

- iOS: 85 jest tests pass, 29 of them new (14 for 2C, 15 for 2B). `tsc` is clean. The 2C tests fail against the old code.
- Web: 1004/1004 pass, `tsc` is clean, lint shows 0 errors.

**Simulator results (25 Oct 2026).** EAS simulator build `0165d1ed` of commit `6bf0cef`, iPhone 18 Pro simulator, production backend, QA account A. No TestFlight build until the owner reviews.

| Check                                                                                                                                                     | Result                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Built `Info.plist`: photo and camera purpose strings present, microphone string unchanged                                                                 | **Pass**                                                                                                                              |
| Sign in; Today shows the upcoming "QA archived brief check" with Marcus only (Quinn is archived)                                                          | **Pass**                                                                                                                              |
| People shows "Archived, 2 people"; the Archived list shows both with Restore                                                                              | **Pass**                                                                                                                              |
| Delete preview for Quinn: deleted (record, 1 thing noted); kept but unlinked (1 loop, 2 meetings, 1 conversation); the flagged loop, with Edit and Delete | **Pass**                                                                                                                              |
| Delete needs the confirmation switch; cancelling deletes nothing                                                                                          | **Pass**                                                                                                                              |
| Restore within the limit: "QA is back in your people."                                                                                                    | **Pass**                                                                                                                              |
| Restore at the Free limit: refused, in plain words                                                                                                        | **Pass**: "Your plan holds as many people as it includes. Archive someone else to make room."                                         |
| Edit details: company, relationship, pronouns, time zone (Europe/Lisbon)                                                                                  | **Pass**: saved, confirmed in the database; "It is 2:19 AM on Sunday there" shown                                                     |
| Person photo through the system picker                                                                                                                    | **Pass**: iOS showed "Private Access to Photos" and no permission prompt; stored 1024×768 JPEG (412 KB) at `<uid>/people/<id>.jpg`    |
| Remove photo; "Remove from people" with its confirmation                                                                                                  | **Pass**: archived, back on People with "Archived, 2 people"                                                                          |
| Add someone who already exists                                                                                                                            | **Pass**: "You already have Marcus Lee (Northwind QA). Same name." with Open                                                          |
| Meeting: archived attendee marked "Archived"; tapping opens the archived page                                                                             | **Pass**                                                                                                                              |
| Account: Plan (Free, read-only), Edit profile, Notifications, Calendar ("No calendar connected"), Privacy and data, Help                                  | **Pass**                                                                                                                              |
| Notification switch saves (follow-through off, then back on)                                                                                              | **Pass**: confirmed in the database, restored to on                                                                                   |
| Export my data                                                                                                                                            | **Pass**: share sheet with "atturel-export-2026-10-25", JSON, 65 KB, and Save to Files                                                |
| Profile: time zone shown as "New York — GMT−04:00"; own photo upload                                                                                      | **Pass**: 684×1024 JPEG, 195 kB                                                                                                       |
| Location removed from photos                                                                                                                              | **Pass**: the source photo carried Lisbon GPS (38°43′N 9°8′W); the uploaded copy has no GPS fields (`exiftool -GPS:all` empty)        |
| Microphone off: message and **Open Settings**                                                                                                             | **Pass**: "Microphone access is off. Turn it on in Settings › Atturel › Microphone, or type notes instead." The button opens Settings |
| Atturel's page in iOS Settings                                                                                                                            | **Pass**: Microphone, Siri, Search, Cellular Data. **No Photos or Camera entry**, so the app never asked for either                   |

Limitations:

- On the simulator, **Open Settings** opened the main Settings page rather than Atturel's own page. On a physical iPhone, iOS normally opens the app's page. This goes on the next TestFlight checklist (§1.4).
- Not run on the simulator: Ask opened with a question. Three jest tests cover it, added after the run; two of them fail against the old code.
- Test data was restored afterwards: own photo removed, no avatar files left for QA account A, both email switches on. QA Person Three stays archived with the edited fields. QA accounts A and B are kept until the owner approves deleting them.

**iOS People search and public research (25 Oct 2026, PR #21, merged as `9bef39a`)**

The owner's request: on iPhone, search within your own saved people as the web does; on a person's page, "Research public footprint", reusing the web's research, showing sources and evidence, with nothing saved before review.

What was already there:

- **iPhone search:** the People tab already filtered the list on the phone, by name, role and company. It covered only the 300 people the list loads.
- **Web search:** the ⌘K search calls `search_everything`, which matches people by name or role, excludes archived people, and runs under row-level security.
- **Web research:** research runs on the person's page. It links pages it is confident about and adds their facts at once, labelled observed or inferred, never confirmed. Pages it is unsure of wait for "Check this is them".
  - It is not review-first.
  - Adding a person with a profile link starts it automatically (5.7).
- **The iPhone had no research.**

What changed:

- **Search, server-backed.**
  - `GET /api/mobile/people?q=` calls the same `search_everything`.
  - It returns matched people, then the user's own people at a matching company.
  - Every person is read back with `user_id` and `archived_at` filters on top of row-level security.
  - The phone filters what it has at once and replaces that with the server's answer. If the server cannot be reached, it keeps the phone's matches and says so.
  - The copy says it searches only the people you have saved.
- **Research, held for review:**
  - The web's `researchPerson` gains a `holdForReview` option, and the app always uses it. The web's own run is unchanged.
  - Each page is checked and read exactly as before. What it would add is held on its link (`match_signals.held`), and the link stays `unreviewed`.
  - Nothing reaches the record, a brief or Ask until "This is them". Confirming adds the held facts through the same writers, once, with no second model call. "Not them" drops them.
  - A page already decided, already in the record, or already waiting is left as it is. So "not them" is never offered again.
- **Routes:**
  - `GET /api/mobile/people/:id/research` reads and never searches.
  - `POST` searches, only from the button (`maxDuration` 120).
  - `POST /api/mobile/people/:id/sources/:sourceId` takes "This is them" or "Not them", through the web's own confirm and reject.
- **Screens:**
  - Person page: a "Public footprint" section that opens the research screen. It is hidden for sample people, because searching an invented name could only find strangers.
  - Research screen, for each page:
    - "Looks like them" or "Might be them";
    - why, in the identity check's own words;
    - where the name appears;
    - what it would add, each fact with its evidence words;
    - Open page, This is them, Not them.
  - When research cannot identify the person, the screen names what would help and offers Edit details. Saving details does not search.
- **Shared evidence words** (`src/lib/evidence-words.ts`), used by the web badge and the app.

What did not change:

- **No schema change.**
- **No new provider or paid service:**
  - the search provider is the existing one;
  - a run uses one research from the plan, as on the web;
  - confirming a held page costs nothing more.
- **Privacy:**
  - No public directory, cross-account search or profile sharing.
  - Photos are untouched and stay private; research never suggests photos.
  - Production has no shared people and no multi-member workspaces. The routes filter by `user_id` anyway.

Tests:

- **Web:** 1055/1055 pass. This adds 51 new tests across five files, including:
  - nothing from a held page reaches the record, not even for a typed link;
  - "not them" is never re-offered;
  - searching again counts pages still waiting;
  - the web's run is unchanged;
  - confirm adds held facts once, and malformed held data is refused;
  - search is limited to the user's own active people;
  - adding or editing never starts research.
- `tsc` is clean, and lint shows 0 errors.
- **iOS:** 94/94 pass, 9 of them new. `tsc` is clean.

Preview results (25 Oct 2026, PR #21 preview, production database, QA accounts A and B). All passed:

- **Search:**
  - finds by name (Marcus Lee), by company (Northwind finds Marcus), and the three QA Person records;
  - archived people are not found, by name or by company;
  - one letter searches nothing;
  - no token gets 401;
  - account B's own "Marcus Lee" record never appears in A's results, and B finds it in its own.
- **Research, with a test person** (Ada Lovelace, her Wikipedia page as the profile link):
  - Adding her started nothing: 0 research jobs, links or facts.
  - The run held the page ("Looks like them"). It gave why it matched, where the name appears, and 3 facts it would add, none confirmed. The database showed the link `unreviewed` with the 3 facts held, 0 facts in her record, and one research charged.
  - "This is them" added the 3 facts.
  - Searching again left the page in her record, with no duplicate facts.
  - "Not them" withdrew all 3 and cleared what was held.
  - Account B could not read her research or confirm her page (404). An archived person's research is not found.
  - She is archived afterwards, so QA account A has 4 active people again. The run used 2 of its 3 researches this month.

**Simulator results (25 Oct 2026). Partial: stopped before the research run.**

- **Set-up:**
  - EAS simulator build `f567b6f0` of PR #21's code (`a67cf96`), iPhone 18 Pro simulator, QA account A.
  - The app pointed at the PR #21 preview, which uses the production database. Production itself does not have these routes until PR #21 merges.
  - The preview address is set only on the QA branch `qa/pr21-simulator`, which is never merged.

| Check on the simulator                                                                                          | Result                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search "north"                                                                                                  | **Pass**: Marcus Lee, found through his company (Northwind QA)                                                                                                                                            |
| Search "quinn" and "ada" (archived people), and "brightwater" (an archived person's company)                    | **Pass**: no one                                                                                                                                                                                          |
| Search "person"                                                                                                 | **Pass**: QA Person Six, Five, Seven, in the server's order. The phone's own list sorts differently, so this is the server search                                                                         |
| Add Grace Hopper (company and role). Then, in Edit details, add her Wikipedia page as the profile link and save | **Pass**: her page shows Public footprint with "Research public footprint". The database after saving: 0 research jobs, 0 linked pages, 0 facts, no research status. Research used is unchanged at 2 of 3 |

- **Not run on the simulator:**
  - the research run;
  - pages waiting for review;
  - Ask and briefs while a page waits;
  - "This is them" and "Not them".
- **Why it stopped:**
  - The simulator session ended.
  - The Expo account's free simulator minutes are used up until 1 Nov 2026. A paid Expo plan needs the owner's approval.
  - QA account A's last research credit was not spent. Grace Hopper stays active, with her profile link, for when it resumes.
- **Remaining simulator checks, after 1 Nov 2026.** Run them when the Expo simulator minutes and QA account A's research credits reset; both reset on 1 Nov.
  1. **Build.** Run one EAS simulator build of PR #21's current head, pointed at its preview the same way (the QA branch `qa/pr21-simulator`).
  2. **Open the research screen.** Sign in as QA account A. On Grace Hopper, open "Research public footprint" and check that opening it searches nothing (no research job).
  3. **Run research once.** This uses one research credit. Expected:
     - the page waits, as "Looks like them";
     - it shows why it matched and the facts it would add, each labelled;
     - the database shows 0 facts and the link `unreviewed` with the facts held.
  4. **While it waits:** Ask about Grace and prepare a brief with her. Neither uses the page or its facts. The brief uses one of A's briefs.
  5. **"This is them":** the facts are saved, and the web page shows them.
  6. **"Not them":** the facts are withdrawn, and the screen says "Marked as someone else".
     - Ask and a later brief must no longer use the page. On PR #21 alone, a confirmed-then-rejected page is still cited; PR #22 fixes that and passed this on its preview.
     - If PR #22 is merged first, run this step on PR #21 with PR #22 merged in.
  7. **Search again** (a second research credit). Check the rejected page is not offered again. Otherwise this rests on the unit tests and the stored state.
  8. **Clean up:** archive Grace Hopper (reversible). Do not delete anything.
- **Already covered elsewhere:**
  - The same flow passed through the routes the app calls (the Ada test above).
  - The research screen has jest tests.
  - Confirm, reject and "never offered again" have unit tests.

Limitations:

- **The preview has neither the search provider nor the AI key.** So the preview research could only read the profile link, and the built-in composer did the reading; its facts were poor. Discovery and model reading run only in production. Judge their quality on the TestFlight build, with the owner's approval.
- **Held results sit in an existing JSON column.** A dedicated column would be cleaner; it needs a schema change and the owner's approval.
- **Search finds the same people as the web, plus people at a matching company,** with the web's ranking. The web's search does not match preferred names; neither does this.
- **Memory proposals from a confirmed page are reviewed on the web.** The iPhone has no memory review yet (8.2).
- **5.7 and 5.8 are web behaviour, unchanged here.** The owner decided on 25 Oct 2026 to fix them in a separate follow-up PR, stacked on this one.
- **After "Not them", Ask and briefs can still name the page** (found by reading the code, not seen live). The facts are withdrawn, but in two cases the page's title stays listed:
  - **The cases:**
    - a page the user confirmed and then rejected;
    - a page read earlier for someone else.
  - **Where it shows:** under "Public sources read" in Ask, and as a "Public source" citation in a brief.
  - **Why:** both still count as read, because Ask and briefs check only that a page was read and is not waiting for review.
  - **Not affected:** a page freshly held and then rejected. It never counts as read.
  - **On the web:** `main` has the same gap for any page marked "not them".
  - **The fix:** in the follow-up PR, which counts only pages accepted as this person.

Review plan (no merge, no build without the owner):

1. **Preview, as QA account A:**
   - Search a name, a role and a company; a single letter; an archived person (not found).
   - On a person, research. Pages wait, and nothing new appears on their web page until confirmed.
   - Confirm one page: its facts appear on the web person page.
   - Reject one page, then search again: it is not offered again.
2. **iOS simulator build** against production (the workflow's simulator option), with the same steps on the phone.
3. **Real-device checks** (§1.4) once the owner approves a TestFlight build.

**Website follow-up: findings 5.7 and 5.8 (25 Oct 2026, PR #22, merged as `01f0c67` after PR #21)**

The owner's rules:

- Adding a profile link must not start research or save research facts automatically.
- "Not them" holds unless the user explicitly chooses to reconsider that page.
- Evidence labels and per-page review stay.

What changed on the web:

- **Adding someone with a profile link opens their page, and nothing more.**
  - The redirect no longer carries `?research=1`, and the research panel no longer starts on arrival.
  - Research runs only from its button.
- **The typed link's page waits for review on every run, the web's included.** The same goes for a link added with Add context.
  - Typing a link in counts as a strong identity signal, never as a confirmation.
  - Pages found by search keep the review they had: linked when research is confident, "Check this is them" when it is not. Facts stay labelled observed or inferred.
- **A waiting page lists what it would add**, each fact with its evidence badge, above "Yes, this is them".
- **"Not them" stands.**
  - The web's research now checks the user's decision before anything else. A page marked "not them" is never linked again.
  - A page the user confirmed is never downgraded by a later reading.
- **"Reconsider this page"** appears only on a page the user marked as someone else.
  - It re-reads the stored page, holds it for review and uses one source read from the plan.
  - If the page still does not read as them, or cannot be read, "not them" stays exactly as it was.
- **Ask and briefs use only pages accepted as this person.** That means confirmed or probable, and never a page that is held, unreviewed, ambiguous or marked "not them".
  - This closes the gap recorded under PR #21's limitations.
  - On the web, a page marked "not them" is no longer listed in Ask or cited in briefs.

Tests:

- Adding with a link: no research flag, and no research on arrival.
- The typed link held on the web's run; discovered pages not held.
- Add context held.
- Reconsider, four tests:
  - offered only on a page the user marked;
  - held and metered;
  - "not them" restored when the page still does not match;
  - "not them" restored when reading fails.
- The web path keeps "not them" and "this is them".
- Ask and briefs count only accepted pages.
- The source row shows evidence labels and offers Reconsider only on the user's own "not them".
- 15 of the new tests fail against PR #21's code. The rest pin behaviour that already held there.
- Full web suite passes. `tsc`, eslint and prettier are clean.

Preview results (25 Oct 2026, PR #22 preview, production database, QA account B):

- **Set-up:**
  - A test person, Katherine Johnson (NASA, mathematician), with her Wikipedia page.
  - No research run was used: the page was added through Add context, which is a source read.
  - QA account A's last research credit was not touched.
- **Brief checks:** each brief's citations were read from the database (`artifact_sources`). Briefs build their citations on every path, including the preview's built-in composer.

| Step                                                    | What happened                                                                                                                                                                       | Result                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add the person with her Wikipedia link                  | Her page opened with no `?research=1` and "Research public footprint" waiting. After 8 s: 0 research jobs, 0 linked pages, 0 facts, no usage                                        | **Pass**                                                                                                                                                                                                                        |
| Add the same link with Add context                      | The page waits for review: link `unreviewed`, 1 fact held (labelled observed), 0 facts in her record. The row lists "If it is them, this adds:" with the Observed label and excerpt | **Pass**                                                                                                                                                                                                                        |
| Ask and brief 1, while it waits                         | Ask: nothing known about her. Brief 1: no citations, and none of the page's text                                                                                                    | **Pass**                                                                                                                                                                                                                        |
| "Yes, this is them" (positive control)                  | 1 fact saved; the page counts as read. Brief 2 cites "Public source: Katherine Johnson - Wikipedia — Wikimedia Foundation, Inc."                                                    | **Pass**                                                                                                                                                                                                                        |
| "This is someone else", after confirming                | Link `no_match`, reviewed; the fact withdrawn. The page still counts as read: this is the state PR #21 and `main` still cite                                                        | **Pass**                                                                                                                                                                                                                        |
| Ask and brief 3, after rejecting                        | Ask: nothing known about her. Brief 3: no citations and no mention of the page                                                                                                      | **Pass** (the fix)                                                                                                                                                                                                              |
| Reconsider this page                                    | Waits again: `unreviewed`, 1 fact held, 0 in the record. One source read charged                                                                                                    | **Pass**                                                                                                                                                                                                                        |
| Reconsider after renaming her to a name not on the page | "This source does not mention Kay Quillfeather. It stays marked as someone else." Link back to `no_match`, reviewed, with its original signals. No charge                           | **Pass**                                                                                                                                                                                                                        |
| Reconsider when the stored text is gone                 | "There is no stored text for that page to read again. It stays marked as someone else." Link `no_match`, reviewed; no facts; no charge                                              | **Pass**                                                                                                                                                                                                                        |
| Add the rejected link again                             | Decision kept: `no_match`, reviewed, nothing held, no charge. **But the message said "Added as a source. Nothing new was extractable from it."**                                    | **Fixed** in `1efd9b3` and rechecked on the preview: it now says "You marked that page as being about someone else, so it was not used. To use it, choose Reconsider on that page under Sources." Decision unchanged, no charge |

- **How the "stored text is gone" case was produced:**
  - The test page's stored text was moved to a key in the same row, for that one step.
  - It was then put back, with its fingerprint (md5, length, content hash) checked unchanged.
  - Nothing else was written by hand.
- **Not verified on the preview:**
  - **Ask with the AI model.** The preview has no AI key, so Ask answered from saved facts. The "Public sources read" list that the model sees comes from the same function as the brief citations above.
  - **A full research run.** One would charge a research credit. With no search provider, it would read only the typed link, through the same held path that Add context used.
  - **The web's fresh path when a "not them" page's content has changed** (5.8). This needs discovery, which the preview does not have. Unit tests cover it.
- **The iPhone has no Reconsider button.** A page marked "not them" there can be reconsidered on the web.

**Order and testing**

- 2A first. It is web plus server and mergeable on its own.
- Then 2C and 2B together, ending in one TestFlight build that runs the §1.4 checklist plus the Phase 2 checks.
- Each PR is tested with:
  - unit tests: vitest for cores and routes, jest for mobile;
  - route checks against the PR's Vercel preview with the QA account;
  - for mobile, the iOS simulator against production.

**Phase 2 decisions (owner, 25 Oct 2026). The plan and the order 2A → 2C + 2B → TestFlight are approved.**

- **D1. Loops survive a permanent delete, unlinked.**
  - Before the person is deleted, `person_id` and `owner_person_id` are cleared on their loops.
  - A retained loop must not expose deleted personal information. Before deleting, the confirmation lists every retained loop whose text mentions the person, and the user can edit or delete each one.
- **D2. Archived people do not count toward the Free plan's five active people.** Until restored, they are excluded from:
  - new meetings, research, and conversation matching;
  - search, pickers, Today, Atlas, brief and Ask context, follow-through;
  - every other active workflow.

  Restoring someone goes through the plan limit (`checkPersonLimit`).

- **D3. iOS photos come through the system photo picker** (PHPicker, which needs no photo-library permission). No camera access yet.

Further requirements set by the owner:

- **History stays intact.** Meetings, conversations, their text, and decisions are kept when a person is archived or deleted. Only that person's link to them is removed.
- **Permanent delete never reaches unrelated records.** Test deletion and restoration thoroughly, including cross-account isolation.
- **The confirmation is exact.** It separates what will be **deleted**, **retained** and **unlinked**, and explains retained text that may identify the person.
- **No redesigns, new services, database migrations, or destructive rewrites.** Keep the existing design language.
- **QA account.** Reuse the existing disposable QA account for Phase 2 testing. Do not delete it without the owner's approval at the end.
- **Merging and releases.** Run automated tests and verify the website preview before merging each implementation PR. **No Phase 2 PR is merged and no TestFlight build is published without presenting the results for owner review first.**
- The next TestFlight release runs the §1.4 checklist, including the unverified update-survival test. The Phase 3 fix for finding 8.7 stays planned.

### Pricing and the Pro trial (PR #26, merged 25 Oct 2026, `4295ac6`)

_Implements decision 7 (§4). Released 25 Oct 2026 (see "Release" below). Allowances unchanged. No migration: every column already exists in production (checked read-only)._

**How the trial works:**

- **Granted by Atturel, not Stripe.** Start your 14-day Pro trial (Settings › Plan) sets the account's existing `subscriptions` row to `status = 'trialing'` with `trial_ends_at`.
  - `plan` stays `free`, because `plan` records what is paid for.
  - It is one conditional UPDATE, only on a Free row that has never had a trial or a Stripe subscription (`src/lib/billing/trial-claim.ts`).
  - No card is asked for, and nothing is created at Stripe.
- **Ends by itself, under one rule.** `trialRunning` (`src/lib/billing/trial.ts`) is the only expiry rule: Pro while the time is before `trial_ends_at`, never after.
  - Every reader uses it: entitlements (so every server capability and limit check, the website, the iPhone account response and the sidebar label), and the webhook's trial guard. The Plan page reads it through entitlements.
  - It is evaluated on each request, and nothing writes the expiry. So a trial ends on time even if the daily job, a reminder or a webhook never runs.
  - A date that cannot be read counts as ended.
  - A test checks that the readers agree to the millisecond at the boundary.
- **Back to Free keeps everything.** Nothing is deleted or archived. Reading, editing and export are not plan-gated. With more than five active people, adding or restoring one asks for Pro; nobody is hidden.
- **Consent is structural.** While the trial runs there is no Stripe subscription, so a card added or updated in the billing portal cannot start billing (the portal cannot create a subscription). Only Subscribe to Pro — $29/month does that. It opens Checkout with the first charge date and the monthly terms beside Stripe's button, and on the Plan page before it.
- **Subscribing keeps the rest of the trial.** The Checkout subscription carries `trial_end`, so the first charge is when the trial would have ended. Stripe requires at least 48 hours, so in the last two days it is 48 hours and 10 minutes away, never sooner. After the trial, subscribing charges today and says so.
- **Opt-in, and offered only where it can end in a real choice.** The trial is offered only when subscribing works (Checkout, the price, the webhook and the service role) **and** `PRO_TRIAL_OFFER` is exactly `on`. Unset means no offer, so merging opens nothing (owner, 25 Oct 2026: start with the offer off). The pricing page advertises the trial only under the same condition.
- **One open Checkout per customer.** Before opening Checkout, any open session on other terms is expired; one on the same terms (first charge date and price) is reused. Stripe will not complete an expired session, so two tabs, a back button or a later second press cannot produce two subscriptions.
- **Checkout charges what the terms state.** `adaptive_pricing` is turned off on the session. The live account has Adaptive Pricing on, and a live session opened from abroad presented S$38.55 beside our "$29" terms.

**Abandoned checkout cannot remove or extend a trial (reviewed 25 Oct 2026):**

- **Nothing happens when Checkout is closed or a card is declined.** No subscription is created, and the trial row is untouched. `checkout.session.expired` is not an event the handler acts on (tested).
- **An `incomplete` or `incomplete_expired` subscription while the trial runs is ignored**, whatever `trial_end` it carries, so it can neither shorten nor lengthen the trial (tested).
- **`trial_ends_at` has two writers only:** the trial claim (once, onto an empty value), and the webhook for a subscription that entitles, which needs a completed Checkout with a card.
- **Known and bounded: up to about two extra days.** Subscribing in the trial's last two days puts the first charge 48 hours and 10 minutes out, Stripe's minimum. So Pro can run up to about two days past the trial's end.
  - It needs a completed Checkout with a card. Canceling afterwards keeps Pro to that date without a charge.
  - It happens at most once per account: a later subscription gets no trial.
  - Accepting it keeps the promise that subscribing never charges before the trial ends.
- **Canceling keeps the rest of the trial only because the portal cancels at the end of the period.** The live portal is set that way (verified read-only, below). An immediate cancellation, for example from the Stripe dashboard, would end Pro at once.

**The reminder before the first charge stays** (owner, 25 Oct 2026).

**What customers see:**

- **Plan page:** the trial's end date in the account's time zone, the days left, "No card, nothing charged", what happens after, and the subscribe action with its terms. After the trial it says "Your Pro trial ended on … Nothing was charged." There is no second trial and no Manage billing for a trial alone.
- **iPhone (account response):** the plan line reads "Pro trial · ends 8 Nov 2026" or "Pro · first charge 8 Nov 2026", and `billing` is `trial`. Plan and access only: no purchase or payment link (decision 3).
  - Build 5 shows the new plan line. It shows an unknown `billing` value as "Nothing is billed", which is true of the trial.
  - The source's trial wording on the Account screen ships in the next build.
- **Emails, through the existing system:**
  - Trial started.
  - **Trial ending**, two to three days before the end, from the daily 13:00 UTC job.
  - Trial ended.
  - Subscribed, with the first charge date and terms.
  - **First charge soon**, two to three days before a subscribed trial's first charge, so it never arrives unannounced.
  - Canceled during the trial: "You will not be charged" (it used to say "charged again").
  - The daily notices come from windows, not a ledger, so only the scheduled run sends them, never a manual run.
- **Pricing page:**
  - Free and Pro, led by preparation, relationship memory and follow-through.
  - The trial terms, and an allowance table read from the plans the paywall enforces.
  - "On every plan": privacy, evidence, corrections and export.
  - No Teams card. No annual price. Nothing unbuilt is advertised: deep research, weekly intelligence and advanced memory are left out.

**Did the existing webhook need changes? Yes. Each change is pinned by a test that fails on the old code (7 failed on it).**

1. **No subscription confirmation was ever sent for subscribing during the trial.** The trial row already read as Pro, so "became Pro" never fired. The same happened for subscribing after an expired trial.
2. **An abandoned or failed checkout erased a running trial.** Its `incomplete` subscription overwrote the row with Free.
3. **The confirmation had no first charge date**, and the cancellation notice said "You will not be charged again" when nothing had been charged.

Ordering, the event ledger and replays needed no change. A late or repeated event re-reads Stripe's current state and sends nothing new, and the tests confirm it for trial subscriptions.

**Verified:**

- **Web: 1371/1371 tests. iPhone: 108/108.** Typechecks are clean, ESLint reports 0 errors, and Prettier is clean on the changed web files.
- **Lifecycle, against the real webhook handler and an in-memory ledger:**
  - subscribe during the trial, with duplicate and late deliveries;
  - the first charge, and a failed first charge (`past_due`, then `unpaid`);
  - cancel during the trial, then end at the trial's end;
  - an abandoned checkout during the trial;
  - subscribing after expiry.
- **Starting twice, and twice at once:** the server action against a table with Postgres's update semantics. Separately, **the real UPDATE in a scratch Postgres 16 under two concurrent sessions,** re-run with the final statement. The second session waited on the first's row lock, re-checked the conditions and claimed nothing. The row ended `free` / `trialing` with one end date.
- **A revert reads trials as Free:** the pre-trial rule (`effectivePlan`) applied to trial rows, running or ended, returns Free (tested).
- **Expiry:** entitlements read an expired trial row as Free with Free's limits, and the Plan page, iPhone line and notices follow.
- **Checkout parameters:** `trial_end`, the 48-hour minimum, the terms text, and no trial after expiry.
- **Pages:** the Plan page in each state, the pricing page, and the account response.
- **Vercel preview (25 Oct), read-only:**
  - **The pricing page, signed out:** 200, with the trial line, the CTA and 13 allowance rows. There is no Teams card and no annual price, nothing overflows at phone width, and there are no console errors.
  - **Settings › Plan, signed in as QA account B** (Free, never trialed, no grant, confirmed read-only). It showed Subscribe but no trial. So the preview has the Stripe secret key, but lacks the webhook secret, the price ID or the service role; which one could not be read from this session.
  - Checkout refuses on exactly those conditions, so Subscribe could only have failed there. **Fixed:** Subscribe and the trial now follow one check (`checkoutAvailable`). Where subscribing cannot complete, the page offers neither and says upgrading is not available.
  - No button was pressed and nothing was written.

**Billing QA accounts (created 25 Oct 2026 at the owner's request; QA account B is untouched):**

- `qa-billing-trial-20261025@atturel-demo.dev` (user `686fddce-…`), for subscribing during the trial, abandoned checkout and cancellation.
- `qa-billing-expiry-20261025@atturel-demo.dev` (user `3b841b8d-…`), for a trial that expires without a subscription.
- **Why two:** each account gets one trial, and these two paths need separate trials.
- Both are onboarded, Free, never trialed, in America/Chicago. Both sign in on the PR #26 preview: the account response answers 200 with "Free".
- The credentials are held outside the repository and were never printed.

**Production billing configuration (25 Oct 2026, owner direction: use the existing live account; no sandbox, no duplicate products, prices or webhooks).**

- **Verified, live Stripe API (read-only):**
  - Price `price_1UQHvV…`: $29.00 USD, monthly, interval count 1, active. It is the only live price.
  - Webhook "Atturel LIVE - production" to `https://www.atturel.com/api/stripe/webhook`: enabled, with exactly the eight events in `HANDLED_EVENTS`.
  - Default portal configuration: cancel at the end of the period (which keeps the rest of a trial), payment-method updates and invoice history on, plan switching and pause off.
- **Verified, production behaviour, without exposing any secret:**
  - **Live secret key and live price.** Production's existing Checkout, opened by billing QA account `qa-billing-trial-…`, created a `cs_live_` session for `price_1UQHvV…`, card required. So `STRIPE_SECRET_KEY` is live, and `STRIPE_PRICE_PRO_MONTHLY` is the live price and passes the code's $29 monthly check.
    - Nothing was entered or paid. The session expires unpaid; it created one live customer for the QA account.
  - **Webhook secret present.** A request with a bad signature to production's webhook answered 400. Without the webhook secret, the service role and the Stripe key it would have answered 503.
  - **Daily job and email delivery work.** The scheduled follow-through job last sent at 13:00 UTC on 25 Oct (15 deliveries in two weeks). The trial reminders run in that same job.
- **Not verifiable without a real event: that the webhook secret matches the live endpoint.** Stripe's API cannot resend an event, and there has been no live subscription event yet. The first genuine pilot checkout is the evidence: Stripe Dashboard → Developers → Webhooks → the live endpoint → Event deliveries should show 200.
- **Evidence and inference, kept apart:**
  - The production database has only six test-mode events (14 Oct 2026, 02:03–02:17 UTC) and no live ones.
  - The earlier note that production "appears to use test keys" was an inference from those events alone, and it was wrong. The live Checkout session above shows production now uses the live key.
- **Owner settings in Stripe, which the API cannot read:**
  - **"Send a reminder email 7 days before a free trial ends"** (Settings → Billing → Subscriptions and emails). Card-network rules for trials that convert to paid call for a reminder, and Stripe documents 7 days. Atturel's own "first charge soon" email comes 2–3 days before; Stripe's covers the 7-day notice.
  - Successful-payment receipts and failed-payment emails.
  - Adaptive Pricing can stay on for other uses; Atturel's Checkout turns it off per session.

**Billing QA accounts (created 25 Oct 2026 at the owner's request; QA account B is untouched):**

- `qa-billing-trial-20261025@atturel-demo.dev` (user `686fddce-…`): the subscribe path. It now has a live Stripe customer from the Checkout check above, and no subscription.
- `qa-billing-expiry-20261025@atturel-demo.dev` (user `3b841b8d-…`): a trial that expires without a subscription. It now has 8 test people.
- `qa-billing-start-20261025@atturel-demo.dev` (user `f4a93930-…`): the public "Start your 14-day Pro trial" button. Its trial runs to 8 Nov 2026.
- All three are onboarded, in America/Chicago. The credentials are held outside the repository and were never printed.
- `atturel-demo.dev` has no DNS records, so any mail to these accounts bounces. The App Store reviewer account uses atturel.com instead ("External TestFlight" below).

**What still rests on automated tests, not live evidence:** the webhook lifecycle (subscribing during the trial, the first charge at the trial's end, a failed first charge, cancellation before the first charge, repeated and out-of-order events), and the trial-ending emails. In live mode these are verified only by genuine pilot purchases. No artificial charge, declined real card, refund or accelerated billing is run in live mode (owner, 25 Oct 2026).

**Independent code review before release (25 Oct 2026).** A separate reviewer read the final diff for trial expiry, consent, remaining trial time, abandoned checkout, duplicate subscriptions and webhook handling.

- **Confirmed correct:**
  - one expiry rule for every reader;
  - one trial per account;
  - nothing but a completed Checkout starts billing;
  - `trial_end` and every displayed first-charge date use the same instant and time zone;
  - an abandoned Checkout cannot shorten, extend or erase a trial;
  - the ledger, re-reads and old-subscription guard.
- **Defects found and fixed in this PR:**
  - **Duplicate "You are subscribed" emails.** Stripe's near-simultaneous events for one checkout could each send it. Billing emails and trial notices now carry an idempotency key (subscription, transition, date), and Resend sends one email per key for 24 hours. The same key stops a rerun of the daily job from repeating a notice.
  - **The iPhone showed "Pro · first charge …" after a cancellation.** It now reads the subscription and says "Pro until …".
  - **A Checkout opened before the trial could still be paid afterwards,** charging today and ending the trial. Starting a trial now closes the account's open Checkouts.
  - **The trial's date was kept on record for one event only.** It now persists through later events.
- **Known and accepted, for the owner to weigh:**
  - **A failed first charge keeps Pro while Stripe retries.** This is the existing `past_due` grace for paying customers, now also covering subscriptions started during a trial. Checkout verifies the card when it is saved; a later decline would allow up to Stripe's retry window of unpaid Pro.
  - **A daily job that fails misses that day's notices.** No migration was added for a delivery ledger. The job's own history shows it running daily, and Stripe's 7-day reminder (owner setting) covers subscribed trials.
  - **Two live subscriptions are still possible in two narrow ways:** two presses in the same instant across a minute boundary in a trial's last 48 hours, or a subscription created from the Stripe dashboard. The webhook then follows the newest one that entitles.

**Release (25 Oct 2026).** Merged with the offer off, verified on production through the billing QA accounts, then switched on by the owner.

- **Deployment evidence.** Production served the new code about 45 seconds after the merge: the account response carries `trial`, and the pricing page has the allowance table and no Teams card.
- **Presentation and Checkout** (`qa-billing-trial`, trial granted in the database with the app's own statement while the offer was off):
  - The Plan page reads "Your first charge of $29 is on 8 Nov 2026, then $29 every month until you cancel."
  - Live Checkout reads "13 days free · Then $29.00 per month starting November 8, 2026", with $0 due today, in USD.
    - The dates match. Stripe counts whole days to a trial end rounded down to the minute, so it shows 13 where the Plan page shows 14.
  - A second press reused the same session, and the older session from `main` was expired. The abandoned Checkout left the trial unchanged, and Stripe sent no events.
- **Expiry keeps data** (`qa-billing-expiry`, a 6-minute trial, no job involved). Twenty seconds after the end:
  - the account read Free and the Atlas answered 403;
  - all 8 people stayed active and readable, and none were archived;
  - editing a person beyond the Free limit worked, and the export held everyone;
  - a ninth person was refused with the Free-plan message;
  - the Plan page said "Nothing was charged. Nothing is deleted …".
- **The public offer, on both domains, after the owner enabled it.**
  - `atturel.com` redirects to `www.atturel.com`. The pricing page shows the trial terms and FAQ, and "Start your 14-day trial" leads a signed-out visitor to sign-up.
  - An eligible signed-in account (`qa-billing-start-…`, new, never trialed, no Stripe customer) pressed **Start your 14-day Pro trial** on Settings › Plan:
    - it got the trial at once, ending 8 Nov 2026;
    - it made **no request to Stripe**, and created no Stripe customer;
    - the row reads `free` / `trialing`.
  - **Gap, fixed in PR #27** (merged 25 Oct 2026, `0b814fd`): the same button took a _signed-in_ visitor to `/sign-up`, which middleware sent to Today, not to the trial. It now asks for Settings › Plan (`next`), which middleware honours for signed-in visitors. The sign-up page's "Sign in" link keeps that destination.
  - **Verified on production after the merge, on `atturel.com` and `www.atturel.com`** (`qa-billing-start`, no new trial):
    - signed out, the button opens sign-up with `next=/settings/billing`, and signing in through its "Sign in" link lands on Settings › Plan;
    - signed in, the button goes straight to Settings › Plan;
    - `next=//example.com` and `next=/%09/example.com` land on Today, on the site;
    - no request reached Stripe.
  - The shared redirect check now also refuses whitespace and control characters. The URL parser drops tabs and newlines, so `/<tab>/evil.com` passed the old check and resolved to `evil.com`. This applies to the sign-in form and the email-link callback too.
  - A new account still finishes onboarding on Today. The email confirmation link and onboarding do not carry `next`; carrying it would change the confirmation link and onboarding's four exits, which is new scope, so it waits for pilot evidence. The pilot guide sends new accounts to Settings › Plan.
- **Live Stripe objects created for QA:** one customer (`qa-billing-trial`), one expired Checkout session, and one open session that expires unpaid on 26 Oct. No charge, subscription or refund.
- **Still resting on automated tests, until genuine pilot purchases:**
  - a completed live subscription;
  - the webhook secret matching the live endpoint (the first delivery should show 200);
  - the first charge, a failed charge, and cancellation through to the end of the period;
  - repeated and out-of-order live events;
  - the trial reminder emails, whose first natural run is the daily 13:00 UTC job.

**Rollback. No step resets a trial, a QA account or any customer data:**

1. **Stop new trials.** Remove `PRO_TRIAL_OFFER` (or set it to anything but `on`) in Production and redeploy.
   - Trials already running keep their end date and remaining days.
   - The pricing page stops advertising the trial. Subscribe still works.
   - Nothing in the database changes.
2. **If the code itself must go,** revert the PR after the trials running at step 1 have ended (at most 14 days later).
   - A trial row keeps `plan = 'free'`, so the pre-trial code reads every trial row as Free, running or ended (tested). No row needs changing.
   - Subscriptions started during a trial are ordinary Stripe subscriptions, which the pre-trial webhook already handles.
3. **Reverting before those trials end would cut them short,** so it is not part of this plan.
4. **Rows are never rewritten for a rollback.** Each account keeps its trial history (`trial_ends_at`), including after a later subscription.

### External TestFlight (prepared 25 Oct 2026, not submitted)

_Owner-authorized for build 0.1.0 (5): prepare now; submit for beta review once the policy corrections are approved and the core device checks pass; turn on a 10-tester public link after approval. No new build._

- **Build 0.1.0 (5) is eligible.** The read-only TestFlight status workflow (run #4) reports:
  - processed (`VALID`) and in internal testing;
  - `READY_FOR_BETA_SUBMISSION` for external testing;
  - export compliance answered, with no non-exempt encryption;
  - it expires on 23 Jan 2027.
- **A new build is not necessary.** The only app change since build 5 (`ea84289`) is PR #26's Account screen: a trial billing line, and the invitation-code field shown to trial users.
  - On build 5, a trial account still reads "Pro trial · ends …" from the server. Its billing line falls back to "Nothing is billed", which is true of the trial.
  - Everything else testers use runs on the server, which is already live.
  - A new build is needed only for a fix the device checks turn up, or before 23 Jan 2027.
- **Set in App Store Connect (25 Oct 2026, `prepare`, PR #29's workflow step):**
  - the external group **Atturel Pilot** (no public link, no build yet);
  - the test information: description, feedback email, marketing URL, privacy policy URL;
  - What to Test on build 5.
- **Beta App Review details: set (25 Oct 2026, run #10).** The first attempt was refused (409) without a contact phone. The owner then entered the contact and added the `SUPABASE_SECRET_KEY` Actions secret, and `prepare` set:
  - sign-in required, with the reviewer account and notes;
  - a new password, on the Atturel account and in App Store Connect.

  Signing in with App Store Connect's copy works, and the account reads "Full access" (billing `included`) with the sample record loaded. The log shows the key only as `***`, and no password or hash.

- **Reviewer account:** `appreview@atturel.com` (user `a4fa330a-…`), created 25 Oct 2026. Onboarded, sample record loaded (5 invented people, "Q3 capacity review" on Today), Atturel's emails off.
  - **Access: Full access**, Atturel's existing access tier, granted with `public.set_access_tier` (owner, 25 Oct 2026; revocable, with a note on the grant). Every Pro feature, no monthly limits, no expiry during review, no trial and no purchase. The app shows "Full access" and "Included with your access. Nothing is billed.", and the review notes disclose it. `submit` refuses unless the account reads Full access. An interim plan to use the 14-day trial was dropped: it would expire, and review must not depend on it.
  - **Correction (owner, 25 Oct 2026):** an earlier draft kept the reviewer on Free on the grounds that it avoided the payment-rule question. It does not: Free or Pro settles nothing about guidelines 3.1.1 and 3.1.3(b), and hiding paid features from review is wrong. The review notes instead describe the model accurately: Free, and Pro at $29 a month bought only on the website; no in-app purchases, prices, upgrade buttons or purchase links in the app; Account only displays the plan; and Free accounts see an "Invitation code" field.
  - **Password:** generated inside the workflow, set on the account through Supabase Auth's admin API (a dedicated secret key held only as a GitHub Actions secret), then stored in App Store Connect, which keeps it durably for Apple and the owner. The run signs in with App Store Connect's copy to prove it works. No password, hash or key is printed. An earlier draft logged a bcrypt hash for a manual database update; that was removed before use. The first, temporary password was never printed, and its file was destroyed. Optional recovery: a Cloudflare Email Routing address for `appreview@atturel.com`, then "Forgot your password?".
- **Before submitting:**
  - the policy corrections are approved and published (their own draft PR);
  - the core build 5 device checks (§1.4) pass, reported by the owner.
- **Testers' access:** the standard 14-day Pro trial from the website, then $29 a month. No invitation codes by default.

**Phase 3 — Connected experience.** See §3. It covers onboarding honesty and reliability, calendar next steps, emails, research recovery, Prepare without padding, Ask with next actions, editing confirmed loops, iOS memory review, and one definition of Today.

**Phase 4 — Member discovery.** Deferred (decision 1).

**Phase 5 — Validation.** Web end to end (Playwright) and iOS simulator flows per phase, a security review of new routes, then TestFlight and a written report.

**Test assets.** Two disposable QA accounts exist; both need the owner's approval to delete, at the end of Phase 2.

- `qa-capture-20261024@atturel-demo.dev` (user `5e9d5f6c-…`) is used for Phase 2 testing and holds its test people and records. Both earlier deletes timed out at Supabase's confirmation prompt.
- `qa-isolation-20261025@atturel-demo.dev` was created for the cross-account isolation checks.
