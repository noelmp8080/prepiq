# Phase C.5 — re-extract steps for the 31 garbled mealprep entries, verbatim,
# using pymupdf reading order. Artifact stripping is limited to layout noise:
# page headers/footers, "» Continue" markers, letter-spaced STEP labels, tabs,
# hard line-wraps. Recipe wording is never edited. Entries that still parse
# dirty keep their OLD steps and are flagged.
import fitz, json, re, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DETAILS = 'src/data/prepiq-recipe-details.json'
with open(DETAILS, encoding='utf-8') as f:
    details = json.load(f)
with open('tools/extracted/macros.json', encoding='utf-8') as f:
    macros = json.load(f)

recipes = details['recipes']

# same artifact detector as the audit
def garbled(v):
    joined = ' '.join(v.get('steps', []))
    return bool(re.search(r'z\s*STEP\s*\d', joined)) or any(re.match(r'^[:\-]|z STEP', s) for s in v['steps'])

targets = [k for k, v in recipes.items() if k.startswith('mealprep::') and garbled(v)]
print(f'targets: {len(targets)}')

doc = fitz.open('source-pdfs/The Meal Prep Cookbook V5.pdf')
NPAGES = doc.page_count

STEP_RE = re.compile(r'z?\s*S\s*T\s*E\s*P\s*(\d+)\s*:?', re.I)
NOISE_LINES = re.compile(r'^(THE MEAL PREP COOK ?BOOK.*|Return to Table of Contents.*|\d{1,3}|»+\s*Continue|»+)$', re.I)

def page_text(i):
    return doc[i].get_text()

def is_title_page(i):
    return re.search(r'Recipe\s*#\s*\d+', page_text(i)) is not None

def extract_steps(title_idx):
    # instruction pages: title+1 .. next title page (exclusive)
    end = title_idx + 1
    while end < NPAGES and not is_title_page(end):
        end += 1
    raw = '\n'.join(page_text(i) for i in range(title_idx + 1, end))
    if 'INSTRUCTIONS' not in raw:
        return None, 'no INSTRUCTIONS header found'
    body = raw.split('INSTRUCTIONS', 1)[1]
    # cut the notes section (convention: existing clean entries exclude it)
    body = re.split(r'IMPORTANT\s+COOKING\s+NOTES', body)[0]
    # de-noise line by line
    lines = []
    for ln in body.split('\n'):
        t = ln.replace('\t', ' ').strip()
        t = re.sub(r'»+$', '', t).strip()          # trailing continuation glyphs
        if not t or NOISE_LINES.match(t):
            continue
        lines.append(t)
    flat = ' '.join(lines)
    # split on STEP markers
    parts = STEP_RE.split(flat)
    # parts = [preamble, num, text, num, text, ...]
    if len(parts) < 3:
        return None, 'no STEP markers found'
    steps = []
    for j in range(2, len(parts), 2):
        s = parts[j].strip()
        # an all-caps step label line becomes "LABEL: rest" (layout break -> punctuation)
        m = re.match(r'^([A-Z][A-Z &\'\-]{3,40}?)\s+(?=[A-Z][a-z])', s)
        if m and m.group(1).strip() == m.group(1).strip().upper():
            s = m.group(1).strip() + ': ' + s[m.end():]
        s = re.sub(r'\s+', ' ', s).strip()
        if s:
            steps.append(s)
    if len(steps) < 3:
        return None, f'only {len(steps)} steps parsed'
    if any(len(s) < 25 for s in steps):
        return None, 'suspiciously short step'
    leftover = [s for s in steps if re.search(r'z\s*S\s*T\s*E\s*P|»|\t', s)]
    if leftover:
        return None, 'artifacts remain after cleaning'
    return steps, None

updated, flagged = [], []
before_after = {}

for key in targets:
    info = macros.get(key)
    if not info or info.get('pageIndex') is None:
        flagged.append((key, 'no pageIndex in macros.json'))
        continue
    steps, err = extract_steps(info['pageIndex'])
    if err:
        flagged.append((key, err))
        continue
    before_after[key] = {'before': recipes[key]['steps'], 'after': steps}
    recipes[key]['steps'] = steps
    updated.append(key)

with open(DETAILS, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(details, f, indent=1, ensure_ascii=False)

with open('tools/extracted/c5-before-after.json', 'w', encoding='utf-8') as f:
    json.dump(before_after, f, indent=1, ensure_ascii=False)

print(f'updated cleanly: {len(updated)}')
print(f'still flagged (kept OLD steps): {len(flagged)}')
for k, e in flagged:
    print('  FLAG:', k, '—', e)
