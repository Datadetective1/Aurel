# Sample people's photos: provenance

The five portraits here are the faces of Atturel's sample people (seeded by
`src/lib/demo/seed.ts`, shown in the app's first-run screens). The same images
ship inside the iPhone app as `mobile/assets/people/*.jpg`. They show
**fictional people**: Maya Chen, Daniel Brooks, Priya Shah, Lucas Martin and
Elena Torres do not exist, and neither do their organisations.

| File          | Fictional person | Seed |
| ------------- | ---------------- | ---- |
| `maya.webp`   | Maya Chen        | 1037 |
| `daniel.webp` | Daniel Brooks    | 1037 |
| `priya.webp`  | Priya Shah       | 1037 |
| `lucas.webp`  | Lucas Martin     | 1037 |
| `elena.webp`  | Elena Torres     | 1037 |

## How they were made

- **Generated, not photographed.** Text-to-image with FLUX.1 [schnell] by
  Black Forest Labs, run on a public Hugging Face Space through
  `scripts/brand/sample-photos.py` (the "Sample photos" GitHub workflow), on
  2026-10-30. The prompts are in that script.
- **No reference images.** Each prompt describes an invented person: age, hair,
  clothing, light. No photo of a real person, no scraped image, no celebrity
  and no customer was used as input or named.
- **Post-processing.** A square crop around the face, resized to 384×384:
  WebP here, JPEG in the app.

## Rights

FLUX.1 [schnell] is released under the Apache License 2.0, and its outputs may
be used commercially with no attribution required. Generation cost nothing.

## Rules for this folder

- Only images of fictional people with documented provenance belong here.
- Never put a user-uploaded photo, a customer's photo or a photo of a real
  person here. Everything in `public/` is served to anyone.
