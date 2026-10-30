import sys, pathlib
OUT = pathlib.Path(sys.argv[1])

ARCH = 'M44 240V122a76 76 0 0 1 152 0V240Z'

def torso(c):
    return f'<path d="M38 240c4-40 34-58 82-58s78 18 82 58Z" fill="{c}"/>'

def neck(skin, shade):
    return (f'<path d="M104 146v40c8 9 24 9 32 0v-40Z" fill="{skin}"/>'
            f'<path d="M104 150c7 15 25 15 32 0v-4h-32Z" fill="{shade}"/>')

def head(skin, shade):
    return (f'<ellipse cx="89" cy="122" rx="6" ry="9" fill="{skin}"/>'
            f'<ellipse cx="151" cy="122" rx="6" ry="9" fill="{skin}"/>'
            f'<path d="M89 118c0 22 13 42 31 42s31-20 31-42c0-21-13-38-31-38s-31 17-31 38Z" fill="{skin}"/>'
            # soft cheek shade on the shadow side and a nose
            f'<path d="M140 108c6 14 4 30-6 42 9-5 15-17 15-30 0-4-1-8-2-12Z" fill="{shade}" opacity=".55"/>'
            f'<path d="M121 116c3 7 5 13 1 16" stroke="{shade}" stroke-width="2.4" fill="none" stroke-linecap="round"/>')

def features(ink):
    # restrained: brows and a closed, calm mouth
    return (f'<path d="M104 112q6-4 12 0M128 112q6-4 12 0" stroke="{ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
            f'<ellipse cx="110" cy="121" rx="2.4" ry="2.9" fill="{ink}"/><ellipse cx="134" cy="121" rx="2.4" ry="2.9" fill="{ink}"/>'
            f'<path d="M113 140q7 4 14 0" stroke="{ink}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>')

def glasses(ink):
    return (f'<g fill="none" stroke="{ink}" stroke-width="2.2"><rect x="99" y="113" width="18" height="15" rx="5"/>'
            f'<rect x="123" y="113" width="18" height="15" rx="5"/><path d="M117 119h6M99 119l-8-2M141 119l8-2"/></g>')

PEOPLE = {
  'maya': dict(bg='#e7ddcc', arch='#d8c7ab', skin='#e8c4a2', shade='#d2a682', hair='#1f1b1a', ink='#2a211c', cloth='#2f3b45', accent='#b5893f'),
  'daniel': dict(bg='#dfe3dc', arch='#c7cfc3', skin='#c98f6b', shade='#ad7452', hair='#3a302b', ink='#2a1d16', cloth='#3b4a5a', accent='#b5893f'),
  'priya': dict(bg='#ecdcd3', arch='#ddc3b6', skin='#b97c56', shade='#9c6241', hair='#191513', ink='#22150f', cloth='#7a4a3a', accent='#c9a050'),
  'lucas': dict(bg='#d9e0e6', arch='#c0cbd4', skin='#f0cfb4', shade='#dcae8e', hair='#8a5a36', ink='#3a2a20', cloth='#1f2a33', accent='#b5893f'),
  'elena': dict(bg='#e6e0d0', arch='#d3c9b0', skin='#d9a77f', shade='#bf8a62', hair='#4a2c1f', ink='#2e1c14', cloth='#5d6b4f', accent='#b5893f'),
}

def svg(name, p):
    b, h = [], []  # behind-head, front-of-head
    cloth, skin, shade, hair, ink, acc = p['cloth'], p['skin'], p['shade'], p['hair'], p['ink'], p['accent']
    top = ''
    if name == 'maya':
        # sleek bob, side part
        b.append(f'<path d="M82 120c-2-30 14-48 38-48s40 18 38 48v32c0 6-5 10-11 10h-13l-4-30h-20l-4 30h-13c-6 0-11-4-11-10Z" fill="{hair}"/>')
        h.append(f'<path d="M86 118c-2-26 12-44 36-44 22 0 38 16 34 44-6-14-16-24-30-26-14-2-30 8-40 26Z" fill="{hair}"/>')
        top = (f'<path d="M86 240c6-28 18-44 34-48l-10 48Z" fill="#ffffff" opacity=".12"/>'
               f'<path d="M104 186l16 18 16-18" fill="none" stroke="#e9e3d8" stroke-width="3"/>')
        cloth_layer = torso(cloth) + f'<path d="M100 184l20 26 20-26c-6-2-12-2-20-2s-14 0-20 2Z" fill="#efe9de"/>' + f'<path d="M94 186l26 34-14 20H70c4-24 12-44 24-54Z M146 186l-26 34 14 20h36c-4-24-12-44-24-54Z" fill="#26313a"/>'
        extra = features(ink)
    elif name == 'daniel':
        h.append(f'<path d="M88 116c-3-26 10-42 32-42 24 0 36 16 32 42-2-10-8-18-14-20-12 4-30 4-42-2-4 6-7 14-8 22Z" fill="{hair}"/>')
        h.append(f'<path d="M88 112c0-6 1-10 3-14l2 18Z M152 112c0-6-1-10-3-14l-2 18Z" fill="#8e877f"/>')
        cloth_layer = (torso(cloth) + f'<path d="M102 184l18 30 18-30c-6-2-12-2-18-2s-12 0-18 2Z" fill="#f4f1ea"/>'
                       f'<path d="M116 192h8l-1 6 3 26-6 8-6-8 3-26Z" fill="{acc}"/>'
                       f'<path d="M96 186l24 40-12 14H66c4-26 14-46 30-54Z M144 186l-24 40 12 14h42c-4-26-14-46-30-54Z" fill="#2c3946"/>')
        extra = features(ink) + glasses(ink)
    elif name == 'priya':
        b.append(f'<path d="M84 118c-4-30 12-48 36-48s40 18 36 48c4 30 8 60 6 84-14 8-30 6-38-2v-50h-8v50c-8 8-24 10-38 2-2-24 2-54 6-84Z" fill="{hair}"/>')
        h.append(f'<path d="M86 122c-2-28 12-48 34-48s36 20 34 48c-8-18-20-30-34-34-14 4-26 16-34 34Z" fill="{hair}"/>')
        cloth_layer = torso(cloth) + f'<path d="M100 184c4 14 12 20 20 20s16-6 20-20c-6-2-12-2-20-2s-14 0-20 2Z" fill="{skin}"/>' + f'<path d="M100 184c4 14 12 20 20 20s16-6 20-20" fill="none" stroke="#5f3a2d" stroke-width="3"/>'
        extra = features(ink) + f'<circle cx="89" cy="134" r="3" fill="{acc}"/><circle cx="151" cy="134" r="3" fill="{acc}"/>'
    elif name == 'lucas':
        h.append(f'<path d="M86 114c-4-22 6-38 18-42 6-6 20-8 30-2 14 2 24 16 20 42-2-8-6-14-10-16-6 4-14 2-20-2-8 6-20 6-28 2-4 4-8 10-10 18Z" fill="{hair}"/>')
        h.append(f'<path d="M96 132c2 18 12 28 24 28s22-10 24-28c-4 10-12 14-24 14s-20-4-24-14Z" fill="{hair}" opacity=".85"/>')
        cloth_layer = (torso(cloth) + f'<path d="M102 183c6 10 12 16 18 16s12-6 18-16c-6-1-12-1-18-1s-12 0-18 1Z" fill="{skin}"/>'
                       f'<path d="M102 182l18 18-10 14-14-26Z M138 182l-18 18 10 14 14-26Z" fill="#e9eef2"/>')
        extra = features(ink)
    else:  # elena
        b.append(f'<circle cx="120" cy="66" r="15" fill="{hair}"/>')
        h.append(f'<path d="M88 118c-2-26 12-42 32-42s34 16 32 42c-4-14-14-24-32-26-18 2-28 12-32 26Z" fill="{hair}"/>')
        cloth_layer = torso(cloth) + f'<path d="M100 178h40v18c-12 6-28 6-40 0Z" fill="#4f5c43"/>' + f'<path d="M100 186h40M100 192h40" stroke="#46523b" stroke-width="1.5"/>'
        extra = features(ink) + glasses(ink)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">'
            f'<!-- Atturel sample person, drawn for the product. Fictional; not a likeness of anyone. -->'
            f'<rect width="240" height="240" fill="{p["bg"]}"/>'
            '<g transform="translate(120 128) scale(1.3) translate(-120 -118)">'
            f'<path d="{ARCH}" fill="{p["arch"]}"/>'
            f'<path d="M44 240V122a76 76 0 0 1 152 0V240" fill="none" stroke="{acc}" stroke-width="1.5" opacity=".55"/>'
            + ''.join(b) + neck(skin, shade) + cloth_layer + head(skin, shade) + extra + ''.join(h) + top + '</g></svg>')

OUT.mkdir(parents=True, exist_ok=True)
for n, p in PEOPLE.items():
    (OUT / f'{n}.svg').write_text(svg(n, p))
print('ok')
