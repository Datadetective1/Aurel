# Homepage portraits: provenance

The three portraits in this folder are used by the public homepage demo
(`src/components/marketing/home/fixtures.ts`) and by the `faces` screen of the
preview-only `/dev/preview` route. They show **fictional people**:
Elena Marsh, Theo Lindqvist and Nadia Osei do not exist, and neither do their
organisations.

| File                  | Fictional person | Generation job ID                      |
| --------------------- | ---------------- | -------------------------------------- |
| `elena-marsh.webp`    | Elena Marsh      | `826c55bd-0c27-49c4-a545-b52eb8a576b1` |
| `theo-lindqvist.webp` | Theo Lindqvist   | `854707b3-3359-4351-9e75-00cec8cce7e5` |
| `nadia-osei.webp`     | Nadia Osei       | `4c0edf06-ba10-40dd-874b-7c67d0781938` |

## How they were made

- **Generated, not photographed.** Text-to-image with the Higgsfield "Soul 2.0"
  model, on the Atturel owner's Higgsfield account, on 2026-10-24.
- **No reference images.** The prompts describe an invented person: age, hair,
  clothing, setting, light. No photo of a real person, no LinkedIn or other
  scraped image, no celebrity and no customer was used as input or named.
- **Post-processing.** A square crop centred on the face, resized to 320×320 and
  encoded as WebP (about 8–10 KB each). The originals were 1152×1536 PNG.

## Rights

The images are AI output generated under the account holder's Higgsfield
subscription. Commercial use depends on that plan's terms of service. **Before
relying on these images for paid marketing, confirm that the plan they were
generated on grants commercial rights** (see `docs/LEGAL_REVIEW_REQUIRED.md`).
If it does not, regenerate them on a plan that does, or replace them with
licensed stock and record the licence here.

## Rules for this folder

- Only images of fictional people with documented provenance belong here.
- Never put a user-uploaded photo, a customer's photo or a photo of a real person
  here. Everything in `public/` is served to anyone.
- The homepage marks the demo as an "Illustrative example · fictional people".
