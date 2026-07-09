# Phase C.5b — repair the 6 entries whose step labels print letter-spaced in
# the PDF. Word boundaries are recovered from glyph GEOMETRY (inter-char x-gaps
# in pymupdf rawdict) — read from the document, never guessed. Steps for these
# 6 are re-extracted from scratch (my earlier collapse mangled their labels).
import fitz, json, re, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

KEYS = [
    'mealprep::korean bbq chicken',
    'mealprep::chilli lime chicken',
    'mealprep::honey chilli crisp chicken',
    'mealprep::korean ground beef',
    'mealprep::garlic herb chicken',
    'mealprep::nacho ground beef',
]

with open('src/data/prepiq-recipe-details.json', encoding='utf-8') as f:
    details = json.load(f)
with open('tools/extracted/macros.json', encoding='utf-8') as f:
    macros = json.load(f)

doc = fitz.open('source-pdfs/The Meal Prep Cookbook V5.pdf')
NPAGES = doc.page_count

def is_title_page(i):
    return re.search(r'Recipe\s*#\s*\d+', doc[i].get_text()) is not None

def geometry_words(page, line_text):
    """Recover word boundaries of a letter-spaced line from char x-gaps."""
    rd = page.get_text('rawdict')
    target = re.sub(r'\s+', '', line_text)
    for block in rd['blocks']:
        for line in block.get('lines', []):
            chars = [c for span in line['spans'] for c in span['chars']]
            joined = ''.join(c['c'] for c in chars if not c['c'].isspace())
            if re.sub(r'\s+', '', joined) != target:
                continue
            vis = [c for c in chars if not c['c'].isspace()]
            gaps = [round(vis[i + 1]['bbox'][0] - vis[i]['bbox'][2], 2) for i in range(len(vis) - 1)]
            if not gaps:
                return None
            small = sorted(gaps)[len(gaps) // 2]           # median = intra-word gap
            out = vis[0]['c']
            for i, g in enumerate(gaps):
                if g > small + max(1.2, small * 0.9):      # clearly larger gap = word break
                    out += ' '
                out += vis[i + 1]['c']
            return out
    return None

STEP_HEAD = re.compile(r'^z?\s*S\s*T\s*E\s*P\s*(\d+)\s*:?\s*(.*)$')
NOISE = re.compile(r'^(THE MEAL PREP COOK ?BOOK.*|Return to Table of Contents.*|\d{1,3}|»+\s*Continue|»+)$', re.I)
LETTERSPACED = re.compile(r'^(?:[A-Z]{1,2} ){3,}')

def extract(title_idx):
    end = title_idx + 1
    while end < NPAGES and not is_title_page(end):
        end += 1
    steps, cur = [], None
    for pi in range(title_idx + 1, end):
        page = doc[pi]
        text = page.get_text()
        if 'INSTRUCTIONS' in text:
            text = text.split('INSTRUCTIONS', 1)[1]
        elif not steps and cur is None:
            continue
        text = re.split(r'IMPORTANT\s+COOKING\s+NOTES|BEST\s+WAYS\s+TO\s+SERVE', text)[0]
        for ln in text.split('\n'):
            t = ln.replace('\t', ' ').strip()
            t = re.sub(r'»+$', '', t).strip()
            if not t or NOISE.match(t):
                continue
            m = STEP_HEAD.match(t)
            if m:
                if cur:
                    steps.append(re.sub(r'\s+', ' ', cur).strip())
                label = m.group(2).strip()
                if label and LETTERSPACED.match(label + ' '):
                    fixed = geometry_words(page, ln.strip())
                    if fixed:
                        fm = STEP_HEAD.match(re.sub(r'^z\s*', '', fixed)) or STEP_HEAD.match(fixed)
                        label = fm.group(2).strip() if fm else label
                    else:
                        return None, f'geometry recovery failed for: {ln.strip()!r}'
                cur = (label + ': ') if label else ''
            elif cur is not None:
                cur += t + ' '
        # page boundary: keep accumulating (continuation pages)
    if cur:
        steps.append(re.sub(r'\s+', ' ', cur).strip())
    steps = [s for s in steps if s]
    if len(steps) < 3 or any(len(s) < 25 for s in steps):
        return None, f'parse too thin ({len(steps)} steps)'
    return steps, None

ok, bad = 0, []
for key in KEYS:
    idx = macros[key]['pageIndex']
    steps, err = extract(idx)
    if err:
        bad.append((key, err))
        continue
    details['recipes'][key]['steps'] = steps
    ok += 1
    print(f'✓ {key} ({len(steps)} steps) | step1: {steps[0][:80]}')

with open('src/data/prepiq-recipe-details.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(details, f, indent=1, ensure_ascii=False)

print(f'\nfixed: {ok}/6; failed: {len(bad)}')
for k, e in bad:
    print('  FLAG:', k, '—', e)
