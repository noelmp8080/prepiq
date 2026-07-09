# Phase D — extract each recipe's hero photo from its PDF page (page index
# from tools/extracted/macros.json), crop to 4:3, resize 480x360, save WebP
# <100KB to public/recipes/{id}.webp. Photos come from the PDFs only.
import fitz, json, re, io, sys
from pathlib import Path
from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

MIN_W, MIN_H = 500, 400          # anything smaller is decoration, not a hero
TARGET = (480, 360)              # 4:3
MAX_BYTES = 100 * 1024

with open('tools/extracted/macros.json', encoding='utf-8') as f:
    macros = json.load(f)

# key -> app recipe id (from the regenerated 1:1 map)
keys_src = Path('src/data/recipeDetailKeys.js').read_text(encoding='utf-8')
key_to_id = {m.group(2): int(m.group(1))
             for m in re.finditer(r'^\s*(\d+):\s*"([^"]+)"', keys_src, re.M)}

docs = {
    'jalal':    fitz.open("source-pdfs/Jalal's Cookbook V3.pdf"),
    'mealprep': fitz.open('source-pdfs/The Meal Prep Cookbook V5.pdf'),
}

out_dir = Path('public/recipes')
out_dir.mkdir(parents=True, exist_ok=True)

def crop_4x3(img):
    w, h = img.size
    tw, th = w, int(w * 3 / 4)
    if th > h:
        th, tw = h, int(h * 4 / 3)
    # portrait pages: bias the crop window slightly below center (food sits low)
    cy = 0.55 if img.height > img.width else 0.5
    left = (w - tw) // 2
    top = min(max(int(h * cy - th / 2), 0), h - th)
    return img.crop((left, top, left + tw, top + th))

def save_webp(img, path):
    for q in (80, 75, 70, 65, 60, 50):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            path.write_bytes(buf.getvalue())
            return buf.tell(), q
    path.write_bytes(buf.getvalue())   # smallest attempt
    return buf.tell(), 50

ok, flagged, total_bytes = 0, [], 0
for key, info in macros.items():
    rid = key_to_id.get(key)
    if rid is None:
        flagged.append((key, 'no id in detailKeys'))
        continue
    if info.get('pageIndex') is None:
        flagged.append((key, 'no pageIndex'))
        continue
    page = docs[info['book']][info['pageIndex']]
    cands = []
    for im in page.get_images(full=True):
        x = docs[info['book']].extract_image(im[0])
        if x['width'] >= MIN_W and x['height'] >= MIN_H:
            cands.append(x)
    if not cands:
        flagged.append((key, f'no image >= {MIN_W}x{MIN_H} on page {info["pageIndex"]}'))
        continue
    hero = max(cands, key=lambda x: x['width'] * x['height'])
    img = Image.open(io.BytesIO(hero['image'])).convert('RGB')
    img = crop_4x3(img).resize(TARGET, Image.LANCZOS)
    size, q = save_webp(img, out_dir / f'{rid}.webp')
    total_bytes += size
    ok += 1

print(f'photos extracted: {ok}/{len(macros)}')
print(f'total asset weight: {total_bytes/1024:.0f} KB ({total_bytes/1024/1024:.2f} MB)')
print(f'flagged: {len(flagged)}')
for k, e in flagged:
    print('  FLAG:', k, '—', e)
