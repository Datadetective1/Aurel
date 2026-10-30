"""Generate photo portraits of Atturel's five fictional sample people.

Text-to-image with FLUX.1 [schnell] (Black Forest Labs, Apache 2.0 licence,
outputs free for commercial use), run on a public Hugging Face Space through
gradio_client. No reference images: each prompt describes an invented person.

Usage: python scripts/brand/sample-photos.py OUT_DIR [seeds per person]
Writes OUT_DIR/<key>-<seed>.webp, square, for picking by eye.
"""
import pathlib
import shutil
import sys

from gradio_client import Client

OUT = pathlib.Path(sys.argv[1])
PER = int(sys.argv[2]) if len(sys.argv) > 2 else 3
OUT.mkdir(parents=True, exist_ok=True)

STYLE = (
    'Professional corporate headshot photograph, head and shoulders, centred, looking at the camera, '
    'soft natural window light, plain warm neutral studio background, 85mm lens, shallow depth of field, '
    'realistic skin texture, candid and approachable'
)

PEOPLE = {
    'maya': 'a fictional East Asian woman in her early forties, sleek black chin-length bob with a side part, '
    'navy blazer over a cream blouse, calm confident slight smile',
    'daniel': 'a fictional Black man in his late forties, short dark hair greying at the temples, '
    'thin dark-rimmed glasses, white shirt, navy suit jacket, gold tie, warm friendly expression',
    'priya': 'a fictional South Asian woman in her mid thirties, long straight dark hair, '
    'rust coloured blouse, small earrings, bright natural smile',
    'lucas': 'a fictional white man in his early thirties, short tousled light brown hair, trimmed beard, '
    'dark navy crew-neck sweater, relaxed easy smile',
    'elena': 'a fictional Latina woman in her late thirties, dark brown hair in a loose bun, '
    'round tortoiseshell glasses, olive green blouse, thoughtful gentle smile',
}

SPACES = ['black-forest-labs/FLUX.1-schnell', 'evalstate/flux1_schnell']


def connect():
    last = None
    for name in SPACES:
        try:
            return name, Client(name)
        except Exception as e:  # space asleep or gone, try the next
            last = e
            print(f'{name}: {e}')
    raise SystemExit(f'no FLUX.1 schnell space reachable: {last}')


name, client = connect()
print('space', name)
for key, who in PEOPLE.items():
    for i in range(PER):
        seed = 1000 + i * 37
        prompt = f'{STYLE}, {who}'
        result = client.predict(
            prompt=prompt, seed=seed, randomize_seed=False, width=1024, height=1024,
            num_inference_steps=4, api_name='/infer',
        )
        path = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(path, dict):
            path = path.get('path') or path.get('url')
        dest = OUT / f'{key}-{seed}{pathlib.Path(str(path)).suffix or ".webp"}'
        shutil.copy(path, dest)
        print('wrote', dest)
