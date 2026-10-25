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
- **iOS People search and public research: built, in draft PR #21, awaiting the owner's review** (§5, "iOS People search and public research"). Not merged, no build. It holds every page research finds until the owner says it is them.
  - On the simulator, search and adding a profile link passed. The research steps were not run: the Expo account's free simulator minutes are used up until 1 Nov 2026 (§5, "Simulator results").
- **Open pull requests:**
  - **PR #20 (doc-only) was merged on 25 Oct 2026** (`df4d3e3`), with the Phase 4 photo decision (§4, item 6).
  - **PR #21** (iOS search and research) is stacked on it, and so is the website follow-up for 5.7 and 5.8.
- Owner decisions on discovery, removal, billing, notifications, privacy and photos are recorded in §4.
- **New product-intelligence finding** (§2, 8.7): a proposed action is sometimes read as a confirmed decision. **A Phase 3 priority.** A reproducible case and the acceptance test are in §2, "Finding 8.7".
- **Calendar on the owner's account last synced on 27 Aug 2026** and has not synced since (finding 8.6, raised to P1).
- **Atturel is not launch-ready.** Do not describe it as fully launch-ready until finding 8.7 is fixed and validated (owner, 25 Oct 2026).

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
7. **Real device, once PR #21 ships: search and public research.**
   - Search finds someone saved by name, role or company; nobody else's people and no archived people appear. Offline, the phone's matches stay, and the screen says so.
   - Research public footprint: opening the screen does not search. The button does. Each page shows why, where the name appears, and what it would add.
   - "This is them" adds the page's facts. "Not them" removes the page, and it is not offered again. Open page opens the browser.

### 1.5 Build 0.1.0 (4) on the owner's iPhone (25 Oct 2026)

**Source:** the owner's report of their iPhone screenshots, and their explicit test results. The screenshots did not reach the assistant's session. TestFlight feedback cannot be read without an App Store Connect key on the Expo account. So "Seen" means the owner reports the screen was shown; it does not mean the checks on that screen passed.

| Check                                                        | Status                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Build 0.1.0 (4) installed                                    | **Verified** (owner)                                                                            |
| Account and profile screen                                   | **Seen** (owner)                                                                                |
| Person management controls                                   | **Seen** (owner). Not yet exercised on the device                                               |
| Capture Review screen                                        | **Seen** (owner). Its example said "we decided", and was correctly read as a decision (§2, 8.7) |
| Calendar status "last synced 27 Aug 2026"                    | **Seen** (owner). The date is accurate; nothing has synced since (finding 8.6)                  |
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

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status              | Sev |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --- |
| 5.1 | **The refusal to link unverified identity is correct, and stays.** A name with no company cannot auto-link (0.28 < 0.55).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Implemented         | —   |
| 5.2 | Recovery asks for org, title or URL and offers a pasted link. It **never shows which candidates were rejected or why.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Partial             | P1  |
| 5.3 | **Confirming an uncertain source extracts no facts.** It shows "No facts rest on this". **PR #21:** a page held by the app's research carries what it would add, so confirming it adds those facts, on the web or the phone. A page the web's research was unsure of still adds nothing on confirm.                                                                                                                                                                                                                                                                                                     | Partial             | P1  |
| 5.4 | The publisher label is heuristic. A loose JSON-LD match can name a host or platform instead of the original publisher. No code labels a source with the search provider.                                                                                                                                                                                                                                                                                                                                                                                                                                | Partial             | P2  |
| 5.5 | **Placeholder URLs look real.** `add-context.tsx` builds `https://acme.com/leadership/<real person's name>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Broken (trust)      | P1  |
| 5.6 | Each refine re-runs research and counts against the quota again. People actions have no `maxDuration`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P2                  | P2  |
| 5.7 | **Web: entering a profile link starts research by itself.** After adding a person with a profile link, their page opens with `?research=1` and research runs on arrival (`autoStart`). That page is then linked as a confirmed match ("You provided this directly"), and its facts are added without review. This conflicts with the owner's rule of 25 Oct 2026: entering details must not silently start research or treat unverified information as confirmed. The phone does neither. **Owner decision:** remove `autoStart` on the web and hold the typed link's page for review, as the app does. | Conflicts with rule | P1  |
| 5.8 | **Web research can re-link a page the user marked "not them"** when the page's content has changed: its fresh path writes the identity status again. The app's held research checks the user's earlier decision first. Fix: the same check on the web path.                                                                                                                                                                                                                                                                                                                                             | Broken (trust)      | P1  |

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

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status         | Sev |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --- |
| 8.1 | Proposals are created as `proposed`. Review confirms or rejects them, and only confirmed items are active. Memory is never written without approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Implemented    | —   |
| 8.2 | **iOS Review is keep-or-reject only**: no editing a loop's text or date. It says memory proposals "wait on each person's page", but the iOS person page cannot show or confirm them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Partial        | P1  |
| 8.3 | **A confirmed loop cannot be edited** on either platform. Reopen exists on web only. Create a loop exists on web only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Partial        | P1  |
| 8.4 | Dead actions: `addCommitment`, `completeCommitment`, `reopenCommitment`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Unused         | P2  |
| 8.5 | **Web and iOS Today disagree for the same account.** They differ in meeting window, countdown threshold, number of loops and ranking, and which conversations count as awaiting review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Inconsistent   | P2  |
| 8.6 | **Calendar never syncs in the background.** There is no cron; it syncs only on connect and on the web's "Sync now". The iPhone has no sync control. **Seen on the owner's account (25 Oct 2026):**<br>• The iPhone Account screen shows "last synced 27 Aug 2026". That is accurate: the Microsoft connection synced successfully twice, at 9:40 and 9:43 PM Chicago time on 27 Aug, minutes after it was connected.<br>• Nothing has synced since: no sync events and no later imports (one event, 29 Aug).<br>• The status still reads connected, so two months without new meetings looks healthy. The stored access token expired an hour after connecting. A refresh token renews it at the next sync, unless Microsoft has retired it after a long unused period, in which case a reconnect is needed.<br>• A second account connected on 18 Oct has never synced: it connected before the sync-at-connect code (`f75d2ac`) was deployed, and that user has not pressed "Sync now".<br>• **Related iPhone bug (2B):** the Account screen checks for status `'active'`, but the stored values are `connected`, `expired`, `revoked`, `error` and `admin_consent_required`. So it shows lowercase "connected".<br>**Smallest fix:** when Today loads (web and iPhone), if the last sync attempt is more than a few hours old, run the existing read-only `syncCalendar` after the response (`after()`), within its own one-minute limit. On the iPhone, check for `'connected'`, and say "not synced since …" when the last sync is over a day old. No schema change and no new job; calendar data changes only through the existing read-only sync. | Partial        | P1  |
| 8.7 | **A proposed action is sometimes read as a confirmed decision.** Reported by the owner on build 3 (24–25 Oct 2026). The build 4 Review example is **not** evidence of this: its transcript says "we decided", so reading it as a decision was correct. A reproducible case exists in the fallback composer, which wrote 4 of the 9 conversation analyses in the week of 19 Oct. Detail, editing and the acceptance test are below. **Phase 3 priority.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Broken (trust) | P1  |

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
3. **iOS billing: show current plan and access only.** No purchasing and no external payment links without first reviewing the applicable App Store requirements.
4. **Push notifications: deferred** until commitments and follow-through work reliably.
5. **Privacy: done in PR #16.** The wording distinguishes Atturel's handling from the transcription provider's, with no zero-retention claim unless contractually and technically verified.

6. **Photos and member discovery (owner, 25 Oct 2026; Phase 4, nothing changes now).**
   - An account holder's own photo may appear on their member profile once they opt into discoverability.
   - Photos uploaded under the current promise ("Your photo is shown only to you, in Atturel. It is not part of any public profile.") stay private until that person opts in.
   - Photos attached to private People records stay private to the owner, and are never shared with the pictured person or anyone else.
   - No discovery or photo-sharing behaviour changes in Phase 2 or 3. The current wording stays accurate until discovery ships; it changes then.

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

**iOS People search and public research (25 Oct 2026, draft PR #21, not merged)**

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

**Phase 3 — Connected experience.** See §3. It covers onboarding honesty and reliability, calendar next steps, emails, research recovery, Prepare without padding, Ask with next actions, editing confirmed loops, iOS memory review, and one definition of Today.

**Phase 4 — Member discovery.** Deferred (decision 1).

**Phase 5 — Validation.** Web end to end (Playwright) and iOS simulator flows per phase, a security review of new routes, then TestFlight and a written report.

**Test assets.** Two disposable QA accounts exist; both need the owner's approval to delete, at the end of Phase 2.

- `qa-capture-20261024@atturel-demo.dev` (user `5e9d5f6c-…`) is used for Phase 2 testing and holds its test people and records. Both earlier deletes timed out at Supabase's confirmation prompt.
- `qa-isolation-20261025@atturel-demo.dev` was created for the cross-account isolation checks.
