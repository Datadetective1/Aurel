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
- **Privacy copy.** The in-app line said only "Atturel's servers do not keep it". It now says the audio goes through Atturel to a speech-to-text service, matching the privacy policy.
  - **Owner decision:** the policy says audio "is then deleted". That is true of Atturel's systems. OpenAI's API may keep inputs for abuse monitoring (up to 30 days) unless zero-data-retention is arranged. Confirm which applies, or qualify the sentence.

**What stays as it was**

- The web route, metering and the storage transport (`CAPTURE_STORAGE_ENABLED`, off in production).
- Background upload is not supported. Leaving the app during "Understand it" fails that attempt; the recording is kept and can be retried.

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
| 2.5 | iOS person: read-only. No edit, photo, remove, research or memory review. Cannot add a person from the People tab.                                                                                                                                                                           | Missing     | P1       |
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

| #   | Finding                                                                                                                                                                  | Status         | Sev |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --- |
| 5.1 | **The refusal to link unverified identity is correct, and stays.** A name with no company cannot auto-link (0.28 < 0.55).                                                | Implemented    | —   |
| 5.2 | Recovery asks for org, title or URL and offers a pasted link. It **never shows which candidates were rejected or why.**                                                  | Partial        | P1  |
| 5.3 | **Confirming an uncertain source extracts no facts.** It shows "No facts rest on this".                                                                                  | Broken         | P1  |
| 5.4 | The publisher label is heuristic. A loose JSON-LD match can name a host or platform instead of the original publisher. No code labels a source with the search provider. | Partial        | P2  |
| 5.5 | **Placeholder URLs look real.** `add-context.tsx` builds `https://acme.com/leadership/<real person's name>`.                                                             | Broken (trust) | P1  |
| 5.6 | Each refine re-runs research and counts against the quota again. People actions have no `maxDuration`.                                                                   | P2             | P2  |

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

| #   | Finding                                                                                                                                                                                 | Status       | Sev |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| 8.1 | Proposals are created as `proposed`. Review confirms or rejects them, and only confirmed items are active. Memory is never written without approval.                                    | Implemented  | —   |
| 8.2 | **iOS Review is keep-or-reject only**: no editing a loop's text or date. It says memory proposals "wait on each person's page", but the iOS person page cannot show or confirm them.    | Partial      | P1  |
| 8.3 | **A confirmed loop cannot be edited** on either platform. Reopen exists on web only. Create a loop exists on web only.                                                                  | Partial      | P1  |
| 8.4 | Dead actions: `addCommitment`, `completeCommitment`, `reopenCommitment`.                                                                                                                | Unused       | P2  |
| 8.5 | **Web and iOS Today disagree for the same account.** They differ in meeting window, countdown threshold, number of loops and ranking, and which conversations count as awaiting review. | Inconsistent | P2  |
| 8.6 | Calendar never syncs in the background. There is no cron; it syncs only on connect and on "Sync now".                                                                                   | Partial      | P2  |

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

**Phase 3 — Connected experience.**

- Onboarding: honest "early read" (4.2), summary written reliably (4.1), name asked once (4.3).
- Calendar: equal-weight manual path, consistent horizon, next-step button (4.4).
- Email: welcome sent at confirmation; one welcome surface; a reset-password template file (4.5, 4.6).
- Research: show rejected candidates and why; confirming extracts facts; plainly fake placeholders; publisher from the page's own host (5.2–5.5).
- Prepare: no forced padding; objective once; "composed from your records" shown; a path from brief to Capture (6.2, 6.3, 6.5).
- Ask: next actions on every answer; empty answers lead to an action; mention pending reviews (7.2).
- Loop: edit confirmed loops; reopen and create on iOS; iOS memory review; one shared definition of Today for web and iOS (8.2, 8.3, 8.5).

**Phase 4 — Member discovery.** Only after the decisions below. Behind a feature flag, with an additive migration.

**Phase 5 — Validation.**

- Playwright end to end on the web against a QA account.
- iOS simulator flows.
- Regression suites, plus a security review of every new route (RLS, bearer routes, nothing private reachable through search).
- A TestFlight build and a report per phase.

---

## 4. Decisions needed from the owner

1. **Member discovery.** Should it be built now, and how far?
   - Recommended first step: an opt-in public card (name, photo, title, organisation, short bio, each field individually chosen), findable only by **exact email**. No name browsing or fuzzy search, to prevent enumeration. Shown as "verified member" next to a contact only when the member has opted in.
   - Never reads `people`, conversations, loops, notes, calendar or history.
   - Needs a new table, RLS, a flag, and a verification rule (confirmed email only, or a domain check too).
2. **Removing a person.**
   - Default "Remove" as a reversible archive, hidden everywhere: recommended.
   - Or a hard delete that cascades their loops and evidence.
3. **iOS plan and billing.** Keep iOS read-only, with no upgrade or manage links (App Store rules on steering)? Recommended: yes.
4. **Push notifications on iOS.** A new capability. In scope now, or later?
5. **Transcription retention wording** (§1).
6. **Auth email templates.** These are applied by hand in the Supabase dashboard. I can write the files, but you have to paste them in.
