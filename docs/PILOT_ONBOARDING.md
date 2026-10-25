# Atturel pilot: getting started

About 20 minutes, around one real conversation you have coming up.

## What is available today

- **The website, [www.atturel.com](https://www.atturel.com).** Everything in this guide works there, on a laptop or in a phone's browser.
- **The iPhone app is in private testing (TestFlight). It is not in the App Store.** Use the website unless we have invited you to TestFlight.
- **Plans.** Free, or Pro at $29 a month.
  - Pro comes with a **14-day trial and no card**.
  - When the trial ends, your account goes back to Free unless you choose to subscribe. Nothing is deleted.

## 1. Create your account

1. Go to [www.atturel.com](https://www.atturel.com) and choose **Start free**, or **Start your 14-day trial** on the pricing page.
2. Confirm your email. The link opens atturel.com.
3. Fill in the one short "about you" screen. It opens **Today**.

## 2. Start your trial

1. Go to **Settings › Plan** and choose **Start your 14-day Pro trial**.
2. There is no card and nothing is charged. The page shows the date your trial ends, and we email you before it does.
3. **To keep Pro afterwards**, choose **Subscribe to Pro — $29/month**.
   - The page shows your first charge date before you confirm. It is the day your trial would have ended.
   - Then $29 is charged every month until you cancel.
   - If you cancel before the first charge, nothing is charged.

## 3. Add one real person

1. Go to **People › Add a person**.
2. Add someone you are about to meet: their name, plus their company and role if you know them.
3. **Optional:** on their page, **Research public footprint** looks for public professional pages about them. Nothing is added until you confirm a page is them.

## 4. Prepare for the conversation

1. Go to **Meetings › Prepare for a meeting**.
2. Say what the meeting is and what you need from it, then add the person under "Who is in the room?".
3. Read the brief before you go in.

## 5. Capture it afterwards

1. Open capture: **Conversations › Add a conversation** on a laptop, or **Capture** in a phone's browser.
2. **Paste** your notes or a transcript, **Record**, or **Upload** a file.
3. Under **Who was in it?**, tap the person you met. Commitments are attached to them.
4. Keep it. Atturel reads it for decisions and commitments.
5. In the iPhone app instead: **Capture**, record or type, then **Understand it**.

## 6. Review a commitment

1. On **Worth keeping?**, tick only what was really agreed.
   - Anything marked **Proposed, not decided** starts unticked.
   - You can edit an item before keeping it.
2. Choose **Keep what is ticked**.
3. Commitments appear on **Today**, in **Open Loops**, and on the person's page.

## 7. Tell us how it went

Two questions, by reply or to support@atturel.com:

1. Did the brief change how you walked into the conversation?
2. Was the commitment captured correctly, and did you need to correct anything?

**Your record is private to your account.** You can export or delete everything at any time from Settings.

---

## For the Atturel team (not for pilots)

- **Inviting pilots.** The owner sends the invitations; no one sends them on the owner's behalf. Use this guide as the demo agenda, around the pilot's own upcoming conversation.
- **Who and on what terms (owner, 25 Oct 2026).** Consultants and fractional leaders who manage recurring client relationships come first. Everyone gets the standard offer: the 14-day Pro trial with no card, then $29 a month if they subscribe. No one gets ongoing pilot access (invitation codes) by default.
- **iPhone access today: internal TestFlight only.**
  - Build 0.1.0 (5) is in internal testing.
  - Internal testers must be users of the App Store Connect team, up to 100. They need no Apple review.
  - The internal group (Team (Expo)) has one tester.
- **iPhone access for pilots outside the team: external TestFlight.** Being prepared, not submitted. It needs:
  - an external group with test information;
  - the reviewer demo account (`appreview@atturel.com`, created 25 Oct 2026);
  - Apple's beta review (usually about a day).

  Testers are then invited by email or a public link. Steps: `docs/IOS_TESTFLIGHT.md` §6.

- **Public App Store availability:** not submitted. How subscriptions are offered in the App Store build is still unresolved (audit §4, decisions 3 and 7).
- **Payments.** Live checkout and the no-card trial are verified on production.
  - The live payment lifecycle is not yet verified by a real transaction: a completed subscription, the first charge, a failed charge, and cancellation.
  - The first genuine pilot purchase is that evidence. Watch the webhook delivery in Stripe (Developers › Webhooks › the live endpoint).
- **Known friction.** A new account confirms its email and finishes onboarding on Today, even when it came from the trial button. The trial is started from Settings › Plan, as step 2 says. An existing user who signs in from the trial button lands on Settings › Plan.
