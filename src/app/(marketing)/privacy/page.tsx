import type { Metadata } from 'next'
import { CircleAlert } from 'lucide-react'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'
import { providerConfigured } from '@/lib/calendar/provider'
import { features } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Privacy',
  description: `How ${brand.name} handles the information you store about your professional relationships.`,
  alternates: { canonical: '/privacy' },
}

/**
 * PRIVACY
 * =============================================================================
 * Written as an accurate description of what the software actually does, not as
 * boilerplate. Every claim here is one the implementation can be checked
 * against — which is the only way this document stays true.
 *
 * It has NOT been reviewed by a lawyer. That is stated at the top rather than
 * hidden, and it is listed in docs/HUMAN_ACTIONS.md.
 * =============================================================================
 */
export default function PrivacyPage() {
  return (
    <Container size="narrow" className="py-16 sm:py-24">
      <Eyebrow>Privacy</Eyebrow>
      <h1 className="font-display text-ink mt-4 text-4xl leading-tight">
        You are storing notes about real colleagues.
      </h1>
      <p className="text-ink-secondary mt-6 leading-relaxed">
        That deserves to be handled carefully, and described plainly. This page explains what{' '}
        {brand.name} stores, what it does with it, and what it will never do.
      </p>

      {!brand.legal.policiesLegallyReviewed ? (
        <p className="border-caution/25 bg-caution-wash text-ink-secondary mt-8 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3.5 text-sm leading-relaxed">
          <CircleAlert className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-ink font-medium">Draft.</strong> This describes the
            product&rsquo;s actual behavior accurately, but it has not yet been reviewed by a lawyer
            and is not a final legal document.
          </span>
        </p>
      ) : null}

      <div className="mt-12 grid gap-10">
        <Section title="What you store">
          <p>
            {brand.name} holds a private working record of the people you interact with
            professionally: their name and role, notes you write, observations about how it is to
            work with them, interactions you log, commitments between you, and links to public
            sources you have added.
          </p>
          <p>
            It also holds your own account details and your {brand.assessmentName}, which is built
            from answers you give.
          </p>
          <p>Depending on what you use, it can also hold:</p>
          <ul className="grid gap-2 pl-5">
            <li className="list-disc">
              Meetings you prepare for, who attends them, your objective, and the briefs generated
              for them.
            </li>
            <li className="list-disc">
              Conversations you capture: text you type or paste, and transcripts of audio you record
              or upload. {brand.name} does not keep the audio: it is used only to produce the
              transcript (see Voice recordings for how the transcription provider handles it).
            </li>
            <li className="list-disc">
              Documents you upload to read (such as a PDF), and the text extracted from them.
            </li>
            <li className="list-disc">
              If you connect a calendar: a read-only copy of your upcoming events — title, time,
              location, description, organizer, attendees and meeting link — for the next two weeks.{' '}
              {brand.name} never creates, changes or answers calendar events.
            </li>
            <li className="list-disc">
              Public web pages fetched when you research someone, kept as the cited source for any
              fact taken from them.
            </li>
            <li className="list-disc">
              Photos you upload, or suggested photos you choose to keep.
            </li>
            <li className="list-disc">
              Basic product events, such as &ldquo;a brief was generated&rdquo;, recorded by{' '}
              {brand.name} itself as counts — never the content of your notes or conversations.
            </li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            {brand.name} uses only the cookies needed to keep you signed in. There are no
            advertising cookies and no third-party trackers. Your light or dark theme choice is
            remembered on your own device.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            Only you. Every record is scoped to your account at the database level using row level
            security, so access is enforced by the database rather than by application code
            remembering to filter.
          </p>
          <p>
            {brand.name} does not show your record to the people it describes, and it is not shared
            with other users. If team workspaces are introduced, sharing will always be an explicit
            act — your private notes stay private by default.
          </p>
        </Section>

        <Section title="What we do with it">
          <p>
            Your record is used to prepare you for your own conversations: meeting briefs, message
            adaptation, and answering questions you ask about your own relationships. That is the
            entire purpose.
          </p>
          <p>
            When a language model is used, only the specific, bounded context needed for that task
            is sent — not your whole record. Your content is not used to train a shared model, and
            product analytics deliberately record only counts and enum values, never names, notes or
            message bodies.
          </p>
        </Section>

        <Section title="Public research">
          <p>
            When you research someone&rsquo;s public professional footprint, {brand.name} reads
            legitimate publicly accessible material — company biographies, conference pages,
            articles, interviews — and records what it found along with a link to the source.
          </p>
          <p>
            It does not bypass logins, paywalls or access controls, and it does not scrape platforms
            whose terms prohibit it. Every extracted fact carries the source it came from, so you
            can check it and remove it.
          </p>
          <p className="text-ink">
            Research is limited to professional context. {brand.name} does not collect or surface
            information about family, relationships, home address, health, religion, politics, or
            anything else about a person&rsquo;s private life, and it ignores such material if it
            appears in a source.
          </p>
        </Section>

        <Section title="What it will never infer">
          <p>
            {brand.name} does not infer or record race, ethnicity, religion, sexual orientation,
            gender identity, medical conditions, disability, mental health, pregnancy, age,
            political affiliation, union membership, immigration status or criminal history — about
            anyone.
          </p>
          <p>
            It also does not produce hiring, firing, promotion or compensation recommendations, or
            score anyone&rsquo;s suitability for a role.
          </p>
        </Section>

        <Section title="AI-generated content is labeled">
          <p>
            Every claim about a person carries an evidence level: confirmed, observed, inferred, or
            unknown. Guidance shows the records it was built from. Where output was composed
            deterministically rather than generated by a model, the interface says so.
          </p>
          <p>
            Nothing an AI proposes about a person enters your relationship record until you
            explicitly accept it.
          </p>
        </Section>

        <Section title="Voice recordings">
          <p>
            <strong className="text-ink font-medium">On your device.</strong> In the iPhone app, a
            recording is saved as it is made, in the app&rsquo;s private storage on your phone, so
            closing the app does not lose it. It stays there until the conversation has been kept,
            or until you discard it, and is then deleted. While it is there, it can be part of your
            phone&rsquo;s own backup. On the website, a recording is held in your browser tab until
            it is sent; it is saved on your computer only if you choose to download it after a send
            fails.
          </p>
          <p>
            <strong className="text-ink font-medium">On {brand.name}&rsquo;s servers.</strong> To
            turn speech into words, the audio is sent through our servers to our speech-to-text
            provider. It passes through for the length of that request and is never written to your
            record or our database.{' '}
            {features.captureStorage
              ? `If a long recording is uploaded in parts, each part waits in private, temporary storage that only ${brand.name}’s servers can read, is deleted as soon as it has been transcribed, and anything left behind is removed within about a day.`
              : 'A long recording is sent in parts, and each part is transcribed as it arrives; no part is stored.'}{' '}
            What is kept is the text, which you review and can edit or delete.
          </p>
          <p>
            <strong className="text-ink font-medium">At our service provider.</strong> The audio
            goes to OpenAI&rsquo;s speech-to-text service. OpenAI&rsquo;s published API data policy
            currently states that audio sent for transcription is not used to train its models and
            is not retained once transcribed. To find what was promised and decided, the text is
            then sent to OpenAI&rsquo;s language model. It is not used to train OpenAI&rsquo;s
            models, and OpenAI may keep it for up to 30 days: for abuse monitoring, and because our
            requests store the model&rsquo;s response for that period. These are OpenAI&rsquo;s
            commitments, which we rely on but cannot verify on our own systems.
          </p>
          <p>
            Before recording other people, you confirm they know. Recording happens only while the
            app is open on screen.
          </p>
        </Section>

        <Section title="Payments">
          <p>
            Payments are handled by Stripe. {brand.name} never receives or stores your card number.
            We keep what is needed to run your plan: its status, the period it covers, and the
            identifiers that link your account to your Stripe customer record.
          </p>
          <p>
            If you delete your account, a minimal billing record is kept so a billing question can
            still be answered: that an account was deleted, when, which plan it was on, and what was
            done to stop its billing. It contains none of your relationship record. Stripe keeps its
            own records of past payments, as payment processors are required to.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            {brand.name} runs on a small number of providers, each used only for the job named here:
          </p>
          <ul className="grid gap-2 pl-5">
            <li className="list-disc">Supabase — database, sign-in and file storage</li>
            <li className="list-disc">Vercel — hosting the application</li>
            <li className="list-disc">
              OpenAI — the language model behind briefs, reading conversations and answering
              questions, and speech-to-text. Only the bounded context a task needs is sent. OpenAI
              does not use it to train its models; see Voice recordings for how long OpenAI may keep
              what is sent.
            </li>
            <li className="list-disc">
              Exa — finding public professional material when you research someone
            </li>
            <li className="list-disc">Resend — sending account and product email</li>
            <li className="list-disc">Stripe — payments</li>
            <li className="list-disc">
              Google and Microsoft — reading your calendar, only if you connect one
              {providerConfigured('google')
                ? `. ${brand.name}’s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.`
                : ''}
            </li>
          </ul>
        </Section>

        <Section title="Your control">
          <p>You can, at any time and without contacting anyone:</p>
          <ul className="grid gap-2 pl-5">
            <li className="list-disc">Edit or delete any observation, note, person or source</li>
            <li className="list-disc">
              Mark a source as the wrong person, which removes what it supported
            </li>
            <li className="list-disc">
              Export your whole record — people, meetings, conversations, commitments, sources and
              what was generated from them — as one JSON file. Photos are not included in the file.
            </li>
            <li className="list-disc">
              Delete your account and destroy the entire record, from the web or inside the iPhone
              app. A paid plan billed on the web is cancelled first, so you are not charged again.
            </li>
          </ul>
          <p>
            Deleting a source removes any fact that had no other supporting evidence. Observations
            you personally confirmed are kept, because you vouched for them.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Privacy questions:{' '}
            <a
              href={`mailto:${brand.email.privacy}`}
              className="text-accent decoration-accent/40 hover:decoration-accent underline underline-offset-2"
            >
              {brand.email.privacy}
            </a>
            . Anything else:{' '}
            <a
              href={`mailto:${brand.email.support}`}
              className="text-accent decoration-accent/40 hover:decoration-accent underline underline-offset-2"
            >
              {brand.email.support}
            </a>
            .
          </p>
          <p className="text-ink-muted text-xs">
            {brand.name} is operated by {brand.legalEntity}
            {brand.legal.entityAddress ? `, ${brand.legal.entityAddress}` : ''}. Last updated{' '}
            {brand.legal.policiesLastUpdated}.
          </p>
        </Section>
      </div>
    </Container>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-ink text-xl">{title}</h2>
      <div className="text-ink-secondary mt-3 grid gap-3 leading-relaxed">{children}</div>
    </section>
  )
}
