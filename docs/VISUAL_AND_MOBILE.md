# Visual + Mobile

Built 13 October 2026 on `visual-mobile-foundation`. Additive: nothing that
worked was removed, no table was altered, and no migration was applied.

## The idea

**See → understand → act**, instead of read → read more → interpret. Every
important screen should answer within about three seconds: *who is this
about, what matters now, what should I do next.* The intelligence underneath
is unchanged; the reading burden drops.

## Pure read models — `src/lib/visual/`

Shared by the web pages, the `/api/mobile` routes and the native app.

| Module | What it is |
| --- | --- |
| `relationship-actions.ts` | A lens over the existing loops (`commitments`), not a second task system: *I owe them · Waiting on them · To revisit · My follow-up · Completed*, derived from `kind`, `owner`, `status`. |
| `timeline.ts` | The dated relationship memory: conversations, meetings, promises made and kept, decisions, notes, confirmed learnings. Titles are strings the record already holds; every entry keeps evidence level and source; proposals never appear. |
| `glance.ts` | Prep state as a fact (brief ready / no one added / not prepared) and the three *Remember* lines, **selected** from the brief and the record — never written — each with its basis. |
| `commonality.ts` | Connections drawn only where the record holds both ends: same organisation, same past employer or school in confirmed/observed facts (exact match), shared meetings, shared conversations. No family, romance, location, "possible associates". |
| `logo.ts` | Domain validation and monograms. |
| `meeting.server.ts`, `person.server.ts`, `today.server.ts`, `atlas.server.ts` | The server reads each surface needs, in one place. |

## Web surfaces

- **Meeting cockpit** on all three depths: countdown, title, faces with company marks, prep state, what you owe, other open loops.
- **Glance**: Objective · Remember (3) · the one open loop · Open with · Capture / More.
- **Quick**: modules — objective and leave-with, last time, open between you by direction, **the room** (people on an ellipse around the meeting on wide screens, stacked on phones; verified commonality in words), how to approach each person, listen for, objections behind disclosure, what isn't known.
- **Deep**: unchanged content under the cockpit and room view.
- **Person**: face first; four facts (last spoke · next · open by direction · on record since) replace the paragraph and the 0–100 pulse; open loops beside the timeline; the public footprint behind a disclosure; photo suggestion card.
- **Today**: upcoming meetings as face-first cards with prep state and open loops.
- **Atlas**: *Connections on record* with evidence marks, a legend fixing one mark per node kind, logos on organisation headers.
- **`/dev/preview`**: every visual component on invented fixtures, for review without signing in. 404 on production deployments (served on Vercel previews).

## Faces and logos

**Photos: UPLOAD → SUGGEST → CONFIRM → FALLBACK.**
Upload is unchanged. A suggestion is drawn only from a page the user already confirmed is about the person (`identity_match_status = 'confirmed'`), only from what the page declares about itself (`og:image`, `twitter:image`, schema.org `Person.image`), never from LinkedIn, Facebook, Instagram, X, TikTok, people-search sites and similar. The candidate is copied into the user's private bucket so reviewing it hotlinks nobody, shown as "Is this Columbus?" with its source, and becomes the face only on **Use photo**. **Not this person** deletes the copy and remembers the refusal. No face matching, no generated portraits. Requires migration `0020` (prepared, **not applied**); the flow hides itself until the table exists. Providers sit behind `PhotoCandidateProvider` so a licensed source can be added without touching the trust model.

**Logos** only where `organizations.domain` is on record, fetched from that domain through `/api/logo` (signed-in users only, SSRF-hardened fetcher, raster only — SVG refused — bytes sniffed, cached a day). The browser never tells a third party which companies the user is meeting. No domain or no usable icon → monogram.

## Mobile backend

- **Bearer auth on flagged routes only.** Middleware sets an internal flag header for `/api/mobile/*` and `/api/conversations/transcribe` (stripping any forged copy); `createClient()` then accepts `Authorization: Bearer <supabase access token>` and `getOptionalUser()` verifies it with `auth.getUser(token)`. Pages and server actions remain cookie-only.
- **Routes** reuse existing logic: `me`, `today`, `meetings/:id`, `people`, `people/:id`, `atlas`, `ask` (the web `ask` action), `conversations` (the web capture path, `createConversationCore`), `conversations/:id/review` (the web `submitReview`). Transcription is the existing route.
- **Contract**: `src/lib/mobile/contracts.ts`, imported by the app.

## The app — `mobile/`

See `mobile/README.md`. Expo SDK 57, Expo Router, TypeScript. Today · People · Capture · Atlas · Ask, plus Prepare (Glance/Quick/Deep), person, and *What happened* review. Recording is foreground-only with an unmissable state, pauses when the app is left, asks before recording others, and keeps no audio.

## Analytics added

`profile_photo_suggestion_found|shown`, `profile_photo_confirmed|rejected`, `mobile_today_opened`, `mobile_brief_opened`, `mobile_person_opened`, `mobile_capture_completed`, `mobile_ask_used`; `remember_lines` and `room_view` props on existing brief events. Provider ids, counts, buckets and booleans only — no names, text or URLs.
